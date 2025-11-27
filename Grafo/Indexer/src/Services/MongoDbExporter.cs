using MongoDB.Driver;
using MongoDB.Bson;
using RoslynIndexer.Models;
using System.Text.Json;

namespace RoslynIndexer.Services
{
    /// <summary>
    /// Exports graph data directly to MongoDB collections.
    /// Collections:
    /// - grafo.nodes: Individual nodes as documents
    /// - grafo.metadata: Graph metadata per solution
    /// - grafo.statistics: Per-solution statistics
    /// </summary>
    public class MongoDbExporter
    {
        private readonly IMongoDatabase _database;
        private readonly JsonLdConverter _jsonLdConverter;
        private readonly bool _verbose;

        // Collection names
        public const string NodesCollection = "nodes";
        public const string MetadataCollection = "metadata";
        public const string StatisticsCollection = "statistics";

        public MongoDbExporter(string connectionString, string databaseName = "GraphDB", bool verbose = false)
        {
            var client = new MongoClient(connectionString);
            _database = client.GetDatabase(databaseName);
            _jsonLdConverter = new JsonLdConverter();
            _verbose = verbose;
        }

        /// <summary>
        /// Exports GraphResult directly to MongoDB collections.
        /// Uses upsert for incremental updates.
        /// </summary>
        public async Task<ExportResult> ExportAsync(GraphResult graph, string solutionName)
        {
            var result = new ExportResult { SolutionName = solutionName };
            var startTime = DateTime.UtcNow;

            try
            {
                Console.WriteLine($"Exporting to MongoDB: {solutionName}");

                // Ensure indexes exist
                await EnsureIndexesAsync();

                // 1. Export nodes
                var nodesExported = await ExportNodesAsync(graph, solutionName);
                result.NodesExported = nodesExported;

                // 2. Export metadata
                await ExportMetadataAsync(graph, solutionName);
                result.MetadataExported = true;

                // 3. Export statistics
                await ExportStatisticsAsync(graph, solutionName);
                result.StatisticsExported = true;

                result.Success = true;
                result.Duration = DateTime.UtcNow - startTime;

                Console.WriteLine($"Export completed: {nodesExported} nodes in {result.Duration.TotalSeconds:F2}s");
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Error = ex.Message;
                Console.WriteLine($"Export failed: {ex.Message}");
                if (_verbose)
                {
                    Console.WriteLine(ex.StackTrace);
                }
            }

            return result;
        }

        /// <summary>
        /// Creates necessary indexes for efficient queries
        /// </summary>
        private async Task EnsureIndexesAsync()
        {
            var nodesCollection = _database.GetCollection<BsonDocument>(NodesCollection);

            // Index on _id is automatic
            // Index on @type for filtering by node type
            var typeIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("@type"),
                new CreateIndexOptions { Background = true });

            // Index on grafo:project for project-based queries
            var projectIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("grafo:project"),
                new CreateIndexOptions { Background = true });

            // Index on grafo:fullName for name lookups
            var fullNameIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("grafo:fullName"),
                new CreateIndexOptions { Background = true });

            // Compound index for solution + type queries
            var solutionTypeIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys
                    .Ascending("grafo:solution")
                    .Ascending("@type"),
                new CreateIndexOptions { Background = true });

            // Index on relationship fields for graph traversals
            var callsIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("calls"),
                new CreateIndexOptions { Background = true, Sparse = true });

            var callsViaIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("callsVia"),
                new CreateIndexOptions { Background = true, Sparse = true });

            var implementsIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("implements"),
                new CreateIndexOptions { Background = true, Sparse = true });

            var inheritsIndex = new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("inherits"),
                new CreateIndexOptions { Background = true, Sparse = true });

            await nodesCollection.Indexes.CreateManyAsync(new[]
            {
                typeIndex, projectIndex, fullNameIndex, solutionTypeIndex,
                callsIndex, callsViaIndex, implementsIndex, inheritsIndex
            });

            if (_verbose)
            {
                Console.WriteLine("MongoDB indexes ensured");
            }
        }

        /// <summary>
        /// Exports all nodes to MongoDB using bulk upsert
        /// </summary>
        private async Task<int> ExportNodesAsync(GraphResult graph, string solutionName)
        {
            var nodesCollection = _database.GetCollection<BsonDocument>(NodesCollection);
            var bulkOps = new List<WriteModel<BsonDocument>>();

            // Convert using JsonLdConverter
            var ndjsonLines = _jsonLdConverter.ConvertToNdjsonLd(graph).ToList();

            // Skip first line (metadata) - we handle that separately
            var nodeLines = ndjsonLines.Skip(1).ToList();

            int processed = 0;
            foreach (var line in nodeLines)
            {
                try
                {
                    var doc = BsonDocument.Parse(line);

                    // Add solution reference for filtering
                    doc["grafo:solution"] = solutionName;

                    // Use @id as _id for MongoDB
                    var nodeId = doc["@id"].AsString;
                    doc["_id"] = nodeId;
                    doc.Remove("@id");

                    // Remove @context from individual documents (stored in metadata)
                    if (doc.Contains("@context"))
                    {
                        doc.Remove("@context");
                    }

                    // Create upsert operation
                    var filter = Builders<BsonDocument>.Filter.Eq("_id", nodeId);
                    var upsert = new ReplaceOneModel<BsonDocument>(filter, doc) { IsUpsert = true };
                    bulkOps.Add(upsert);

                    processed++;

                    // Execute in batches of 1000
                    if (bulkOps.Count >= 1000)
                    {
                        await nodesCollection.BulkWriteAsync(bulkOps);
                        if (_verbose)
                        {
                            Console.WriteLine($"  Exported {processed}/{nodeLines.Count} nodes...");
                        }
                        bulkOps.Clear();
                    }
                }
                catch (Exception ex)
                {
                    if (_verbose)
                    {
                        Console.WriteLine($"  Warning: Failed to parse node: {ex.Message}");
                    }
                }
            }

            // Execute remaining operations
            if (bulkOps.Count > 0)
            {
                await nodesCollection.BulkWriteAsync(bulkOps);
            }

            return processed;
        }

        /// <summary>
        /// Exports graph metadata document
        /// </summary>
        private async Task ExportMetadataAsync(GraphResult graph, string solutionName)
        {
            var metadataCollection = _database.GetCollection<BsonDocument>(MetadataCollection);

            var metadata = new BsonDocument
            {
                ["_id"] = $"grafo:sln/{solutionName}",
                ["@type"] = "grafo:CodeGraph",
                ["grafo:solutionName"] = solutionName,
                ["grafo:solutionPath"] = graph.Metadata.SolutionPath,
                ["grafo:generatedAt"] = graph.Metadata.GeneratedAt,
                ["grafo:toolVersion"] = "2.1.0",
                ["grafo:format"] = "MongoDB",
                ["grafo:nodeCount"] = graph.Nodes.Count,
                ["grafo:edgeCount"] = graph.Edges.Count,
                ["@context"] = new BsonDocument
                {
                    ["@vocab"] = "https://grafo.dev/schema/",
                    ["grafo"] = "https://grafo.dev/schema/",
                    ["rdfs"] = "http://www.w3.org/2000/01/rdf-schema#"
                }
            };

            var filter = Builders<BsonDocument>.Filter.Eq("_id", metadata["_id"]);
            await metadataCollection.ReplaceOneAsync(filter, metadata, new ReplaceOptions { IsUpsert = true });
        }

        /// <summary>
        /// Exports statistics document
        /// </summary>
        private async Task ExportStatisticsAsync(GraphResult graph, string solutionName)
        {
            var statsCollection = _database.GetCollection<BsonDocument>(StatisticsCollection);

            // Calculate statistics by type
            var nodesByType = graph.Nodes
                .GroupBy(n => n.Type)
                .ToDictionary(g => g.Key, g => g.Count());

            var edgesByRelationship = graph.Edges
                .GroupBy(e => e.Relationship)
                .ToDictionary(g => g.Key, g => g.Count());

            var stats = new BsonDocument
            {
                ["_id"] = $"stats:{solutionName}",
                ["grafo:solution"] = solutionName,
                ["grafo:generatedAt"] = DateTime.UtcNow,
                ["grafo:totalNodes"] = graph.Statistics.TotalNodes,
                ["grafo:totalEdges"] = graph.Statistics.TotalEdges,
                ["grafo:layerCount"] = graph.Statistics.LayerCount,
                ["grafo:projectCount"] = graph.Statistics.ProjectCount,
                ["grafo:componentCount"] = graph.Statistics.ComponentCount,
                ["nodesByType"] = new BsonDocument(nodesByType.Select(kvp =>
                    new BsonElement(kvp.Key, kvp.Value))),
                ["edgesByRelationship"] = new BsonDocument(edgesByRelationship.Select(kvp =>
                    new BsonElement(kvp.Key, kvp.Value)))
            };

            var filter = Builders<BsonDocument>.Filter.Eq("_id", stats["_id"]);
            await statsCollection.ReplaceOneAsync(filter, stats, new ReplaceOptions { IsUpsert = true });
        }

        /// <summary>
        /// Deletes all nodes for a specific solution (for clean re-import)
        /// </summary>
        public async Task<long> DeleteSolutionAsync(string solutionName)
        {
            var nodesCollection = _database.GetCollection<BsonDocument>(NodesCollection);
            var metadataCollection = _database.GetCollection<BsonDocument>(MetadataCollection);
            var statsCollection = _database.GetCollection<BsonDocument>(StatisticsCollection);

            var filter = Builders<BsonDocument>.Filter.Eq("grafo:solution", solutionName);
            var nodesDeleted = await nodesCollection.DeleteManyAsync(filter);

            var metaFilter = Builders<BsonDocument>.Filter.Eq("_id", $"grafo:sln/{solutionName}");
            await metadataCollection.DeleteOneAsync(metaFilter);

            var statsFilter = Builders<BsonDocument>.Filter.Eq("_id", $"stats:{solutionName}");
            await statsCollection.DeleteOneAsync(statsFilter);

            Console.WriteLine($"Deleted {nodesDeleted.DeletedCount} nodes for solution: {solutionName}");
            return nodesDeleted.DeletedCount;
        }

        /// <summary>
        /// Gets statistics about the current database
        /// </summary>
        public async Task<DatabaseStats> GetStatsAsync()
        {
            var nodesCollection = _database.GetCollection<BsonDocument>(NodesCollection);
            var metadataCollection = _database.GetCollection<BsonDocument>(MetadataCollection);

            var nodeCount = await nodesCollection.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty);
            var solutionCount = await metadataCollection.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty);

            // Get nodes by type
            var pipeline = new[]
            {
                new BsonDocument("$group", new BsonDocument
                {
                    ["_id"] = "$@type",
                    ["count"] = new BsonDocument("$sum", 1)
                })
            };

            var typeStats = await nodesCollection.Aggregate<BsonDocument>(pipeline).ToListAsync();

            return new DatabaseStats
            {
                TotalNodes = nodeCount,
                TotalSolutions = solutionCount,
                NodesByType = typeStats.ToDictionary(
                    d => d["_id"].AsString,
                    d => d["count"].AsInt32)
            };
        }
    }

    public class ExportResult
    {
        public string SolutionName { get; set; } = "";
        public bool Success { get; set; }
        public int NodesExported { get; set; }
        public bool MetadataExported { get; set; }
        public bool StatisticsExported { get; set; }
        public TimeSpan Duration { get; set; }
        public string? Error { get; set; }
    }

    public class DatabaseStats
    {
        public long TotalNodes { get; set; }
        public long TotalSolutions { get; set; }
        public Dictionary<string, int> NodesByType { get; set; } = new();
    }
}
