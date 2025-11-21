using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;

namespace IndexerDb.Services
{
    public class FileProcessorService : IFileProcessorService
    {
        private readonly ILogger<FileProcessorService> _logger;
        private readonly InputSettings _inputSettings;

        public FileProcessorService(ILogger<FileProcessorService> logger, IOptions<InputSettings> inputSettings)
        {
            _logger = logger;
            _inputSettings = inputSettings.Value;
        }

        public Task<IEnumerable<string>> FindGraphFilesAsync(string inputDirectory)
        {
            try
            {
                if (!Directory.Exists(inputDirectory))
                {
                    _logger.LogWarning("Input directory does not exist: {Directory}", inputDirectory);
                    return Task.FromResult(Enumerable.Empty<string>());
                }

                var graphFiles = new List<string>();
                var directoryDetails = new List<string>();

                // Find all directories matching the pattern *GraphFiles
                var graphDirectories = Directory.GetDirectories(inputDirectory, _inputSettings.GraphFilePattern);
                
                foreach (var graphDir in graphDirectories)
                {
                    // Find all files ending with -graph.json in each directory
                    var files = Directory.GetFiles(graphDir, $"*{_inputSettings.GraphFileExtension}");
                    graphFiles.AddRange(files);
                    
                    if (files.Length > 0)
                    {
                        directoryDetails.Add($"{Path.GetFileName(graphDir)}({files.Length})");
                    }
                }

                _logger.LogInformation("🔍 Scan Complete: {TotalFiles} graph files found in {DirectoryCount} directories | {Details}", 
                    graphFiles.Count, graphDirectories.Length, string.Join(", ", directoryDetails));
                return Task.FromResult<IEnumerable<string>>(graphFiles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning for graph files in directory: {Directory}", inputDirectory);
                return Task.FromResult(Enumerable.Empty<string>());
            }
        }

        public async Task<GraphDocument?> ProcessGraphFileAsync(string filePath)
        {
            try
            {
                _logger.LogInformation("Processing graph file: {FilePath}", filePath);

                if (!File.Exists(filePath))
                {
                    _logger.LogWarning("Graph file does not exist: {FilePath}", filePath);
                    return null;
                }

                var fileContent = await File.ReadAllTextAsync(filePath);
                var graphDocument = JsonConvert.DeserializeObject<GraphDocument>(fileContent);

                if (graphDocument != null)
                {
                    // Add metadata about the import
                    graphDocument.ImportedAt = DateTime.UtcNow;
                    graphDocument.SourceFile = Path.GetFileName(filePath);
                    graphDocument.SourceDirectory = GetRelativeSourceDirectory(filePath);

                    _logger.LogInformation("Successfully processed graph file: {FilePath}, Nodes: {NodeCount}, Edges: {EdgeCount}",
                        filePath, graphDocument.Nodes.Count, graphDocument.Edges.Count);
                }

                return graphDocument;
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON parsing error while processing file: {FilePath}", filePath);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing graph file: {FilePath}", filePath);
                return null;
            }
        }

        public async Task<IEnumerable<GraphDocument>> ProcessAllGraphFilesAsync(string inputDirectory)
        {
            var graphFiles = await FindGraphFilesAsync(inputDirectory);
            var documents = new List<GraphDocument>();

            foreach (var filePath in graphFiles)
            {
                var document = await ProcessGraphFileAsync(filePath);
                if (document != null)
                {
                    documents.Add(document);
                }
            }

            _logger.LogInformation("Successfully processed {Count} graph documents", documents.Count);
            return documents;
        }

        /// <summary>
        /// Converts absolute path to relative path starting from /Indexer
        /// Example: C:\Program Files\nodejs\node_modules\grafo-cli\Indexer\output\file.json
        ///       -> /Indexer/output
        /// </summary>
        private static string GetRelativeSourceDirectory(string filePath)
        {
            var directory = Path.GetDirectoryName(filePath) ?? string.Empty;

            // Normalize path separators to forward slashes
            var normalizedPath = directory.Replace('\\', '/');

            // Find the position of "/Indexer" or "Indexer" in the path
            var indexerIndex = normalizedPath.LastIndexOf("/Indexer", StringComparison.OrdinalIgnoreCase);
            if (indexerIndex == -1)
            {
                indexerIndex = normalizedPath.LastIndexOf("Indexer", StringComparison.OrdinalIgnoreCase);
                if (indexerIndex == -1)
                {
                    // If Indexer not found, return the full normalized path
                    return normalizedPath;
                }
                // Return from /Indexer onwards
                return "/" + normalizedPath.Substring(indexerIndex);
            }

            // Return from /Indexer onwards (indexerIndex already includes the /)
            return normalizedPath.Substring(indexerIndex);
        }
    }
}
