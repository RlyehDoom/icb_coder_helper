using RoslynIndexer.Models;
using System.Text;
using System.Text.Json;

namespace RoslynIndexer.Services
{
    /// <summary>
    /// Converts GraphResult to NDJSON-LD format (one JSON document per line)
    /// Following JSON-LD 1.1 best practices for scalability
    /// </summary>
    public class JsonLdConverter
    {
        private readonly JsonSerializerOptions _jsonOptions;
        private readonly bool _includeContextInEveryNode;

        // Cache for ID mappings (oldId -> newId)
        private Dictionary<string, string> _idCache = new();

        public JsonLdConverter(bool includeContextInEveryNode = false)
        {
            _includeContextInEveryNode = includeContextInEveryNode;
            _jsonOptions = new JsonSerializerOptions
            {
                WriteIndented = false, // NDJSON must be single-line per document
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
            };
        }

        /// <summary>
        /// Converts GraphResult to NDJSON-LD format
        /// Returns an enumerable of JSON lines for streaming output
        /// </summary>
        public IEnumerable<string> ConvertToNdjsonLd(GraphResult graph)
        {
            Console.WriteLine("Converting graph to NDJSON-LD format...");

            // Build ID cache first (maps old IDs to new hash-based IDs)
            BuildIdCache(graph);

            // Build relationship lookups
            var edgesBySource = graph.Edges
                .GroupBy(e => e.Source)
                .ToDictionary(g => g.Key, g => g.ToList());

            var containmentByChild = graph.Edges
                .Where(e => e.Relationship == "contains")
                .GroupBy(e => e.Target)
                .ToDictionary(g => g.Key, g => g.First().Source);

            // 1. First line: Metadata document with context
            var solutionName = Path.GetFileNameWithoutExtension(graph.Metadata.SolutionPath);
            var metadataDoc = new JsonLdMetadataDoc
            {
                Context = CreateContext(),
                Id = JsonLdUri.CreateId("Solution", solutionName),
                Type = "grafo:CodeGraph",
                GeneratedAt = graph.Metadata.GeneratedAt,
                SolutionPath = graph.Metadata.SolutionPath,
                ToolVersion = "2.0.0",
                Format = "NDJSON-LD",
                NodeCount = graph.Nodes.Count,
                RelationshipCount = graph.Edges.Count(e => e.Relationship != "contains")
            };

            yield return JsonSerializer.Serialize(metadataDoc, _jsonOptions);

            // 2. Convert each node to a JSON-LD document
            int processedCount = 0;
            foreach (var node in graph.Nodes)
            {
                var jsonLdNode = ConvertNode(node, edgesBySource, containmentByChild);
                yield return JsonSerializer.Serialize(jsonLdNode, _jsonOptions);

                processedCount++;
                if (processedCount % 5000 == 0)
                {
                    Console.WriteLine($"  Converted {processedCount}/{graph.Nodes.Count} nodes...");
                }
            }

            Console.WriteLine($"Converted {processedCount} nodes to NDJSON-LD");
        }

        /// <summary>
        /// Creates the JSON-LD context (simplified, can reference external URL)
        /// </summary>
        private object CreateContext()
        {
            // In production, this could be just a URL reference:
            // return JsonLdUri.ContextUrl;

            // For now, inline the context
            return new JsonLdContext();
        }

        /// <summary>
        /// Builds cache mapping old IDs to new hash-based IDs
        /// </summary>
        private void BuildIdCache(GraphResult graph)
        {
            _idCache.Clear();

            foreach (var node in graph.Nodes)
            {
                var newId = JsonLdUri.CreateId(node.Type, node.FullName ?? node.Name);
                _idCache[node.Id] = newId;
            }
        }

        /// <summary>
        /// Gets new ID from cache, or generates one if not found
        /// </summary>
        private string GetNewId(string oldId, string? typeHint = null)
        {
            if (string.IsNullOrEmpty(oldId))
                return "";

            if (_idCache.TryGetValue(oldId, out var cachedId))
                return cachedId;

            // Generate new ID from old format
            var newId = JsonLdUri.FromOldId(oldId, typeHint);
            _idCache[oldId] = newId;
            return newId;
        }

        /// <summary>
        /// Converts a GraphNode to JsonLdNode
        /// </summary>
        private JsonLdNode ConvertNode(
            GraphNode node,
            Dictionary<string, List<GraphEdge>> edgesBySource,
            Dictionary<string, string> containmentByChild)
        {
            var jsonLdNode = new JsonLdNode
            {
                // Include context only if configured (for standalone documents)
                Context = _includeContextInEveryNode ? JsonLdUri.ContextUrl : null,

                // Use hash-based ID
                Id = GetNewId(node.Id, node.Type),

                // Type with grafo: prefix
                Type = JsonLdUri.GetTypeUri(node.Type),

                Name = node.Name,
                FullName = !string.IsNullOrEmpty(node.FullName) ? node.FullName : null,
                Namespace = !string.IsNullOrEmpty(node.Namespace) ? node.Namespace : null,
                Project = !string.IsNullOrEmpty(node.Project) ? node.Project : null,
                Accessibility = !string.IsNullOrEmpty(node.Accessibility) ? node.Accessibility : null,
                IsAbstract = node.IsAbstract,
                IsStatic = node.IsStatic,
                IsSealed = node.IsSealed,
                Layer = node.Attributes?.Layer
            };

            // Simplified location (relative path only)
            if (node.Location != null && !string.IsNullOrEmpty(node.Location.RelativePath))
            {
                jsonLdNode.Location = new JsonLdLocation
                {
                    Path = node.Location.RelativePath,
                    Line = node.Location.Line,
                    Column = node.Location.Column
                };
            }

            // ContainedIn relationship
            if (containmentByChild.TryGetValue(node.Id, out var parentId))
            {
                jsonLdNode.ContainedIn = GetNewId(parentId);
            }

            // Process outgoing relationships
            if (edgesBySource.TryGetValue(node.Id, out var edges))
            {
                var edgesByRelationship = edges.GroupBy(e => e.Relationship);

                foreach (var group in edgesByRelationship)
                {
                    var relationshipType = group.Key;
                    var targetIds = group.Select(e => GetNewId(e.Target)).Distinct().ToList();

                    if (targetIds.Count == 0) continue;

                    switch (relationshipType)
                    {
                        case "contains":
                            jsonLdNode.Contains = targetIds;
                            break;
                        case "hasMember":
                            jsonLdNode.HasMember = targetIds;
                            break;
                        case "Calls":
                            jsonLdNode.Calls = targetIds;
                            break;
                        case "CallsVia":
                            jsonLdNode.CallsVia = targetIds;
                            break;
                        case "IndirectCall":
                            jsonLdNode.IndirectCall = targetIds;
                            break;
                        case "Implements":
                            jsonLdNode.Implements = targetIds;
                            break;
                        case "Inherits":
                            jsonLdNode.Inherits = targetIds;
                            break;
                        case "Uses":
                            jsonLdNode.Uses = targetIds;
                            break;
                    }
                }
            }

            return jsonLdNode;
        }

        /// <summary>
        /// Generates a standalone context.jsonld file content
        /// </summary>
        public string GenerateContextFile()
        {
            var context = new
            {
                vocab = JsonLdUri.SchemaUri,
                grafo = JsonLdUri.SchemaUri,
                rdfs = "http://www.w3.org/2000/01/rdf-schema#",
                xsd = "http://www.w3.org/2001/XMLSchema#",
                name = "rdfs:label",
                contains = new { id = "grafo:contains", type = "@id" },
                containedIn = new { id = "grafo:containedIn", type = "@id" },
                calls = new { id = "grafo:calls", type = "@id" },
                callsVia = new { id = "grafo:callsVia", type = "@id" },
                indirectCall = new { id = "grafo:indirectCall", type = "@id" },
                implements = new { id = "grafo:implements", type = "@id" },
                inherits = new { id = "grafo:inherits", type = "@id" },
                uses = new { id = "grafo:uses", type = "@id" },
                hasMember = new { id = "grafo:hasMember", type = "@id" }
            };

            var options = new JsonSerializerOptions { WriteIndented = true };
            return JsonSerializer.Serialize(new { context = context }, options);
        }
    }
}
