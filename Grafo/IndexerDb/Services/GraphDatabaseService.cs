using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace IndexerDb.Services
{
    public class GraphDatabaseService : IGraphDatabaseService
    {
        private readonly IMongoCollection<GraphDocument> _graphCollection;
        private readonly ILogger<GraphDatabaseService> _logger;

        public GraphDatabaseService(ILogger<GraphDatabaseService> logger, IOptions<MongoDbSettings> mongoSettings)
        {
            _logger = logger;

            var settings = mongoSettings.Value;
            var client = new MongoClient(settings.ConnectionString);
            var database = client.GetDatabase(settings.DatabaseName);
            _graphCollection = database.GetCollection<GraphDocument>(settings.CollectionName);

            _logger.LogInformation("Connected to MongoDB: {Database}/{Collection}", 
                settings.DatabaseName, settings.CollectionName);
        }

        public async Task<bool> SaveGraphDocumentAsync(GraphDocument document)
        {
            try
            {
                // Check if document with same source file already exists
                var existingFilter = Builders<GraphDocument>.Filter.Eq(x => x.SourceFile, document.SourceFile);
                var existingDocument = await _graphCollection.Find(existingFilter).FirstOrDefaultAsync();

                if (existingDocument != null)
                {
                    // Update existing document
                    document.MongoId = existingDocument.MongoId;
                    await _graphCollection.ReplaceOneAsync(existingFilter, document);
                    _logger.LogInformation("Updated existing graph document: {SourceFile}", document.SourceFile);
                }
                else
                {
                    // Insert new document
                    await _graphCollection.InsertOneAsync(document);
                    _logger.LogInformation("Inserted new graph document: {SourceFile}", document.SourceFile);
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving graph document: {SourceFile}", document.SourceFile);
                return false;
            }
        }

        public async Task<bool> SaveGraphDocumentsAsync(IEnumerable<GraphDocument> documents)
        {
            try
            {
                var successCount = 0;
                foreach (var document in documents)
                {
                    if (await SaveGraphDocumentAsync(document))
                    {
                        successCount++;
                    }
                }

                _logger.LogInformation("Successfully saved {SuccessCount} out of {TotalCount} documents", 
                    successCount, documents.Count());

                return successCount == documents.Count();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving multiple graph documents");
                return false;
            }
        }

        public async Task<IEnumerable<GraphDocument>> GetAllGraphsAsync()
        {
            try
            {
                var documents = await _graphCollection.Find(_ => true).ToListAsync();
                _logger.LogInformation("Retrieved {Count} graph documents", documents.Count);
                return documents;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all graph documents");
                return Enumerable.Empty<GraphDocument>();
            }
        }

        public async Task<GraphDocument?> GetGraphBySourceFileAsync(string sourceFile)
        {
            try
            {
                var filter = Builders<GraphDocument>.Filter.Eq(x => x.SourceFile, sourceFile);
                var document = await _graphCollection.Find(filter).FirstOrDefaultAsync();
                
                if (document != null)
                {
                    _logger.LogInformation("Found graph document for source file: {SourceFile}", sourceFile);
                }
                else
                {
                    _logger.LogWarning("No graph document found for source file: {SourceFile}", sourceFile);
                }

                return document;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving graph by source file: {SourceFile}", sourceFile);
                return null;
            }
        }

        public async Task<IEnumerable<GraphDocument>> GetGraphsBySourceDirectoryAsync(string sourceDirectory)
        {
            try
            {
                var filter = Builders<GraphDocument>.Filter.Eq(x => x.SourceDirectory, sourceDirectory);
                var documents = await _graphCollection.Find(filter).ToListAsync();
                
                _logger.LogInformation("Found {Count} graph documents for source directory: {SourceDirectory}", 
                    documents.Count, sourceDirectory);

                return documents;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving graphs by source directory: {SourceDirectory}", sourceDirectory);
                return Enumerable.Empty<GraphDocument>();
            }
        }

        public async Task<IEnumerable<GraphNode>> SearchNodesByNameAsync(string name)
        {
            try
            {
                var filter = Builders<GraphDocument>.Filter.ElemMatch(x => x.Nodes, 
                    node => node.Name.Contains(name, StringComparison.OrdinalIgnoreCase));
                
                var documents = await _graphCollection.Find(filter).ToListAsync();
                var nodes = documents.SelectMany(doc => doc.Nodes)
                    .Where(node => node.Name.Contains(name, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                _logger.LogInformation("Found {Count} nodes matching name: {Name}", nodes.Count, name);
                return nodes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching nodes by name: {Name}", name);
                return Enumerable.Empty<GraphNode>();
            }
        }

        public async Task<IEnumerable<GraphNode>> SearchNodesByTypeAsync(string type)
        {
            try
            {
                var filter = Builders<GraphDocument>.Filter.ElemMatch(x => x.Nodes, 
                    node => node.Type.Equals(type, StringComparison.OrdinalIgnoreCase));
                
                var documents = await _graphCollection.Find(filter).ToListAsync();
                var nodes = documents.SelectMany(doc => doc.Nodes)
                    .Where(node => node.Type.Equals(type, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                _logger.LogInformation("Found {Count} nodes of type: {Type}", nodes.Count, type);
                return nodes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching nodes by type: {Type}", type);
                return Enumerable.Empty<GraphNode>();
            }
        }

        public async Task<IEnumerable<GraphEdge>> GetEdgesByNodeIdAsync(string nodeId)
        {
            try
            {
                var filter = Builders<GraphDocument>.Filter.Or(
                    Builders<GraphDocument>.Filter.ElemMatch(x => x.Edges, edge => edge.Source == nodeId),
                    Builders<GraphDocument>.Filter.ElemMatch(x => x.Edges, edge => edge.Target == nodeId)
                );
                
                var documents = await _graphCollection.Find(filter).ToListAsync();
                var edges = documents.SelectMany(doc => doc.Edges)
                    .Where(edge => edge.Source == nodeId || edge.Target == nodeId)
                    .ToList();

                _logger.LogInformation("Found {Count} edges for node: {NodeId}", edges.Count, nodeId);
                return edges;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting edges for node: {NodeId}", nodeId);
                return Enumerable.Empty<GraphEdge>();
            }
        }

        public async Task<bool> DeleteGraphBySourceFileAsync(string sourceFile)
        {
            try
            {
                var filter = Builders<GraphDocument>.Filter.Eq(x => x.SourceFile, sourceFile);
                var result = await _graphCollection.DeleteOneAsync(filter);
                
                if (result.DeletedCount > 0)
                {
                    _logger.LogInformation("Deleted graph document: {SourceFile}", sourceFile);
                    return true;
                }
                else
                {
                    _logger.LogWarning("No graph document found to delete: {SourceFile}", sourceFile);
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting graph by source file: {SourceFile}", sourceFile);
                return false;
            }
        }

        public async Task<bool> DeleteAllGraphsAsync()
        {
            try
            {
                var result = await _graphCollection.DeleteManyAsync(_ => true);
                _logger.LogInformation("Deleted {Count} graph documents", result.DeletedCount);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting all graph documents");
                return false;
            }
        }

        public async Task<long> GetTotalGraphCountAsync()
        {
            try
            {
                var count = await _graphCollection.CountDocumentsAsync(_ => true);
                _logger.LogInformation("Total graph documents in database: {Count}", count);
                return count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting total graph count");
                return 0;
            }
        }

        // Semantic Model specific queries

        public async Task<IEnumerable<GraphEdge>> GetInheritanceRelationshipsAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var edges = graphs
                    .SelectMany(g => g.Edges)
                    .Where(e => e.Relationship == "Inherits")
                    .ToList();

                _logger.LogInformation("Found {Count} inheritance relationships", edges.Count);
                return edges;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting inheritance relationships");
                return Enumerable.Empty<GraphEdge>();
            }
        }

        public async Task<IEnumerable<GraphEdge>> GetImplementationRelationshipsAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var edges = graphs
                    .SelectMany(g => g.Edges)
                    .Where(e => e.Relationship == "Implements")
                    .ToList();

                _logger.LogInformation("Found {Count} implementation relationships", edges.Count);
                return edges;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting implementation relationships");
                return Enumerable.Empty<GraphEdge>();
            }
        }

        public async Task<IEnumerable<GraphEdge>> GetMethodCallsAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var edges = graphs
                    .SelectMany(g => g.Edges)
                    .Where(e => e.Relationship == "Calls")
                    .ToList();

                _logger.LogInformation("Found {Count} method call relationships", edges.Count);
                return edges;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting method calls");
                return Enumerable.Empty<GraphEdge>();
            }
        }

        public async Task<IEnumerable<GraphEdge>> GetTypeUsagesAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var edges = graphs
                    .SelectMany(g => g.Edges)
                    .Where(e => e.Relationship == "Uses")
                    .ToList();

                _logger.LogInformation("Found {Count} type usage relationships", edges.Count);
                return edges;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting type usages");
                return Enumerable.Empty<GraphEdge>();
            }
        }

        public async Task<IEnumerable<GraphNode>> GetClassesWithNamespaceAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var nodes = graphs
                    .SelectMany(g => g.Nodes)
                    .Where(n => n.Type == "Class" && !string.IsNullOrEmpty(n.Namespace))
                    .ToList();

                _logger.LogInformation("Found {Count} classes with namespace", nodes.Count);
                return nodes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting classes with namespace");
                return Enumerable.Empty<GraphNode>();
            }
        }

        public async Task<IEnumerable<GraphNode>> GetInterfacesWithNamespaceAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var nodes = graphs
                    .SelectMany(g => g.Nodes)
                    .Where(n => n.Type == "Interface" && !string.IsNullOrEmpty(n.Namespace))
                    .ToList();

                _logger.LogInformation("Found {Count} interfaces with namespace", nodes.Count);
                return nodes;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting interfaces with namespace");
                return Enumerable.Empty<GraphNode>();
            }
        }

        public async Task<Dictionary<string, int>> GetSemanticRelationshipsStatsAsync()
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var edges = graphs.SelectMany(g => g.Edges).ToList();
                
                var stats = new Dictionary<string, int>
                {
                    ["Inherits"] = edges.Count(e => e.Relationship == "Inherits"),
                    ["Implements"] = edges.Count(e => e.Relationship == "Implements"),
                    ["Calls"] = edges.Count(e => e.Relationship == "Calls"),
                    ["Uses"] = edges.Count(e => e.Relationship == "Uses"),
                    ["TotalEdges"] = edges.Count,
                    ["SemanticEdges"] = edges.Count(e => 
                        e.Relationship == "Inherits" || 
                        e.Relationship == "Implements" || 
                        e.Relationship == "Calls" || 
                        e.Relationship == "Uses")
                };

                var nodes = graphs.SelectMany(g => g.Nodes).ToList();
                stats["TotalNodes"] = nodes.Count;
                stats["ClassesWithNamespace"] = nodes.Count(n => n.Type == "Class" && !string.IsNullOrEmpty(n.Namespace));
                stats["InterfacesWithNamespace"] = nodes.Count(n => n.Type == "Interface" && !string.IsNullOrEmpty(n.Namespace));

                _logger.LogInformation("Calculated semantic relationships statistics");
                return stats;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating semantic relationships stats");
                return new Dictionary<string, int>();
            }
        }

        public async Task<IEnumerable<GraphEdge>> GetEdgesByRelationshipTypeAsync(string relationshipType)
        {
            try
            {
                var graphs = await _graphCollection.Find(_ => true).ToListAsync();
                var edges = graphs
                    .SelectMany(g => g.Edges)
                    .Where(e => e.Relationship.Equals(relationshipType, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                _logger.LogInformation("Found {Count} edges with relationship type: {Type}", edges.Count, relationshipType);
                return edges;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting edges by relationship type: {Type}", relationshipType);
                return Enumerable.Empty<GraphEdge>();
            }
        }
    }
}
