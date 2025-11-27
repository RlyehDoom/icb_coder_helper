using IndexerDb.Models;
using IndexerDb.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using DotNetEnv;

// GraphDirectoryInfo is in IndexerDb.Services namespace (already imported)

namespace IndexerDb
{
    class Program
    {
        static async Task Main(string[] args)
        {
            // Load .env file if it exists
            var envPath = Path.Combine(Directory.GetCurrentDirectory(), ".env");
            if (File.Exists(envPath))
            {
                Env.Load(envPath);
                Console.WriteLine("✓ Loaded configuration from .env file");
            }

            // Parse command line arguments
            var options = ParseArguments(args);

            if (options.ShowHelp)
            {
                DisplayUsage();
                return;
            }

            // Create host builder with minimal services
            var host = CreateHostBuilder(args).Build();

            var logger = host.Services.GetRequiredService<ILogger<Program>>();
            var fileProcessor = host.Services.GetRequiredService<IFileProcessorService>();
            var nodesExportService = host.Services.GetRequiredService<INodesExportService>();
            var inputSettings = host.Services.GetRequiredService<IConfiguration>()
                .GetSection("InputSettings").Get<InputSettings>() ?? new InputSettings();

            try
            {
                logger.LogInformation("IndexerDb v2.1 - Direct Nodes Export");

                // Show nodes collection stats
                var currentNodeCount = await nodesExportService.GetNodeCountAsync();
                var existingVersions = await nodesExportService.GetAvailableVersionsAsync();
                logger.LogInformation("📊 Nodes Collection: {Count} total | Versions: {Versions}",
                    currentNodeCount, existingVersions.Any() ? string.Join(", ", existingVersions) : "none");

                // ========================================
                // STEP 1: Select directory
                // ========================================
                var inputDirectory = Path.GetFullPath(inputSettings.InputDirectory);
                var graphDirectories = await fileProcessor.FindGraphDirectoriesAsync(inputDirectory);

                if (!graphDirectories.Any())
                {
                    logger.LogWarning("No graph directories found in: {Directory}", inputDirectory);
                    return;
                }

                GraphDirectoryInfo? selectedDirectory = null;

                if (!string.IsNullOrEmpty(options.Directory))
                {
                    // Find directory by name (case-insensitive, partial match)
                    selectedDirectory = graphDirectories.FirstOrDefault(d =>
                        d.Name.Equals(options.Directory, StringComparison.OrdinalIgnoreCase) ||
                        d.Name.Contains(options.Directory, StringComparison.OrdinalIgnoreCase));

                    if (selectedDirectory == null)
                    {
                        logger.LogError("❌ Directory not found: {Directory}", options.Directory);
                        logger.LogInformation("Available directories: {Directories}",
                            string.Join(", ", graphDirectories.Select(d => d.Name)));
                        return;
                    }
                }
                else if (graphDirectories.Count() == 1)
                {
                    selectedDirectory = graphDirectories.First();
                }
                else
                {
                    selectedDirectory = await SelectDirectoryToProcessAsync(graphDirectories, logger);
                }

                if (selectedDirectory == null)
                {
                    logger.LogInformation("No directory selected");
                    return;
                }

                logger.LogInformation("📁 Selected directory: {Directory} ({FileCount} files)",
                    selectedDirectory.Name, selectedDirectory.FileCount);

                // ========================================
                // STEP 2: Define version
                // ========================================
                var version = options.Version;
                if (string.IsNullOrEmpty(version))
                {
                    version = await PromptForVersionAsync(selectedDirectory.Name, existingVersions, logger);
                }

                if (string.IsNullOrEmpty(version))
                {
                    logger.LogInformation("No version specified");
                    return;
                }

                logger.LogInformation("🏷️  Target version: {Version}", version);

                // ========================================
                // STEP 3: Ask about cleaning (if not specified via parameter)
                // ========================================
                var shouldClean = options.CleanNodes;
                if (!options.CleanNodes && !options.ProcessAll)
                {
                    // Only ask interactively if not in automated mode
                    shouldClean = await PromptForCleanAsync(version, existingVersions, logger);
                }

                if (shouldClean)
                {
                    logger.LogWarning("⚠️  Will clean existing nodes for version {Version}", version);
                }

                // Get files from selected directory
                var availableFiles = selectedDirectory.Files;

                // Select files to process (if not --all)
                IEnumerable<string> filesToProcess = options.ProcessAll
                    ? availableFiles
                    : await SelectFilesToProcessAsync(availableFiles, logger);

                if (!filesToProcess.Any())
                {
                    logger.LogInformation("No files selected");
                    return;
                }

                // Process files and export directly to nodes collection
                int totalNodes = 0;
                bool isFirstFile = true;

                foreach (var filePath in filesToProcess)
                {
                    try
                    {
                        logger.LogInformation("📄 Processing: {FileName}", Path.GetFileName(filePath));

                        var graphDocument = await fileProcessor.ProcessGraphFileAsync(filePath);
                        if (graphDocument == null)
                        {
                            logger.LogError("Failed to parse: {FilePath}", filePath);
                            continue;
                        }

                        var solutionName = !string.IsNullOrEmpty(graphDocument.Metadata?.SolutionPath)
                            ? Path.GetFileNameWithoutExtension(graphDocument.Metadata.SolutionPath)
                            : Path.GetFileNameWithoutExtension(filePath).Replace("-graph", "");

                        var nodesExported = await nodesExportService.ExportGraphDocumentDirectAsync(
                            graphDocument,
                            solutionName,
                            version,
                            cleanFirst: isFirstFile && shouldClean
                        );

                        totalNodes += nodesExported;
                        isFirstFile = false;
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Failed to process: {FilePath}", filePath);
                    }
                }

                var totalInDb = await nodesExportService.GetNodeCountByVersionAsync(version);
                logger.LogInformation("✅ COMPLETE: {Processed} nodes processed | Unique in DB v{Version}: {Total}",
                    totalNodes, version, totalInDb);

                if (totalNodes > totalInDb)
                {
                    logger.LogInformation("   ℹ️  {Duplicates} nodes were updates (same ID across multiple files)",
                        totalNodes - totalInDb);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error processing graph files");
            }
        }

        private static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureAppConfiguration((context, config) =>
                {
                    var env = context.HostingEnvironment;
                    config.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
                    config.AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true, reloadOnChange: true);
                    config.AddEnvironmentVariables();
                })
                .ConfigureServices((context, services) =>
                {
                    // Configuration
                    services.Configure<MongoDbSettings>(context.Configuration.GetSection("MongoDB"));
                    services.Configure<InputSettings>(context.Configuration.GetSection("InputSettings"));

                    // Services (minimal - only what's needed for nodes export)
                    services.AddSingleton<INdjsonProcessorService, NdjsonProcessorService>();
                    services.AddSingleton<IFileProcessorService, FileProcessorService>();
                    services.AddSingleton<INodesExportService, NodesExportService>();

                    services.AddLogging(builder => builder.AddConsole());
                });

        private static CommandLineOptions ParseArguments(string[] args)
        {
            var options = new CommandLineOptions();

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLower())
                {
                    case "--all":
                        options.ProcessAll = true;
                        break;

                    case "--version":
                    case "-v":
                        if (i + 1 < args.Length)
                            options.Version = args[++i];
                        break;

                    case "--directory":
                    case "--dir":
                    case "-d":
                        if (i + 1 < args.Length)
                            options.Directory = args[++i];
                        break;

                    case "--clean":
                    case "--clean-nodes":
                        options.CleanNodes = true;
                        break;

                    case "--help":
                    case "-h":
                        options.ShowHelp = true;
                        break;
                }
            }

            return options;
        }

        private static void DisplayUsage()
        {
            Console.WriteLine("IndexerDb v2.1 - Direct Nodes Export");
            Console.WriteLine();
            Console.WriteLine("Usage: IndexerDb [options]");
            Console.WriteLine();
            Console.WriteLine("Options:");
            Console.WriteLine("  --directory, -d <dir> Graph directory name or partial match (e.g., ICB6, ICB7C)");
            Console.WriteLine("  --version, -v <ver>   Version tag (e.g., 6.5.0, 7.10.2)");
            Console.WriteLine("  --all                 Process all files (no file selection menu)");
            Console.WriteLine("  --clean               Clean existing nodes for this version first");
            Console.WriteLine("  --help, -h            Show this help");
            Console.WriteLine();
            Console.WriteLine("Interactive Flow (no parameters):");
            Console.WriteLine("  1. Select graph directory (if multiple exist)");
            Console.WriteLine("  2. Enter version tag");
            Console.WriteLine("  3. Select files to process (unless --all)");
            Console.WriteLine();
            Console.WriteLine("Examples:");
            Console.WriteLine("  IndexerDb                                    (fully interactive)");
            Console.WriteLine("  IndexerDb -d ICB6 -v 6.5.0 --all             (automated)");
            Console.WriteLine("  IndexerDb -d ICB7C -v 7.10.2 --all --clean   (automated with clean)");
            Console.WriteLine();
            Console.WriteLine("Output:");
            Console.WriteLine("  MongoDB collection: nodes_{version} (e.g., nodes_6_5_0)");
            Console.WriteLine("  Schema: JSON-LD with semantic IDs");
            Console.WriteLine("  Format: grafo:{kind}/{project}/{identifier}");
        }

        private static Task<bool> PromptForCleanAsync(string version, IEnumerable<string> existingVersions, ILogger<Program> logger)
        {
            // Check if this version already exists
            var versionExists = existingVersions.Any(v => v.Equals(version, StringComparison.OrdinalIgnoreCase));

            if (versionExists)
            {
                Console.WriteLine();
                Console.WriteLine($"⚠️  Version {version} already exists in the database.");
                Console.Write($"🗑️  Clean existing nodes for v{version} before import? (y/n): ");

                var input = Console.ReadLine()?.Trim().ToLower();
                return Task.FromResult(input == "y" || input == "yes" || input == "s" || input == "si");
            }

            // New version - no need to clean
            return Task.FromResult(false);
        }

        private static Task<string?> PromptForVersionAsync(string directoryName, IEnumerable<string> existingVersions, ILogger<Program> logger)
        {
            Console.WriteLine();
            Console.WriteLine(new string('=', 60));
            Console.WriteLine($"📁 Directory: {directoryName}");

            if (existingVersions.Any())
            {
                Console.WriteLine($"📊 Existing versions in DB: {string.Join(", ", existingVersions)}");
            }

            Console.WriteLine(new string('=', 60));
            Console.WriteLine("🏷️  Enter the version tag for this graph (e.g., 6.5.0, 7.10.2):");
            Console.WriteLine("   This will be used to create collection: nodes_{version}");
            Console.WriteLine();

            while (true)
            {
                Console.Write("Version: ");
                var input = Console.ReadLine()?.Trim();

                if (string.IsNullOrEmpty(input))
                {
                    Console.WriteLine("Version cannot be empty. Enter a version tag or Ctrl+C to cancel.");
                    continue;
                }

                // Basic validation: should look like a version (contains at least one dot and numbers)
                if (!input.Contains('.') || !input.Any(char.IsDigit))
                {
                    Console.WriteLine($"'{input}' doesn't look like a version. Expected format: X.Y.Z (e.g., 6.5.0)");
                    Console.Write("Use anyway? (y/n): ");
                    var confirm = Console.ReadLine()?.Trim().ToLower();
                    if (confirm != "y" && confirm != "yes")
                        continue;
                }

                return Task.FromResult<string?>(input);
            }
        }

        private static Task<GraphDirectoryInfo?> SelectDirectoryToProcessAsync(IEnumerable<GraphDirectoryInfo> directories, ILogger<Program> logger)
        {
            var dirList = directories.ToList();

            if (!dirList.Any())
            {
                Console.WriteLine("No graph directories found.");
                return Task.FromResult<GraphDirectoryInfo?>(null);
            }

            Console.WriteLine($"\n📁 Found {dirList.Count} graph directories:");
            Console.WriteLine(new string('=', 60));

            for (int i = 0; i < dirList.Count; i++)
            {
                Console.WriteLine($"{i + 1,2}. {dirList[i].Name,-35} ({dirList[i].FileCount} files)");
            }

            Console.WriteLine(new string('=', 60));
            Console.WriteLine("⚠️  Select ONE directory to process (enter number or 'none'):");

            while (true)
            {
                Console.Write("Selection: ");
                var input = Console.ReadLine()?.Trim();

                if (string.IsNullOrEmpty(input) || input.ToLower() == "none")
                    return Task.FromResult<GraphDirectoryInfo?>(null);

                if (int.TryParse(input, out int idx) && idx >= 1 && idx <= dirList.Count)
                    return Task.FromResult<GraphDirectoryInfo?>(dirList[idx - 1]);

                Console.WriteLine($"Invalid selection: {input}. Enter a number between 1 and {dirList.Count}");
            }
        }

        private static Task<IEnumerable<string>> SelectFilesToProcessAsync(IEnumerable<string> availableFiles, ILogger<Program> logger)
        {
            var fileList = availableFiles.ToList();

            if (!fileList.Any())
            {
                Console.WriteLine("No graph files found.");
                return Task.FromResult(Enumerable.Empty<string>());
            }

            Console.WriteLine($"\nFound {fileList.Count} graph files:");
            Console.WriteLine(new string('=', 50));

            for (int i = 0; i < fileList.Count; i++)
            {
                var fileName = Path.GetFileName(fileList[i]);
                var directory = Path.GetFileName(Path.GetDirectoryName(fileList[i]));
                Console.WriteLine($"{i + 1,2}. {fileName} (in {directory})");
            }

            Console.WriteLine(new string('=', 50));
            Console.WriteLine("Enter: numbers (1,2,3), 'all', or 'none'");

            while (true)
            {
                Console.Write("Selection: ");
                var input = Console.ReadLine()?.Trim();

                if (string.IsNullOrEmpty(input) || input.ToLower() == "none")
                    return Task.FromResult(Enumerable.Empty<string>());

                if (input.ToLower() == "all")
                    return Task.FromResult<IEnumerable<string>>(fileList);

                var selectedFiles = new List<string>();
                var parts = input.Split(',', StringSplitOptions.RemoveEmptyEntries);
                var valid = true;

                foreach (var part in parts)
                {
                    if (int.TryParse(part.Trim(), out int idx) && idx >= 1 && idx <= fileList.Count)
                        selectedFiles.Add(fileList[idx - 1]);
                    else
                    {
                        Console.WriteLine($"Invalid: {part.Trim()}");
                        valid = false;
                        break;
                    }
                }

                if (valid)
                    return Task.FromResult<IEnumerable<string>>(selectedFiles.Distinct());
            }
        }

        private class CommandLineOptions
        {
            public bool ProcessAll { get; set; } = false;
            public bool ShowHelp { get; set; } = false;
            public string? Version { get; set; } = null;
            public string? Directory { get; set; } = null;
            public bool CleanNodes { get; set; } = false;
        }
    }
}
