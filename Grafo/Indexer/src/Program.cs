using CommandLine;
using RoslynIndexer.Configuration;
using RoslynIndexer.Services;
using SymbolInfo = RoslynIndexer.Models.SymbolInfo;
using IndexResult = RoslynIndexer.Models.IndexResult;

namespace RoslynIndexer;

static class Program
{
    static async Task<int> Main(string[] args)
    {
        return await Parser.Default.ParseArguments<Options>(args)
            .MapResult(async (Options opts) => await RunIndexing(opts), _ => Task.FromResult(1));
    }

    static async Task<int> RunIndexing(Options options)
    {
        try
        {
            // Get environment configuration (automatically loaded from .env on first access)
            var envConfig = RoslynIndexer.Utils.EnvironmentConfig.Current;
            
            // Apply verbose mode from .env if not explicitly set via CLI
            if (envConfig.VerboseMode && !options.Verbose)
            {
                options.Verbose = true;
            }
            
            if (options.Verbose)
            {
                Console.WriteLine($"🔬 RoslynIndexer - Semantic Model Analysis");
                envConfig.LogConfiguration();
            }
            
            // Initialize services
            var analysisService = new AnalysisService();
            var graphService = new GraphService();
            var outputService = new OutputService();
            var batchProcessor = new BatchProcessor();

            // Handle batch processing
            if (!string.IsNullOrEmpty(options.BatchConfigPath))
            {
                return await batchProcessor.ProcessBatch(options.BatchConfigPath, options.Verbose);
            }

            // Interactive mode: Auto-discover solutions if no solution path provided
            if (string.IsNullOrEmpty(options.SolutionPath))
            {
                Console.WriteLine("🔬 RoslynIndexer - Interactive Mode");
                Console.WriteLine("═══════════════════════════════════════");
                Console.WriteLine();

                var discovery = new RoslynIndexer.Utils.SolutionDiscovery();
                var discoveredSolution = discovery.AutoDiscoverAndSelectSolution(options.Verbose);

                if (string.IsNullOrEmpty(discoveredSolution))
                {
                    Console.WriteLine("\n❌ No solution selected. Exiting.");
                    Console.WriteLine("\nAlternatively, you can run with explicit parameters:");
                    Console.WriteLine("  dotnet run -- -s path/to/solution.sln -o output/ -v");
                    return 1;
                }

                options.SolutionPath = discoveredSolution;

                // Auto-configure output path if not provided, using .env configuration
                if (string.IsNullOrEmpty(options.OutputPath))
                {
                    options.OutputPath = envConfig.BuildOutputDirectory(discoveredSolution);
                    
                    Console.WriteLine($"\n📂 Output directory: {Path.GetFullPath(options.OutputPath)}");
                    if (options.Verbose)
                    {
                        Console.WriteLine($"   (configured from .env: USE_REPO_NAME_IN_OUTPUT={envConfig.UseRepoNameInOutput})");
                    }
                }

                Console.WriteLine();
            }

            // Validate required parameters for single solution processing
            if (string.IsNullOrEmpty(options.SolutionPath))
            {
                Console.WriteLine("Error: Solution path could not be determined.");
                return 1;
            }

            if (string.IsNullOrEmpty(options.OutputPath))
            {
                Console.WriteLine("Error: Output path (-o) is required for single solution processing.");
                return 1;
            }

            if (options.Verbose)
                Console.WriteLine($"Starting Roslyn indexing for solution: {options.SolutionPath}");

            // Setup progress reporting
            var progress = options.ShowProgress || options.Verbose 
                ? new Progress<string>(message => Console.WriteLine($"  {message}"))
                : null;

            // Process solution using MSBuildWorkspace (uses MSBuild's reference resolution)
            var allSymbols = await analysisService.ProcessSolutionWithMSBuildWorkspace(
                options.SolutionPath,
                options.Verbose,
                progress);

            // Apply filters
            var filteredSymbols = ApplyFilters(allSymbols, options);

            // Apply repository-based output directory naming if configured
            if (envConfig.UseRepoNameInOutput)
            {
                var repoName = RoslynIndexer.Utils.SolutionDiscovery.GetRepositoryName(options.SolutionPath);
                if (!string.IsNullOrEmpty(repoName))
                {
                    // If OutputPath is a directory, append {repoName}_GraphFiles
                    if (Directory.Exists(options.OutputPath) || !Path.HasExtension(options.OutputPath))
                    {
                        options.OutputPath = Path.Combine(options.OutputPath, $"{repoName}_GraphFiles");
                        if (options.Verbose)
                        {
                            Console.WriteLine($"📂 Using repository-based output directory: {repoName}_GraphFiles");
                        }
                    }
                }
            }

            // Determine if OutputPath is a directory or file
            string outputDirectory;
            string filePrefix;
            
            if (Directory.Exists(options.OutputPath) || !Path.HasExtension(options.OutputPath))
            {
                // OutputPath is a directory
                outputDirectory = options.OutputPath;
                filePrefix = Path.GetFileNameWithoutExtension(options.SolutionPath);
                Directory.CreateDirectory(outputDirectory);
            }
            else
            {
                // OutputPath is a file
                outputDirectory = Path.GetDirectoryName(options.OutputPath) ?? ".";
                filePrefix = Path.GetFileNameWithoutExtension(options.OutputPath);
                Directory.CreateDirectory(outputDirectory);
            }

            // Build output file paths
            var symbolsPath = Path.Combine(outputDirectory, $"{filePrefix}-symbols.json");
            var graphPath = Path.Combine(outputDirectory, $"{filePrefix}-graph.json");
            var statsPath = Path.Combine(outputDirectory, $"{filePrefix}-stats.csv");

            // Create index result
            var indexResult = new IndexResult
            {
                GeneratedAt = DateTime.UtcNow,
                SolutionPath = options.SolutionPath,
                Symbols = filteredSymbols,
                Statistics = analysisService.CalculateStatistics(filteredSymbols)
            };

            // Save main result
            await outputService.SaveIndexResult(indexResult, symbolsPath, options.OutputFormat);
            Console.WriteLine($"Indexing completed. Found {filteredSymbols.Count} symbols.");
            Console.WriteLine($"Results saved to: {outputDirectory}");

            // Always generate graph (consolidating old GraphOutputPath logic)
            if (options.Verbose)
                Console.WriteLine("Generating symbol relationship graph...");

            // Configure layer detection mode
            var layerMode = options.LayerDetectionMode.ToLower() switch
            {
                "directory" => LayerDetectionService.DetectionMode.Directory,
                "naming" => LayerDetectionService.DetectionMode.Naming,
                _ => LayerDetectionService.DetectionMode.Auto
            };

            // Pre-analyze layers and show summary
            if (options.ShowLayerSummary)
            {
                Console.WriteLine();
                Console.WriteLine($"Layer detection mode: {layerMode}");

                var layerSummary = graphService.PreAnalyzeLayers(
                    filteredSymbols,
                    options.SolutionPath,
                    layerMode,
                    options.Verbose);

                LayerDetectionService.PrintSummary(layerSummary);

                // Ask for confirmation in interactive mode
                if (!options.SkipLayerConfirmation)
                {
                    Console.Write("Do you want to proceed with this layer classification? (Y/n): ");
                    var response = Console.ReadLine()?.Trim().ToLower();

                    if (response == "n" || response == "no")
                    {
                        Console.WriteLine("\nLayer classification rejected. You can:");
                        Console.WriteLine("  1. Use --layer-mode=naming to use naming-based detection only");
                        Console.WriteLine("  2. Use --layer-mode=directory to force directory-based detection");
                        Console.WriteLine("  3. Reorganize your project structure to match layer patterns");
                        Console.WriteLine("\nExiting without generating graph.");
                        return 1;
                    }
                }
            }
            else
            {
                // Configure layer detection for graph generation
                graphService.ConfigureLayerDetection(layerMode, options.Verbose);
            }

            var graphResult = await graphService.GenerateSymbolGraph(
                filteredSymbols,
                options.SolutionPath,
                analysisService.AllMethodInvocations,
                analysisService.AllTypeUsages,
                analysisService.AllInheritanceRelations,
                analysisService.AllInterfaceImplementations);

            // MongoDB Direct Export (v2.1)
            if (options.OutputMongoDB)
            {
                var connectionString = options.MongoDbConnection ?? "mongodb://localhost:27019/";
                var mongoExporter = new MongoDbExporter(connectionString, options.MongoDbDatabase, options.Verbose);

                var solutionName = Path.GetFileNameWithoutExtension(options.SolutionPath);

                // Clean existing data if requested
                if (options.MongoDbClean)
                {
                    Console.WriteLine($"Cleaning existing data for: {solutionName}");
                    await mongoExporter.DeleteSolutionAsync(solutionName);
                }

                // Export to MongoDB
                var exportResult = await mongoExporter.ExportAsync(graphResult, solutionName);

                if (exportResult.Success)
                {
                    Console.WriteLine($"MongoDB export completed successfully");
                    Console.WriteLine($"  Nodes: {exportResult.NodesExported}");
                    Console.WriteLine($"  Duration: {exportResult.Duration.TotalSeconds:F2}s");
                    Console.WriteLine($"  Database: {options.MongoDbDatabase}");
                }
                else
                {
                    Console.WriteLine($"MongoDB export failed: {exportResult.Error}");
                    return 1;
                }
            }
            else
            {
                // File-based output (default)
                await outputService.SaveGraphResult(graphResult, graphPath, options.OutputFormat);

                if (options.Verbose)
                    Console.WriteLine($"Graph saved to: {graphPath}");

                // Save graph statistics CSV
                await outputService.SaveGraphStatisticsCsv(graphResult, statsPath);
                if (options.Verbose)
                    Console.WriteLine($"Graph statistics saved to: {statsPath}");
            }

            // Save custom statistics CSV if requested
            if (!string.IsNullOrEmpty(options.StatsCsvPath))
            {
                await outputService.SaveStatistics(indexResult.Statistics, options.StatsCsvPath);
                Console.WriteLine($"Custom statistics saved to: {options.StatsCsvPath}");
            }

            // Show summary statistics
            if (options.Verbose)
            {
                Console.WriteLine("\nStatistics Summary:");
                foreach (var stat in indexResult.Statistics.OrderBy(s => s.Key))
                {
                    Console.WriteLine($"  {stat.Key}: {stat.Value}");
                }
            }

            return 0;
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("compilation error"))
        {
            // Compilation errors - already reported in detail, just show summary
            Console.WriteLine($"\n❌ {ex.Message}");
            Console.WriteLine($"\n💡 Tip: No graph files were generated due to compilation errors.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n❌ Error: {ex.Message}");
            if (options.Verbose)
            {
                Console.WriteLine("\nStack trace:");
                Console.WriteLine(ex.StackTrace);
            }
            return 1;
        }
    }

    static List<SymbolInfo> ApplyFilters(List<SymbolInfo> symbols, Options options)
    {
        var analysisService = new AnalysisService();
        
        // Parse filter types
        HashSet<string>? filterTypes = null;
        if (!string.IsNullOrEmpty(options.FilterTypes))
        {
            filterTypes = new HashSet<string>(
                options.FilterTypes.Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(t => t.Trim()));
        }

        // Parse exclude projects
        List<string>? excludeProjects = null;
        if (!string.IsNullOrEmpty(options.ExcludeProjects))
        {
            excludeProjects = options.ExcludeProjects.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(p => p.Trim())
                    .ToList();
        }

        // Parse include only projects
        List<string>? includeOnly = null;
        if (!string.IsNullOrEmpty(options.IncludeOnly))
        {
            includeOnly = options.IncludeOnly.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(p => p.Trim())
                .ToList();
        }

        return analysisService.FilterSymbols(symbols, filterTypes, excludeProjects, includeOnly);
    }
}