using Newtonsoft.Json;
using RoslynIndexer.Configuration;
using YamlDotNet.Serialization;
using SymbolInfo = RoslynIndexer.Models.SymbolInfo;
using IndexResult = RoslynIndexer.Models.IndexResult;

namespace RoslynIndexer.Services
{
    public class BatchProcessor
    {
        private readonly AnalysisService _analysisService;
        private readonly GraphService _graphService;
        private readonly OutputService _outputService;

        public BatchProcessor()
        {
            _analysisService = new AnalysisService();
            _graphService = new GraphService();
            _outputService = new OutputService();
        }

        public async Task<int> ProcessBatch(string configPath, bool verbose)
        {
            try
            {
                Console.WriteLine($"Loading batch configuration from: {configPath}");
                
                var config = await LoadBatchConfiguration(configPath);
                
                if (!config.Solutions.Any(s => s.Enabled))
                {
                    Console.WriteLine("No enabled solutions found in batch configuration.");
                    return 1;
                }

                var successCount = 0;
                var totalCount = config.Solutions.Count(s => s.Enabled);

                Console.WriteLine($"Processing {totalCount} solutions in batch...");

                for (int i = 0; i < config.Solutions.Count; i++)
                {
                    var solution = config.Solutions[i];
                    if (!solution.Enabled) continue;

                    Console.WriteLine($"\n[{successCount + 1}/{totalCount}] Processing: {solution.SolutionPath}");
                    
                    var progress = new Progress<string>(message => 
                    {
                        if (verbose) Console.WriteLine($"  {message}");
                    });

                    try
                    {
                        await ProcessSingleSolution(solution, config, verbose, progress);
                        successCount++;
                        Console.WriteLine($"✓ Completed: {solution.SolutionPath}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"✗ Failed: {solution.SolutionPath} - {ex.Message}");
                        if (verbose) Console.WriteLine(ex.StackTrace);
                    }
                }

                Console.WriteLine($"\nBatch processing completed: {successCount}/{totalCount} solutions processed successfully");
                return successCount == totalCount ? 0 : 1;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Batch processing error: {ex.Message}");
                if (verbose) Console.WriteLine(ex.StackTrace);
                return 1;
            }
        }

        private async Task ProcessSingleSolution(BatchItem solution, BatchConfiguration config, bool verbose, IProgress<string> progress)
        {
            if (!File.Exists(solution.SolutionPath))
            {
                throw new FileNotFoundException($"Solution file not found: {solution.SolutionPath}");
            }

            // Ensure output directory exists
            Directory.CreateDirectory(config.OutputDirectory);

            // Generate output file names
            var prefix = !string.IsNullOrEmpty(solution.OutputPrefix) 
                ? solution.OutputPrefix 
                : Path.GetFileNameWithoutExtension(solution.SolutionPath);

            var outputPath = Path.Combine(config.OutputDirectory, $"{prefix}-symbols.json");
            var graphPath = config.GenerateGraphs 
                ? Path.Combine(config.OutputDirectory, $"{prefix}-graph.json") 
                : null;
            var statsPath = config.GenerateStatistics 
                ? Path.Combine(config.OutputDirectory, $"{prefix}-stats.csv") 
                : null;

            // Process solution using MSBuildWorkspace
            var allSymbols = await _analysisService.ProcessSolutionWithMSBuildWorkspace(solution.SolutionPath, verbose, progress);

            // Apply filters from batch configuration
            var filterTypes = config.FilterTypes?.Any() == true 
                ? new HashSet<string>(config.FilterTypes) 
                : null;
            
            var excludeProjects = config.ExcludeProjects?.Any() == true 
                ? config.ExcludeProjects 
                : null;

            var filteredSymbols = _analysisService.FilterSymbols(allSymbols, filterTypes, excludeProjects);

            // Create index result
            var indexResult = new IndexResult
            {
                GeneratedAt = DateTime.UtcNow,
                SolutionPath = solution.SolutionPath,
                Symbols = filteredSymbols,
                Statistics = _analysisService.CalculateStatistics(filteredSymbols)
            };

            // Save symbol index
            await _outputService.SaveIndexResult(indexResult, outputPath, "json");
            progress.Report($"Saved symbol index: {outputPath}");

            // Generate and save graph if requested
            if (config.GenerateGraphs && !string.IsNullOrEmpty(graphPath))
            {
                var graphResult = await _graphService.GenerateSymbolGraph(
                    filteredSymbols, 
                    solution.SolutionPath,
                    _analysisService.AllMethodInvocations,
                    _analysisService.AllTypeUsages,
                    _analysisService.AllInheritanceRelations,
                    _analysisService.AllInterfaceImplementations);
                await _outputService.SaveGraphResult(graphResult, graphPath, "json");
                progress.Report($"Saved graph: {graphPath}");

                // Also generate structural-only version
                var structuralGraph = _graphService.GenerateStructuralOnlyGraph(graphResult);
                var structuralPath = Path.ChangeExtension(graphPath, null) + "-structural.json";
                await _outputService.SaveGraphResult(structuralGraph, structuralPath, "json");
                progress.Report($"Saved structural graph: {structuralPath}");
            }

            // Generate statistics CSV if requested
            if (config.GenerateStatistics && !string.IsNullOrEmpty(statsPath))
            {
                await _outputService.SaveStatistics(indexResult.Statistics, statsPath);
                progress.Report($"Saved statistics: {statsPath}");
            }
        }

        private async Task<BatchConfiguration> LoadBatchConfiguration(string configPath)
        {
            if (!File.Exists(configPath))
            {
                throw new FileNotFoundException($"Batch configuration file not found: {configPath}");
            }

            var content = await File.ReadAllTextAsync(configPath);
            var extension = Path.GetExtension(configPath).ToLower();

            return extension switch
            {
                ".json" => JsonConvert.DeserializeObject<BatchConfiguration>(content) 
                    ?? throw new InvalidOperationException("Failed to deserialize JSON configuration"),
                ".yaml" or ".yml" => DeserializeYaml<BatchConfiguration>(content),
                _ => throw new NotSupportedException($"Configuration file format not supported: {extension}")
            };
        }

        private T DeserializeYaml<T>(string yamlContent)
        {
            var deserializer = new DeserializerBuilder().Build();
            return deserializer.Deserialize<T>(yamlContent);
        }

        public async Task<string> GenerateSampleBatchConfig(string outputPath, string format = "yaml")
        {
            var sampleConfig = new BatchConfiguration
            {
                OutputDirectory = "./output",
                GenerateGraphs = true,
                GenerateStatistics = true,
                FilterTypes = new List<string> { "Class", "Interface", "Method" },
                ExcludeProjects = new List<string> { ".*\\.Tests$", ".*\\.Test$" },
                Solutions = new List<BatchItem>
                {
                    new BatchItem
                    {
                        SolutionPath = "./path/to/solution1.sln",
                        OutputPrefix = "project1",
                        Enabled = true
                    },
                    new BatchItem
                    {
                        SolutionPath = "./path/to/solution2.sln", 
                        OutputPrefix = "project2",
                        Enabled = true
                    }
                }
            };

            string content = format.ToLower() switch
            {
                "json" => JsonConvert.SerializeObject(sampleConfig, Formatting.Indented),
                "yaml" or "yml" => SerializeYaml(sampleConfig),
                _ => throw new NotSupportedException($"Format not supported: {format}")
            };

            await File.WriteAllTextAsync(outputPath, content);
            return outputPath;
        }

        private string SerializeYaml(object obj)
        {
            var serializer = new SerializerBuilder()
                .WithNamingConvention(YamlDotNet.Serialization.NamingConventions.CamelCaseNamingConvention.Instance)
                .Build();
            return serializer.Serialize(obj);
        }
    }
}
