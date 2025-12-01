using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using IndexerDb.Models;

namespace IndexerDb.Services
{
    /// <summary>
    /// Service for exporting nodes to versioned MongoDB collections.
    /// Each version gets its own collection: nodes_6_7_5, nodes_7_8_0, etc.
    /// </summary>
    public interface INodesExportService
    {
        Task<int> ExportGraphDocumentDirectAsync(GraphDocument graphDocument, string solutionName, string version, bool cleanFirst = false);
        Task EnsureIndexesAsync(string version);
        Task<long> GetNodeCountAsync();
        Task<long> GetNodeCountByVersionAsync(string version);
        Task<bool> DeleteVersionAsync(string version);
        Task<IEnumerable<string>> GetAvailableVersionsAsync();
    }

    public class NodesExportService : INodesExportService
    {
        private readonly IMongoDatabase _database;
        private readonly ILogger<NodesExportService> _logger;

        public NodesExportService(ILogger<NodesExportService> logger, IOptions<MongoDbSettings> mongoSettings)
        {
            _logger = logger;
            var settings = mongoSettings.Value;

            // Parse connection string and create MongoClientSettings
            var mongoUrl = new MongoUrl(settings.ConnectionString);
            var clientSettings = MongoClientSettings.FromUrl(mongoUrl);

            // Get certificate path (uses default if not explicitly configured)
            var certPath = settings.GetTlsCertificatePath();

            // Configure TLS/SSL settings
            if (settings.TlsInsecure || !string.IsNullOrEmpty(certPath))
            {
                var sslSettings = new SslSettings
                {
                    CheckCertificateRevocation = false,
                    ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) =>
                    {
                        // Accept all server certificates when TlsInsecure is enabled
                        return true;
                    }
                };

                // Load client certificate if available
                if (!string.IsNullOrEmpty(certPath) && System.IO.File.Exists(certPath))
                {
                    try
                    {
                        var pemContent = System.IO.File.ReadAllText(certPath);
                        var certWithEphemeralKey = System.Security.Cryptography.X509Certificates.X509Certificate2
                            .CreateFromPem(pemContent, pemContent);
                        var certBytes = certWithEphemeralKey.Export(System.Security.Cryptography.X509Certificates.X509ContentType.Pkcs12);
                        var cert = new System.Security.Cryptography.X509Certificates.X509Certificate2(
                            certBytes,
                            (string?)null,
                            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.Exportable |
                            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.PersistKeySet);

                        sslSettings.ClientCertificates = new[] { cert };
                        _logger.LogInformation("🔒 TLS enabled with client certificate: {CertFile}", certPath);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "⚠️ Could not load client certificate, proceeding without it");
                    }
                }
                else if (settings.TlsInsecure)
                {
                    _logger.LogInformation("🔒 TLS enabled with certificate validation disabled");
                }

                clientSettings.SslSettings = sslSettings;
            }

            var client = new MongoClient(clientSettings);
            _database = client.GetDatabase(settings.DatabaseName);
            _logger.LogInformation("NodesExportService connected to MongoDB: {Database}", settings.DatabaseName);
        }

        /// <summary>
        /// Get collection name for a version: nodes_6_7_5
        /// </summary>
        private static string GetCollectionName(string version) =>
            $"nodes_{version.Replace(".", "_")}";

        /// <summary>
        /// Get collection for a specific version
        /// </summary>
        private IMongoCollection<BsonDocument> GetCollection(string version) =>
            _database.GetCollection<BsonDocument>(GetCollectionName(version));

        public async Task EnsureIndexesAsync(string version)
        {
            try
            {
                var collection = GetCollection(version);
                var indexes = new List<CreateIndexModel<BsonDocument>>
                {
                    // Semantic lookups
                    new(Builders<BsonDocument>.IndexKeys.Ascending("fullName"),
                        new CreateIndexOptions { Background = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("name"),
                        new CreateIndexOptions { Background = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("@type"),
                        new CreateIndexOptions { Background = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("kind"),
                        new CreateIndexOptions { Background = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("solution"),
                        new CreateIndexOptions { Background = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("source.file"),
                        new CreateIndexOptions { Background = true, Sparse = true }),

                    // Graph traversal indexes for $graphLookup
                    new(Builders<BsonDocument>.IndexKeys.Ascending("calls"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("callsVia"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("implements"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("inherits"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("contains"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("containedIn"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("hasMember"),
                        new CreateIndexOptions { Background = true, Sparse = true }),
                    new(Builders<BsonDocument>.IndexKeys.Ascending("uses"),
                        new CreateIndexOptions { Background = true, Sparse = true })
                };

                await collection.Indexes.CreateManyAsync(indexes);
                _logger.LogInformation("Indexes created for collection: {Collection}", GetCollectionName(version));
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Error creating indexes: {Error}", ex.Message);
            }
        }

        public async Task<IEnumerable<string>> GetAvailableVersionsAsync()
        {
            try
            {
                var collections = await _database.ListCollectionNamesAsync();
                var names = await collections.ToListAsync();

                return names
                    .Where(n => n.StartsWith("nodes_"))
                    .Select(n => n.Substring(6).Replace("_", "."))  // nodes_6_7_5 -> 6.7.5
                    .OrderBy(v => v);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting available versions");
                return Enumerable.Empty<string>();
            }
        }

        public async Task<long> GetNodeCountAsync()
        {
            try
            {
                long total = 0;
                var versions = await GetAvailableVersionsAsync();
                foreach (var version in versions)
                {
                    total += await GetCollection(version).CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty);
                }
                return total;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting total node count");
                return 0;
            }
        }

        public async Task<long> GetNodeCountByVersionAsync(string version)
        {
            try
            {
                return await GetCollection(version).CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty);
            }
            catch
            {
                return 0;
            }
        }

        public async Task<bool> DeleteVersionAsync(string version)
        {
            try
            {
                await _database.DropCollectionAsync(GetCollectionName(version));
                _logger.LogInformation("Dropped collection: {Collection}", GetCollectionName(version));
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error dropping collection for version: {Version}", version);
                return false;
            }
        }

        /// <summary>
        /// Export GraphDocument directly to versioned nodes collection
        /// </summary>
        public async Task<int> ExportGraphDocumentDirectAsync(
            GraphDocument graphDocument,
            string solutionName,
            string version,
            bool cleanFirst = false)
        {
            try
            {
                if (cleanFirst)
                {
                    await DeleteVersionAsync(version);
                }

                await EnsureIndexesAsync(version);
                var collection = GetCollection(version);

                var bulkOps = new List<WriteModel<BsonDocument>>();
                int processed = 0;

                // Build edge lookups
                var edgesBySource = graphDocument.Edges
                    .GroupBy(e => e.Source)
                    .ToDictionary(g => g.Key, g => g.ToList());

                var containmentByChild = graphDocument.Edges
                    .Where(e => e.Relationship == "Contains")
                    .GroupBy(e => e.Target)
                    .ToDictionary(g => g.Key, g => g.First().Source);

                // Node lookup for building semantic IDs
                var nodeById = new Dictionary<string, GraphNode>();
                foreach (var n in graphDocument.Nodes)
                {
                    if (!nodeById.ContainsKey(n.Id))
                        nodeById[n.Id] = n;
                }

                foreach (var node in graphDocument.Nodes)
                {
                    try
                    {
                        // Use original hash-based ID from NDJSON to preserve cross-project references
                        // The Indexer generates consistent IDs based on SHA256(fullName)
                        // This ensures that interfaces/classes referenced across projects have matching IDs
                        var docId = node.Id;
                        var kind = node.Type.ToLowerInvariant();

                        // Helper to preserve original reference IDs
                        // References to external elements (interfaces, base classes) keep their original hash IDs
                        // This allows cross-project references to work when both projects are loaded
                        string BuildRefId(string refNodeId)
                        {
                            // Keep the original ID - it's already a consistent hash
                            if (refNodeId.StartsWith("grafo:"))
                            {
                                // Remove any version suffix if present
                                var idx = refNodeId.IndexOf("@v");
                                return idx > 0 ? refNodeId.Substring(0, idx) : refNodeId;
                            }
                            return refNodeId;
                        }

                        // Create document
                        var doc = new BsonDocument
                        {
                            ["_id"] = docId,
                            ["@context"] = "https://grafo.dev/context.jsonld",
                            ["@type"] = $"grafo:{node.Type}",
                            ["name"] = node.Name,
                            ["language"] = "csharp",
                            ["kind"] = kind,
                            ["solution"] = solutionName
                        };

                        // Add fullName for code elements (not for structural nodes like Solution, Layer, Project, File)
                        var isStructuralNode = kind is "project" or "layer" or "solution" or "file";
                        if (!isStructuralNode && !string.IsNullOrEmpty(node.FullName))
                            doc["fullName"] = node.FullName;

                        if (!string.IsNullOrEmpty(node.Project))
                            doc["project"] = node.Project;

                        // Source location
                        if (node.Location != null && !string.IsNullOrEmpty(node.Location.RelativePath))
                        {
                            var source = new BsonDocument { ["file"] = node.Location.RelativePath };
                            if (node.Location.Line > 0)
                            {
                                source["range"] = new BsonDocument
                                {
                                    ["start"] = node.Location.Line,
                                    ["end"] = node.Location.Line
                                };
                            }
                            doc["source"] = source;
                        }

                        // Attributes
                        if (!string.IsNullOrEmpty(node.Namespace))
                            doc["namespace"] = node.Namespace;
                        if (!string.IsNullOrEmpty(node.Accessibility))
                            doc["accessibility"] = node.Accessibility;
                        if (node.IsAbstract)
                            doc["isAbstract"] = true;
                        if (node.IsStatic)
                            doc["isStatic"] = true;
                        if (node.IsSealed)
                            doc["isSealed"] = true;
                        if (node.Attributes?.Layer != null)
                            doc["layer"] = node.Attributes.Layer;

                        // ContainedIn relationship
                        if (containmentByChild.TryGetValue(node.Id, out var parentId))
                            doc["containedIn"] = BuildRefId(parentId);

                        // Outgoing relationships
                        if (edgesBySource.TryGetValue(node.Id, out var edges))
                        {
                            foreach (var group in edges.GroupBy(e => e.Relationship))
                            {
                                var targetIds = new BsonArray(group.Select(e => BuildRefId(e.Target)).Distinct());
                                if (targetIds.Count == 0) continue;

                                switch (group.Key)
                                {
                                    case "Contains": doc["contains"] = targetIds; break;
                                    case "HasMember": doc["hasMember"] = targetIds; break;
                                    case "Calls": doc["calls"] = targetIds; break;
                                    case "CallsVia": doc["callsVia"] = targetIds; break;
                                    case "IndirectCall": doc["indirectCall"] = targetIds; break;
                                    case "Implements": doc["implements"] = targetIds; break;
                                    case "Inherits": doc["inherits"] = targetIds; break;
                                    case "Uses": doc["uses"] = targetIds; break;
                                }
                            }
                        }

                        var filter = Builders<BsonDocument>.Filter.Eq("_id", docId);
                        bulkOps.Add(new ReplaceOneModel<BsonDocument>(filter, doc) { IsUpsert = true });
                        processed++;

                        if (bulkOps.Count >= 1000)
                        {
                            await collection.BulkWriteAsync(bulkOps);
                            _logger.LogInformation("Exported {Count} nodes...", processed);
                            bulkOps.Clear();
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning("Error processing node {NodeId}: {Error}", node.Id, ex.Message);
                    }
                }

                if (bulkOps.Count > 0)
                    await collection.BulkWriteAsync(bulkOps);

                _logger.LogInformation("✅ Exported {Count} nodes to {Collection}",
                    processed, GetCollectionName(version));

                return processed;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting to nodes collection");
                return 0;
            }
        }
    }
}
