using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace IndexerDb.Services
{
    /// <summary>
    /// Service for processing NDJSON-LD graph files (v2.1 format only).
    /// Legacy .json format is no longer supported.
    /// </summary>
    public class FileProcessorService : IFileProcessorService
    {
        private readonly ILogger<FileProcessorService> _logger;
        private readonly InputSettings _inputSettings;
        private readonly INdjsonProcessorService _ndjsonProcessor;

        public FileProcessorService(
            ILogger<FileProcessorService> logger,
            IOptions<InputSettings> inputSettings,
            INdjsonProcessorService ndjsonProcessor)
        {
            _logger = logger;
            _inputSettings = inputSettings.Value;
            _ndjsonProcessor = ndjsonProcessor;
        }

        public Task<IEnumerable<GraphDirectoryInfo>> FindGraphDirectoriesAsync(string inputDirectory)
        {
            try
            {
                if (!Directory.Exists(inputDirectory))
                {
                    _logger.LogWarning("Input directory does not exist: {Directory}", inputDirectory);
                    return Task.FromResult(Enumerable.Empty<GraphDirectoryInfo>());
                }

                var result = new List<GraphDirectoryInfo>();

                // Find all directories matching the pattern *GraphFiles
                var graphDirectories = Directory.GetDirectories(inputDirectory, _inputSettings.GraphFilePattern);

                foreach (var graphDir in graphDirectories)
                {
                    var ndjsonFiles = GetGraphFilesInDirectory(graphDir);
                    if (ndjsonFiles.Any())
                    {
                        result.Add(new GraphDirectoryInfo
                        {
                            Path = graphDir,
                            Name = Path.GetFileName(graphDir),
                            FileCount = ndjsonFiles.Count(),
                            Files = ndjsonFiles
                        });
                    }
                }

                _logger.LogInformation("🔍 Found {Count} graph directories", result.Count);
                return Task.FromResult<IEnumerable<GraphDirectoryInfo>>(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning for graph directories in: {Directory}", inputDirectory);
                return Task.FromResult(Enumerable.Empty<GraphDirectoryInfo>());
            }
        }

        public Task<IEnumerable<string>> FindGraphFilesInDirectoryAsync(string graphDirectory)
        {
            try
            {
                if (!Directory.Exists(graphDirectory))
                {
                    _logger.LogWarning("Graph directory does not exist: {Directory}", graphDirectory);
                    return Task.FromResult(Enumerable.Empty<string>());
                }

                var files = GetGraphFilesInDirectory(graphDirectory);
                _logger.LogInformation("🔍 Found {Count} graph files in {Directory}",
                    files.Count(), Path.GetFileName(graphDirectory));
                return Task.FromResult(files);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning for graph files in directory: {Directory}", graphDirectory);
                return Task.FromResult(Enumerable.Empty<string>());
            }
        }

        /// <summary>
        /// Get graph files in a specific directory (excludes structural files)
        /// </summary>
        private static IEnumerable<string> GetGraphFilesInDirectory(string graphDir)
        {
            return Directory.GetFiles(graphDir, "*-graph.ndjson")
                .Where(f => !f.EndsWith("-structural.ndjson", StringComparison.OrdinalIgnoreCase));
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
                    var ndjsonFiles = GetGraphFilesInDirectory(graphDir).ToArray();
                    graphFiles.AddRange(ndjsonFiles);

                    if (ndjsonFiles.Length > 0)
                    {
                        directoryDetails.Add($"{Path.GetFileName(graphDir)}({ndjsonFiles.Length})");
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
                if (!File.Exists(filePath))
                {
                    _logger.LogWarning("Graph file does not exist: {FilePath}", filePath);
                    return null;
                }

                // Only support NDJSON format (v2.1)
                if (!filePath.EndsWith(".ndjson", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning("Unsupported file format. Only .ndjson files are supported: {FilePath}", filePath);
                    return null;
                }

                return await _ndjsonProcessor.ProcessNdjsonFileAsync(filePath);
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
