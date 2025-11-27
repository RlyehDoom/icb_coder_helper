using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace IndexerDb.Services
{
    /// <summary>
    /// Service for processing NDJSON-LD graph files (v2.0+ format).
    /// Converts NDJSON to GraphDocument for compatibility with existing pipeline.
    /// </summary>
    public interface INdjsonProcessorService
    {
        Task<IEnumerable<string>> FindNdjsonFilesAsync(string inputDirectory);
        Task<GraphDocument?> ProcessNdjsonFileAsync(string filePath);
        Task<IEnumerable<JObject>> ReadNdjsonNodesAsync(string filePath);
    }

    public class NdjsonProcessorService : INdjsonProcessorService
    {
        private readonly ILogger<NdjsonProcessorService> _logger;
        private readonly InputSettings _inputSettings;

        public NdjsonProcessorService(ILogger<NdjsonProcessorService> logger, IOptions<InputSettings> inputSettings)
        {
            _logger = logger;
            _inputSettings = inputSettings.Value;
        }

        public Task<IEnumerable<string>> FindNdjsonFilesAsync(string inputDirectory)
        {
            try
            {
                if (!Directory.Exists(inputDirectory))
                {
                    _logger.LogWarning("Input directory does not exist: {Directory}", inputDirectory);
                    return Task.FromResult(Enumerable.Empty<string>());
                }

                var ndjsonFiles = new List<string>();
                var directoryDetails = new List<string>();

                // Find all directories matching the pattern *GraphFiles
                var graphDirectories = Directory.GetDirectories(inputDirectory, _inputSettings.GraphFilePattern);

                foreach (var graphDir in graphDirectories)
                {
                    // Find all files ending with -graph.ndjson
                    var files = Directory.GetFiles(graphDir, "*-graph.ndjson");
                    ndjsonFiles.AddRange(files);

                    if (files.Length > 0)
                    {
                        directoryDetails.Add($"{Path.GetFileName(graphDir)}({files.Length})");
                    }
                }

                _logger.LogInformation("Found {TotalFiles} NDJSON files in {DirectoryCount} directories | {Details}",
                    ndjsonFiles.Count, graphDirectories.Length, string.Join(", ", directoryDetails));
                return Task.FromResult<IEnumerable<string>>(ndjsonFiles);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scanning for NDJSON files in directory: {Directory}", inputDirectory);
                return Task.FromResult(Enumerable.Empty<string>());
            }
        }

        public async Task<GraphDocument?> ProcessNdjsonFileAsync(string filePath)
        {
            try
            {
                _logger.LogInformation("Processing NDJSON file: {FilePath}", filePath);

                if (!File.Exists(filePath))
                {
                    _logger.LogWarning("NDJSON file does not exist: {FilePath}", filePath);
                    return null;
                }

                var graphDocument = new GraphDocument
                {
                    Nodes = new List<GraphNode>(),
                    Edges = new List<GraphEdge>(),
                    ImportedAt = DateTime.UtcNow,
                    SourceFile = Path.GetFileName(filePath),
                    SourceDirectory = GetRelativeSourceDirectory(filePath)
                };

                // Read line by line
                using var reader = new StreamReader(filePath);
                string? line;
                int lineNumber = 0;
                bool isFirstLine = true;

                while ((line = await reader.ReadLineAsync()) != null)
                {
                    lineNumber++;
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    try
                    {
                        var jsonObject = JObject.Parse(line);

                        // First line is metadata
                        if (isFirstLine)
                        {
                            isFirstLine = false;
                            ProcessMetadata(jsonObject, graphDocument);
                            continue;
                        }

                        // Subsequent lines are nodes
                        var node = ConvertToGraphNode(jsonObject);
                        if (node != null)
                        {
                            graphDocument.Nodes.Add(node);

                            // Extract edges from relationships in the node
                            ExtractEdges(jsonObject, graphDocument.Edges);
                        }
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning("Error parsing line {LineNumber} in {FilePath}: {Error}",
                            lineNumber, filePath, ex.Message);
                    }
                }

                _logger.LogInformation("Processed NDJSON file: {FilePath}, Nodes: {NodeCount}, Edges: {EdgeCount}",
                    filePath, graphDocument.Nodes.Count, graphDocument.Edges.Count);

                return graphDocument;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing NDJSON file: {FilePath}", filePath);
                return null;
            }
        }

        public async Task<IEnumerable<JObject>> ReadNdjsonNodesAsync(string filePath)
        {
            var nodes = new List<JObject>();

            try
            {
                using var reader = new StreamReader(filePath);
                string? line;
                bool isFirstLine = true;

                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    try
                    {
                        var jsonObject = JObject.Parse(line);

                        // Skip first line (metadata)
                        if (isFirstLine)
                        {
                            isFirstLine = false;
                            continue;
                        }

                        nodes.Add(jsonObject);
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning("Error parsing NDJSON line: {Error}", ex.Message);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reading NDJSON file: {FilePath}", filePath);
            }

            return nodes;
        }

        private void ProcessMetadata(JObject jsonObject, GraphDocument doc)
        {
            doc.Metadata = new GraphMetadata
            {
                GeneratedAt = jsonObject["grafo:generatedAt"]?.ToObject<DateTime>() ?? DateTime.UtcNow,
                SolutionPath = jsonObject["grafo:solutionPath"]?.ToString() ?? ""
            };
        }

        private GraphNode? ConvertToGraphNode(JObject jsonObject)
        {
            try
            {
                var id = jsonObject["@id"]?.ToString() ?? "";
                var type = jsonObject["@type"]?.ToString()?.Replace("grafo:", "") ?? "";

                return new GraphNode
                {
                    Id = id,
                    Name = jsonObject["name"]?.ToString() ?? "",
                    FullName = jsonObject["grafo:fullName"]?.ToString() ?? "",
                    Type = type,
                    Namespace = jsonObject["grafo:namespace"]?.ToString() ?? "",
                    Project = jsonObject["grafo:project"]?.ToString() ?? "",
                    Accessibility = jsonObject["grafo:accessibility"]?.ToString() ?? "",
                    IsAbstract = jsonObject["grafo:isAbstract"]?.ToObject<bool>() ?? false,
                    IsStatic = jsonObject["grafo:isStatic"]?.ToObject<bool>() ?? false,
                    IsSealed = jsonObject["grafo:isSealed"]?.ToObject<bool>() ?? false,
                    ContainingType = jsonObject["containedIn"]?.ToString() ?? "",
                    Location = ParseLocation(jsonObject["grafo:location"]),
                    Attributes = new NodeAttributes
                    {
                        Layer = jsonObject["grafo:layer"]?.ToString() ?? ""
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Error converting JSON to GraphNode: {Error}", ex.Message);
                return null;
            }
        }

        private Location? ParseLocation(JToken? locationToken)
        {
            if (locationToken == null) return null;

            return new Location
            {
                RelativePath = locationToken["grafo:path"]?.ToString() ?? "",
                Line = locationToken["grafo:line"]?.ToObject<int>() ?? 0,
                Column = locationToken["grafo:column"]?.ToObject<int>() ?? 0
            };
        }

        private void ExtractEdges(JObject nodeJson, List<GraphEdge> edges)
        {
            var sourceId = nodeJson["@id"]?.ToString() ?? "";
            if (string.IsNullOrEmpty(sourceId)) return;

            // Extract different relationship types
            ExtractRelationshipEdges(nodeJson, "calls", "Calls", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "callsVia", "CallsVia", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "indirectCall", "IndirectCall", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "implements", "Implements", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "inherits", "Inherits", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "uses", "Uses", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "contains", "Contains", sourceId, edges);
            ExtractRelationshipEdges(nodeJson, "hasMember", "HasMember", sourceId, edges);
        }

        private void ExtractRelationshipEdges(JObject nodeJson, string property, string relationship,
            string sourceId, List<GraphEdge> edges)
        {
            var targets = nodeJson[property] as JArray;
            if (targets == null) return;

            foreach (var target in targets)
            {
                var targetId = target?.ToString();
                if (!string.IsNullOrEmpty(targetId))
                {
                    edges.Add(new GraphEdge
                    {
                        Source = sourceId,
                        Target = targetId,
                        Relationship = relationship
                    });
                }
            }
        }

        private static string GetRelativeSourceDirectory(string filePath)
        {
            var directory = Path.GetDirectoryName(filePath) ?? string.Empty;
            var normalizedPath = directory.Replace('\\', '/');

            var indexerIndex = normalizedPath.LastIndexOf("/Indexer", StringComparison.OrdinalIgnoreCase);
            if (indexerIndex == -1)
            {
                indexerIndex = normalizedPath.LastIndexOf("Indexer", StringComparison.OrdinalIgnoreCase);
                if (indexerIndex == -1)
                {
                    return normalizedPath;
                }
                return "/" + normalizedPath.Substring(indexerIndex);
            }

            return normalizedPath.Substring(indexerIndex);
        }
    }
}
