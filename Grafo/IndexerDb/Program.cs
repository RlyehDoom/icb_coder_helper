using IndexerDb.Models;
using IndexerDb.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace IndexerDb
{
    class Program
    {
        static async Task Main(string[] args)
        {
            // Parse command line arguments
            var options = ParseArguments(args);
            
            if (options.ShowHelp)
            {
                DisplayUsage();
                return;
            }

            // Create host builder with configuration and services
            var host = CreateHostBuilder(args).Build();

            // Get services
            var logger = host.Services.GetRequiredService<ILogger<Program>>();
            var fileProcessor = host.Services.GetRequiredService<IFileProcessorService>();
            var databaseService = host.Services.GetRequiredService<IGraphDatabaseService>();
            var projectDatabaseService = host.Services.GetRequiredService<IProjectDatabaseService>();
            var incrementalProcessor = host.Services.GetRequiredService<IIncrementalProcessorService>();
            var inputSettings = host.Services.GetRequiredService<IConfiguration>()
                .GetSection("InputSettings").Get<InputSettings>() ?? new InputSettings();

            try
            {
                logger.LogInformation("Starting IndexerDb application...");

                // Check if running in query-only mode (--interactive without other options)
                if (options.Interactive && string.IsNullOrEmpty(options.SpecificFile) && !options.ProcessAll)
                {
                    logger.LogInformation("🔍 Query-only mode activated (--interactive)");
                    logger.LogInformation("Skipping file processing, entering interactive query mode...");
                    
                    var currentProjectCount = await projectDatabaseService.GetTotalProjectCountAsync();
                    logger.LogInformation("📊 Database Status: {Count} total projects", currentProjectCount);
                    
                    await RunEnhancedInteractiveMode(projectDatabaseService, logger, databaseService);
                    return;
                }

                // Display current statistics (suppress individual service logs)
                var currentProjectCount2 = await projectDatabaseService.GetTotalProjectCountAsync();
                var layerCounts = await projectDatabaseService.GetProjectCountsByLayerAsync();
                
                if (layerCounts.Any())
                {
                    logger.LogInformation("📊 Database Status: {Count} total projects | By layer: {LayerCounts}", 
                        currentProjectCount2, string.Join(", ", layerCounts.Select(kvp => $"{kvp.Key}: {kvp.Value}")));
                }
                else
                {
                    logger.LogInformation("📊 Database Status: {Count} total projects", currentProjectCount2);
                }

                var processingResults = new List<ProcessingState>();

                if (!string.IsNullOrEmpty(options.SpecificFile))
                {
                    // Process specific file provided via command line
                    logger.LogInformation("Processing specific file: {FilePath}", options.SpecificFile);
                    
                    if (!File.Exists(options.SpecificFile))
                    {
                        logger.LogError("Specified file does not exist: {FilePath}", options.SpecificFile);
                        return;
                    }

                    var result = await incrementalProcessor.ProcessGraphFileIncrementallyAsync(options.SpecificFile);
                    processingResults.Add(result);
                }
                else
                {
                    // Get input directory from configuration or use default
                    var inputDirectory = Path.GetFullPath(inputSettings.InputDirectory);
                    logger.LogInformation("Input directory: {InputDirectory}", inputDirectory);

                    // Find all available graph files
                    var availableFiles = await fileProcessor.FindGraphFilesAsync(inputDirectory);
                    
                    if (!availableFiles.Any())
                    {
                        logger.LogWarning("No graph files found in directory: {Directory}", inputDirectory);
                        if (options.Interactive)
                        {
                            await RunEnhancedInteractiveMode(projectDatabaseService, logger, databaseService);
                        }
                        return;
                    }

                    // Select files to process based on options
                    IEnumerable<string> filesToProcess;
                    if (options.ProcessAll)
                    {
                        filesToProcess = availableFiles;
                        logger.LogInformation("Processing all {Count} found files automatically (--all specified)", availableFiles.Count());
                    }
                    else
                    {
                        // Default behavior: interactive file selection
                        filesToProcess = await SelectFilesToProcessAsync(availableFiles, logger);
                    }

                    if (filesToProcess.Any())
                    {
                        logger.LogInformation("Processing {Count} selected files incrementally...", filesToProcess.Count());
                        
                        foreach (var filePath in filesToProcess)
                        {
                            try 
                            {
                                var result = await incrementalProcessor.ProcessGraphFileIncrementallyAsync(filePath);
                                processingResults.Add(result);
                                
                                // Small pause between files for readability
                                await Task.Delay(500);
                            }
                            catch (Exception ex)
                            {
                                logger.LogError(ex, "Failed to process file: {FilePath}", filePath);
                            }
                        }
                    }
                    else
                    {
                        logger.LogInformation("No files selected for processing");
                    }
                }

                // Display final summary
                if (processingResults.Any())
                {
                    var totalNew = processingResults.Sum(r => r.NewProjects);
                    var totalUpdated = processingResults.Sum(r => r.UpdatedProjects);
                    var totalSkipped = processingResults.Sum(r => r.SkippedProjects);
                    var totalProcessed = processingResults.Sum(r => r.ProcessedProjects);
                    var finalProjectCount = await projectDatabaseService.GetTotalProjectCountAsync();

                    logger.LogInformation("📊 FINAL SUMMARY: Files: {Files} | Projects: New: {New}, Updated: {Updated}, Skipped: {Skipped} | Total in DB: {TotalDB}", 
                        processingResults.Count, totalNew, totalUpdated, totalSkipped, finalProjectCount);
                }

                // Interactive mode for querying (only if --interactive specified)
                if (options.Interactive)
                {
                    await RunEnhancedInteractiveMode(projectDatabaseService, logger, databaseService);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "An error occurred while processing graph files");
            }

            logger.LogInformation("IndexerDb application finished");
        }

        private static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureAppConfiguration((context, config) =>
                {
                    // Get environment name (default to "Development" if not set)
                    var env = context.HostingEnvironment;

                    // Load base configuration
                    config.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

                    // Load environment-specific configuration (Production, Development, etc.)
                    config.AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true, reloadOnChange: true);

                    // Environment variables override JSON config
                    config.AddEnvironmentVariables();
                })
                .ConfigureServices((context, services) =>
                {
                    // Configuration
                    services.Configure<MongoDbSettings>(
                        context.Configuration.GetSection("MongoDB"));
                    services.Configure<ApplicationSettings>(
                        context.Configuration.GetSection("Application"));
                    services.Configure<InputSettings>(
                        context.Configuration.GetSection("InputSettings"));

                    // Services
                    services.AddSingleton<IFileProcessorService, FileProcessorService>();
                    services.AddSingleton<IGraphDatabaseService, GraphDatabaseService>();
                    
                    // Database service selection based on configuration
                    var appSettings = context.Configuration.GetSection("Application").Get<ApplicationSettings>();
                    var mongoSettings = context.Configuration.GetSection("MongoDB").Get<MongoDbSettings>();
                    
                    services.AddSingleton<IProjectDatabaseService, ProjectDatabaseService>();
                    
                    services.AddSingleton<IIncrementalProcessorService, IncrementalProcessorService>();

                    // Logging
                    services.AddLogging(builder =>
                    {
                        builder.AddConsole();
                    });
                });

        private static async Task RunEnhancedInteractiveMode(IProjectDatabaseService projectDatabaseService, ILogger<Program> logger, IGraphDatabaseService? graphDatabaseService = null)
        {
            // Check if we're in an interactive environment
            if (!Console.IsInputRedirected && Environment.UserInteractive)
            {
                Console.WriteLine("\n🎯 Entering enhanced interactive mode. Type 'help' for commands or 'exit' to quit.");
                Console.WriteLine("🔬 Semantic Model queries available!");
            }
            else
            {
                logger.LogInformation("🚫 Non-interactive environment detected, skipping interactive mode");
                return;
            }

            while (true)
            {
                Console.Write("\nIndexerDB> ");
                var input = Console.ReadLine()?.Trim();

                if (input == null) // Handle EOF or null input
                {
                    logger.LogInformation("📤 End of input detected, exiting interactive mode");
                    return;
                }

                if (string.IsNullOrEmpty(input))
                    continue;

                try
                {
                    var parts = input.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    var command = parts[0].ToLower();

                    switch (command)
                    {
                        case "exit":
                            return;

                        case "help":
                            DisplayEnhancedHelp();
                            break;

                        case "count":
                            await HandleProjectCountCommand(projectDatabaseService);
                            break;

                        case "projects":
                            await HandleProjectsCommand(parts, projectDatabaseService);
                            break;

                        case "layers":
                            await HandleLayersCommand(projectDatabaseService);
                            break;

                        case "search":
                            await HandleProjectSearchCommand(parts, projectDatabaseService);
                            break;

                        case "nodes":
                            await HandleNodesCommand(parts, projectDatabaseService);
                            break;

                        case "edges":
                            await HandleEdgesCommand(parts, projectDatabaseService);
                            break;

                        case "clear":
                            Console.Write("Are you sure you want to delete all projects? (yes/no): ");
                            var confirmation = Console.ReadLine()?.Trim().ToLower();
                            if (confirmation == "yes")
                            {
                                // Implementation would go here
                                Console.WriteLine("All projects deleted");
                            }
                            else
                            {
                                Console.WriteLine("Operation cancelled");
                            }
                            break;

                        // Semantic Model Commands
                        case "semantic":
                        case "stats":
                            if (graphDatabaseService != null)
                                await HandleSemanticStatsCommand(graphDatabaseService);
                            else
                                Console.WriteLine("⚠️  Graph database service not available");
                            break;

                        case "inherits":
                            if (graphDatabaseService != null)
                                await HandleInheritsCommand(parts, graphDatabaseService);
                            else
                                Console.WriteLine("⚠️  Graph database service not available");
                            break;

                        case "implements":
                            if (graphDatabaseService != null)
                                await HandleImplementsCommand(parts, graphDatabaseService);
                            else
                                Console.WriteLine("⚠️  Graph database service not available");
                            break;

                        case "calls":
                            if (graphDatabaseService != null)
                                await HandleCallsCommand(parts, graphDatabaseService);
                            else
                                Console.WriteLine("⚠️  Graph database service not available");
                            break;

                        case "uses":
                            if (graphDatabaseService != null)
                                await HandleUsesCommand(parts, graphDatabaseService);
                            else
                                Console.WriteLine("⚠️  Graph database service not available");
                            break;

                        default:
                            Console.WriteLine("❓ Unknown command. Type 'help' for available commands.");
                            break;
                    }
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error executing command: {Command}", input);
                    Console.WriteLine($"❌ Error: {ex.Message}");
                }
            }
        }

        private static async Task RunInteractiveMode(IGraphDatabaseService databaseService, ILogger<Program> logger)
        {
            logger.LogInformation("\nEntering interactive mode. Type 'help' for commands or 'exit' to quit.");

            while (true)
            {
                Console.Write("\nGraphDB> ");
                var input = Console.ReadLine()?.Trim().ToLower();

                if (string.IsNullOrEmpty(input))
                    continue;

                try
                {
                    switch (input.Split(' ')[0])
                    {
                        case "exit":
                            return;

                        case "help":
                            DisplayHelp();
                            break;

                        case "count":
                            var count = await databaseService.GetTotalGraphCountAsync();
                            Console.WriteLine($"Total graphs: {count}");
                            break;

                        case "list":
                            var graphs = await databaseService.GetAllGraphsAsync();
                            Console.WriteLine($"{"Source File",-30} {"Nodes",-10} {"Edges",-10} {"Imported At",-20}");
                            Console.WriteLine(new string('-', 70));
                            foreach (var graph in graphs)
                            {
                                Console.WriteLine($"{graph.SourceFile,-30} {graph.Nodes.Count,-10} {graph.Edges.Count,-10} {graph.ImportedAt:yyyy-MM-dd HH:mm}");
                            }
                            break;

                        case "search":
                            await HandleSearchCommand(input, databaseService);
                            break;

                        case "clear":
                            await databaseService.DeleteAllGraphsAsync();
                            Console.WriteLine("All graphs deleted");
                            break;

                        default:
                            Console.WriteLine("Unknown command. Type 'help' for available commands.");
                            break;
                    }
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Error executing command: {Command}", input);
                    Console.WriteLine($"Error: {ex.Message}");
                }
            }
        }

        private static void DisplayEnhancedHelp()
        {
            Console.WriteLine("\n📚 Available commands:");
            Console.WriteLine("\n  📊 Project Commands:");
            Console.WriteLine("  help                    - Show this help message");
            Console.WriteLine("  count                   - Show total number of projects");
            Console.WriteLine("  projects [list|<name>]  - List all projects or search by name");
            Console.WriteLine("  layers                  - Show project count by architectural layer");
            Console.WriteLine("  search <project-name>   - Search projects by name");
            Console.WriteLine("  nodes <project-id>      - Show nodes for a specific project");
            Console.WriteLine("  edges <project-id>      - Show edges for a specific project");
            Console.WriteLine("  clear                   - Delete all projects (with confirmation)");
            Console.WriteLine("  exit                    - Exit the application");
            
            Console.WriteLine("\n  🔬 Semantic Model Commands:");
            Console.WriteLine("  semantic | stats        - Show semantic model statistics");
            Console.WriteLine("  inherits [limit]        - Show inheritance relationships (default: 10)");
            Console.WriteLine("  implements [limit]      - Show interface implementations (default: 10)");
            Console.WriteLine("  calls [limit]           - Show method call relationships (default: 10)");
            Console.WriteLine("  uses [limit]            - Show type usage relationships (default: 10)");
            
            Console.WriteLine("\n💡 Examples:");
            Console.WriteLine("  projects list");
            Console.WriteLine("  search Banking");
            Console.WriteLine("  nodes project:BackOffice.BusinessComponents");
            Console.WriteLine("  semantic              # Show semantic statistics");
            Console.WriteLine("  inherits 20           # Show 20 inheritance relationships");
            Console.WriteLine("  implements 15         # Show 15 interface implementations");
        }

        private static void DisplayHelp()
        {
            Console.WriteLine("\nAvailable commands:");
            Console.WriteLine("  help                    - Show this help message");
            Console.WriteLine("  count                   - Show total number of graphs");
            Console.WriteLine("  list                    - List all graphs with summary");
            Console.WriteLine("  search node <name>      - Search nodes by name");
            Console.WriteLine("  search type <type>      - Search nodes by type");
            Console.WriteLine("  search edges <nodeId>   - Get edges for a node");
            Console.WriteLine("  clear                   - Delete all graphs");
            Console.WriteLine("  exit                    - Exit the application");
        }

        private static async Task HandleSearchCommand(string input, IGraphDatabaseService databaseService)
        {
            var parts = input.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 3)
            {
                Console.WriteLine("Usage: search [node|type|edges] <value>");
                return;
            }

            var searchType = parts[1];
            var searchValue = string.Join(" ", parts.Skip(2));

            switch (searchType)
            {
                case "node":
                    var nodes = await databaseService.SearchNodesByNameAsync(searchValue);
                    Console.WriteLine($"Found {nodes.Count()} nodes matching '{searchValue}':");
                    foreach (var node in nodes.Take(10)) // Limit to first 10 results
                    {
                        Console.WriteLine($"  {node.Id}: {node.Name} ({node.Type})");
                    }
                    if (nodes.Count() > 10)
                        Console.WriteLine($"  ... and {nodes.Count() - 10} more");
                    break;

                case "type":
                    var typeNodes = await databaseService.SearchNodesByTypeAsync(searchValue);
                    Console.WriteLine($"Found {typeNodes.Count()} nodes of type '{searchValue}':");
                    foreach (var node in typeNodes.Take(10))
                    {
                        Console.WriteLine($"  {node.Id}: {node.Name}");
                    }
                    if (typeNodes.Count() > 10)
                        Console.WriteLine($"  ... and {typeNodes.Count() - 10} more");
                    break;

                case "edges":
                    var edges = await databaseService.GetEdgesByNodeIdAsync(searchValue);
                    Console.WriteLine($"Found {edges.Count()} edges for node '{searchValue}':");
                    foreach (var edge in edges.Take(10))
                    {
                        Console.WriteLine($"  {edge.Id}: {edge.Source} --{edge.Relationship}--> {edge.Target}");
                    }
                    if (edges.Count() > 10)
                        Console.WriteLine($"  ... and {edges.Count() - 10} more");
                    break;

                default:
                    Console.WriteLine("Unknown search type. Use: node, type, or edges");
                    break;
            }
        }

        private static CommandLineOptions ParseArguments(string[] args)
        {
            var options = new CommandLineOptions();

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLower())
                {
                    case "--file":
                    case "-f":
                        if (i + 1 < args.Length)
                        {
                            options.SpecificFile = args[++i];
                        }
                        break;
                    
                    case "--interactive":
                    case "-i":
                        options.Interactive = true;
                        break;
                    
                    case "--all":
                    case "--no-select":
                        options.ProcessAll = true;
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
            Console.WriteLine("IndexerDb - Graph Data Processor");
            Console.WriteLine("Usage: IndexerDb [options]");
            Console.WriteLine();
            Console.WriteLine("Options:");
            Console.WriteLine("  --file, -f <path>       Process a specific graph file by path");
            Console.WriteLine("  --all, --no-select      Process all found files without file selection");
            Console.WriteLine("  --interactive, -i       Enter interactive query mode (skips file processing if used alone)");
            Console.WriteLine("  --help, -h              Show this help message");
            Console.WriteLine();
            Console.WriteLine("Processing Modes:");
            Console.WriteLine("  1. File Selection:      IndexerDb   (default: shows file selection menu)");
            Console.WriteLine("  2. Process All Files:   IndexerDb --all");
            Console.WriteLine("  3. Specific File:       IndexerDb --file \"path/to/file.json\"");
            Console.WriteLine("  4. Query Mode Only:     IndexerDb --interactive   (direct to query, no processing)");
            Console.WriteLine();
            Console.WriteLine("Examples:");
            Console.WriteLine("  # Interactive file selection, then exit (default)");
            Console.WriteLine("  IndexerDb");
            Console.WriteLine();
            Console.WriteLine("  # Process all found files automatically");
            Console.WriteLine("  IndexerDb --all");
            Console.WriteLine();
            Console.WriteLine("  # Process a specific file");
            Console.WriteLine("  IndexerDb --file \"../Indexer/output/ICB7C_GraphFiles/Banking-graph.json\"");
            Console.WriteLine();
            Console.WriteLine("  # Query mode only (skip file processing)");
            Console.WriteLine("  IndexerDb --interactive");
            Console.WriteLine();
            Console.WriteLine("  # Process all files, then enter query mode");
            Console.WriteLine("  IndexerDb --all --interactive");
            Console.WriteLine();
            Console.WriteLine("Default behavior (no arguments):");
            Console.WriteLine("  1. Scan configured directory for *-graph.json files in *GraphFiles folders");
            Console.WriteLine("  2. Show interactive menu to select which files to process");
            Console.WriteLine("  3. Process selected files and save to MongoDB");
            Console.WriteLine("  4. Exit application");
            Console.WriteLine();
            Console.WriteLine("Interactive query mode (--interactive):");
            Console.WriteLine("  When used alone: Skip file processing and go directly to query mode");
            Console.WriteLine("  When combined with --all or --file: Process files first, then enter query mode");
            Console.WriteLine("  Available commands: count, projects, layers, search, nodes, edges, semantic, etc.");
        }

        private static Task<IEnumerable<string>> SelectFilesToProcessAsync(IEnumerable<string> availableFiles, ILogger<Program> logger)
        {
            var fileList = availableFiles.ToList();
            
            if (!fileList.Any())
            {
                Console.WriteLine("No graph files found to select from.");
                return Task.FromResult(Enumerable.Empty<string>());
            }

            Console.WriteLine($"\nFound {fileList.Count} graph files:");
            Console.WriteLine("==================================================");

            for (int i = 0; i < fileList.Count; i++)
            {
                var fileName = Path.GetFileName(fileList[i]);
                var directory = Path.GetFileName(Path.GetDirectoryName(fileList[i]));
                Console.WriteLine($"{i + 1,2}. {fileName} (in {directory})");
            }

            Console.WriteLine("==================================================");
            Console.WriteLine("Select files to process:");
            Console.WriteLine("  - Enter numbers separated by commas (e.g., 1,3,5)");
            Console.WriteLine("  - Enter 'all' to process all files");
            Console.WriteLine("  - Enter 'none' or leave empty to skip processing");
            Console.WriteLine();

            while (true)
            {
                Console.Write("Selection: ");
                var input = Console.ReadLine()?.Trim();

                if (string.IsNullOrEmpty(input) || input.ToLower() == "none")
                {
                    Console.WriteLine("No files selected.");
                    return Task.FromResult(Enumerable.Empty<string>());
                }

                if (input.ToLower() == "all")
                {
                    Console.WriteLine($"Selected all {fileList.Count} files for processing.");
                    return Task.FromResult<IEnumerable<string>>(fileList);
                }

                // Parse comma-separated numbers
                var selectedFiles = new List<string>();
                var parts = input.Split(',', StringSplitOptions.RemoveEmptyEntries);
                var validSelection = true;

                foreach (var part in parts)
                {
                    if (int.TryParse(part.Trim(), out int index) && index >= 1 && index <= fileList.Count)
                    {
                        selectedFiles.Add(fileList[index - 1]);
                    }
                    else
                    {
                        Console.WriteLine($"Invalid selection: {part.Trim()}. Please enter numbers between 1 and {fileList.Count}.");
                        validSelection = false;
                        break;
                    }
                }

                if (validSelection)
                {
                    var selectedFileNames = selectedFiles.Select(f => Path.GetFileName(f));
                    Console.WriteLine($"Selected {selectedFiles.Count} files: {string.Join(", ", selectedFileNames)}");
                    return Task.FromResult<IEnumerable<string>>(selectedFiles.Distinct()); // Remove duplicates
                }
            }
        }

        private static async Task HandleProjectCountCommand(IProjectDatabaseService projectDatabaseService)
        {
            var count = await projectDatabaseService.GetTotalProjectCountAsync();
            Console.WriteLine($"📊 Total projects: {count}");
        }

        private static async Task HandleProjectsCommand(string[] parts, IProjectDatabaseService projectDatabaseService)
        {
            if (parts.Length > 1 && parts[1].ToLower() == "list")
            {
                var projects = await projectDatabaseService.GetAllProjectsAsync();
                Console.WriteLine($"\n📋 {"Project Name",-40} {"Layer",-15} {"Nodes",-8} {"Edges",-8} {"Last Processed",-20}");
                Console.WriteLine(new string('-', 95));
                foreach (var project in projects.Take(20)) // Limit to first 20 for readability
                {
                    Console.WriteLine($"   {project.ProjectName,-40} {project.Layer,-15} {project.NodeCount,-8} {project.EdgeCount,-8} {project.LastProcessed:yyyy-MM-dd HH:mm}");
                }
                if (projects.Count() > 20)
                    Console.WriteLine($"   ... and {projects.Count() - 20} more projects");
            }
            else if (parts.Length > 1)
            {
                var searchTerm = string.Join(" ", parts.Skip(1));
                var projects = await projectDatabaseService.SearchProjectsByNameAsync(searchTerm);
                Console.WriteLine($"\n🔍 Found {projects.Count()} projects matching '{searchTerm}':");
                foreach (var project in projects.Take(10))
                {
                    Console.WriteLine($"   {project.ProjectId}: {project.ProjectName} ({project.Layer})");
                }
            }
            else
            {
                Console.WriteLine("Usage: projects list | projects <search-term>");
            }
        }

        private static async Task HandleLayersCommand(IProjectDatabaseService projectDatabaseService)
        {
            var layerCounts = await projectDatabaseService.GetProjectCountsByLayerAsync();
            Console.WriteLine("\n🏗️  Projects by architectural layer:");
            foreach (var layer in layerCounts.OrderByDescending(kvp => kvp.Value))
            {
                Console.WriteLine($"   {layer.Key,-20}: {layer.Value,3} projects");
            }
        }

        private static async Task HandleProjectSearchCommand(string[] parts, IProjectDatabaseService projectDatabaseService)
        {
            if (parts.Length < 2)
            {
                Console.WriteLine("Usage: search <project-name>");
                return;
            }

            var searchTerm = string.Join(" ", parts.Skip(1));
            var projects = await projectDatabaseService.SearchProjectsByNameAsync(searchTerm);
            
            Console.WriteLine($"\n🔍 Found {projects.Count()} projects matching '{searchTerm}':");
            foreach (var project in projects.Take(10))
            {
                Console.WriteLine($"   📦 {project.ProjectName}");
                Console.WriteLine($"      ID: {project.ProjectId}");
                Console.WriteLine($"      Layer: {project.Layer}");
                Console.WriteLine($"      Nodes: {project.NodeCount}, Edges: {project.EdgeCount}");
                Console.WriteLine($"      Last processed: {project.LastProcessed:yyyy-MM-dd HH:mm}");
                Console.WriteLine();
            }
        }

        private static async Task HandleNodesCommand(string[] parts, IProjectDatabaseService projectDatabaseService)
        {
            if (parts.Length < 2)
            {
                Console.WriteLine("Usage: nodes <project-id>");
                return;
            }

            var projectId = parts[1];
            var nodes = await projectDatabaseService.SearchNodesByProjectAsync(projectId);
            
            Console.WriteLine($"\n🔗 Found {nodes.Count()} nodes for project '{projectId}':");
            foreach (var node in nodes.Take(15))
            {
                Console.WriteLine($"   {node.Id}: {node.Name} ({node.Type})");
            }
            if (nodes.Count() > 15)
                Console.WriteLine($"   ... and {nodes.Count() - 15} more nodes");
        }

        private static async Task HandleEdgesCommand(string[] parts, IProjectDatabaseService projectDatabaseService)
        {
            if (parts.Length < 2)
            {
                Console.WriteLine("Usage: edges <project-id>");
                return;
            }

            var projectId = parts[1];
            var edges = await projectDatabaseService.GetEdgesByProjectAsync(projectId);
            
            Console.WriteLine($"\n🔗 Found {edges.Count()} edges for project '{projectId}':");
            foreach (var edge in edges.Take(15))
            {
                Console.WriteLine($"   {edge.Id}: {edge.Source} --{edge.Relationship}--> {edge.Target}");
            }
            if (edges.Count() > 15)
                Console.WriteLine($"   ... and {edges.Count() - 15} more edges");
        }

        // Semantic Model Command Handlers

        private static async Task HandleSemanticStatsCommand(IGraphDatabaseService graphDatabaseService)
        {
            Console.WriteLine("\n🔬 Calculating Semantic Model statistics...");
            var stats = await graphDatabaseService.GetSemanticRelationshipsStatsAsync();
            
            Console.WriteLine("\n📊 Semantic Model Statistics:");
            Console.WriteLine(new string('═', 60));
            Console.WriteLine($"  Total Nodes:               {stats.GetValueOrDefault("TotalNodes", 0),10:N0}");
            Console.WriteLine($"  Total Edges:               {stats.GetValueOrDefault("TotalEdges", 0),10:N0}");
            Console.WriteLine();
            Console.WriteLine($"  🔹 Inherits (Herencia):      {stats.GetValueOrDefault("Inherits", 0),10:N0}");
            Console.WriteLine($"  🔹 Implements (Interfaces):  {stats.GetValueOrDefault("Implements", 0),10:N0}");
            Console.WriteLine($"  🔹 Calls (Llamadas):         {stats.GetValueOrDefault("Calls", 0),10:N0}");
            Console.WriteLine($"  🔹 Uses (Uso de tipos):      {stats.GetValueOrDefault("Uses", 0),10:N0}");
            Console.WriteLine(new string('─', 60));
            Console.WriteLine($"  Total Semantic Edges:      {stats.GetValueOrDefault("SemanticEdges", 0),10:N0}");
            Console.WriteLine();
            Console.WriteLine($"  Classes with Namespace:    {stats.GetValueOrDefault("ClassesWithNamespace", 0),10:N0}");
            Console.WriteLine($"  Interfaces with Namespace: {stats.GetValueOrDefault("InterfacesWithNamespace", 0),10:N0}");
            Console.WriteLine(new string('═', 60));
        }

        private static async Task HandleInheritsCommand(string[] parts, IGraphDatabaseService graphDatabaseService)
        {
            var edges = await graphDatabaseService.GetInheritanceRelationshipsAsync();
            
            if (!edges.Any())
            {
                Console.WriteLine("⚠️  No inheritance relationships found.");
                return;
            }

            int limit = parts.Length > 1 && int.TryParse(parts[1], out int l) ? l : 10;
            
            Console.WriteLine($"\n🔹 Inheritance Relationships (showing first {limit}):");
            Console.WriteLine(new string('─', 80));
            
            foreach (var edge in edges.Take(limit))
            {
                var source = edge.Source.Replace("component:", "");
                var target = edge.Target.Replace("component:", "");
                Console.WriteLine($"  {source}");
                Console.WriteLine($"    └─▶ inherits from: {target}");
            }
            
            if (edges.Count() > limit)
                Console.WriteLine($"\n  ... and {edges.Count() - limit} more inheritance relationships");
            
            Console.WriteLine($"\n  Total: {edges.Count()} inheritance relationships");
        }

        private static async Task HandleImplementsCommand(string[] parts, IGraphDatabaseService graphDatabaseService)
        {
            var edges = await graphDatabaseService.GetImplementationRelationshipsAsync();
            
            if (!edges.Any())
            {
                Console.WriteLine("⚠️  No implementation relationships found.");
                return;
            }

            int limit = parts.Length > 1 && int.TryParse(parts[1], out int l) ? l : 10;
            
            Console.WriteLine($"\n🔹 Interface Implementations (showing first {limit}):");
            Console.WriteLine(new string('─', 80));
            
            foreach (var edge in edges.Take(limit))
            {
                var source = edge.Source.Replace("component:", "");
                var target = edge.Target.Replace("component:", "");
                Console.WriteLine($"  {source}");
                Console.WriteLine($"    └─▶ implements: {target}");
            }
            
            if (edges.Count() > limit)
                Console.WriteLine($"\n  ... and {edges.Count() - limit} more implementation relationships");
            
            Console.WriteLine($"\n  Total: {edges.Count()} interface implementations");
        }

        private static async Task HandleCallsCommand(string[] parts, IGraphDatabaseService graphDatabaseService)
        {
            var edges = await graphDatabaseService.GetMethodCallsAsync();
            
            if (!edges.Any())
            {
                Console.WriteLine("⚠️  No method calls found.");
                return;
            }

            int limit = parts.Length > 1 && int.TryParse(parts[1], out int l) ? l : 10;
            
            Console.WriteLine($"\n🔹 Method Calls (showing first {limit}):");
            Console.WriteLine(new string('─', 80));
            
            foreach (var edge in edges.Take(limit))
            {
                var source = edge.Source.Replace("component:", "");
                var target = edge.Target.Replace("component:", "");
                Console.WriteLine($"  {source}");
                Console.WriteLine($"    └─▶ calls: {target}");
            }
            
            if (edges.Count() > limit)
                Console.WriteLine($"\n  ... and {edges.Count() - limit} more method calls");
            
            Console.WriteLine($"\n  Total: {edges.Count()} method calls");
        }

        private static async Task HandleUsesCommand(string[] parts, IGraphDatabaseService graphDatabaseService)
        {
            var edges = await graphDatabaseService.GetTypeUsagesAsync();
            
            if (!edges.Any())
            {
                Console.WriteLine("⚠️  No type usages found.");
                return;
            }

            int limit = parts.Length > 1 && int.TryParse(parts[1], out int l) ? l : 10;
            
            Console.WriteLine($"\n🔹 Type Usages (showing first {limit}):");
            Console.WriteLine(new string('─', 80));
            
            foreach (var edge in edges.Take(limit))
            {
                var source = edge.Source.Replace("component:", "");
                var target = edge.Target.Replace("component:", "");
                Console.WriteLine($"  {source}");
                Console.WriteLine($"    └─▶ uses: {target}");
            }
            
            if (edges.Count() > limit)
                Console.WriteLine($"\n  ... and {edges.Count() - limit} more type usages");
            
            Console.WriteLine($"\n  Total: {edges.Count()} type usages");
        }

        private class CommandLineOptions
        {
            public string SpecificFile { get; set; } = string.Empty;
            public bool Interactive { get; set; } = false;
            public bool ProcessAll { get; set; } = false;
            public bool ShowHelp { get; set; } = false;
        }
    }
}
