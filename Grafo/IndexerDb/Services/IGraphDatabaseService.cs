using IndexerDb.Models;

namespace IndexerDb.Services
{
    public interface IGraphDatabaseService
    {
        Task<bool> SaveGraphDocumentAsync(GraphDocument document);
        Task<bool> SaveGraphDocumentsAsync(IEnumerable<GraphDocument> documents);
        Task<IEnumerable<GraphDocument>> GetAllGraphsAsync();
        Task<GraphDocument?> GetGraphBySourceFileAsync(string sourceFile);
        Task<IEnumerable<GraphDocument>> GetGraphsBySourceDirectoryAsync(string sourceDirectory);
        Task<IEnumerable<GraphNode>> SearchNodesByNameAsync(string name);
        Task<IEnumerable<GraphNode>> SearchNodesByTypeAsync(string type);
        Task<IEnumerable<GraphEdge>> GetEdgesByNodeIdAsync(string nodeId);
        Task<bool> DeleteGraphBySourceFileAsync(string sourceFile);
        Task<bool> DeleteAllGraphsAsync();
        Task<long> GetTotalGraphCountAsync();

        // Semantic Model specific queries
        Task<IEnumerable<GraphEdge>> GetInheritanceRelationshipsAsync();
        Task<IEnumerable<GraphEdge>> GetImplementationRelationshipsAsync();
        Task<IEnumerable<GraphEdge>> GetMethodCallsAsync();
        Task<IEnumerable<GraphEdge>> GetTypeUsagesAsync();
        Task<IEnumerable<GraphNode>> GetClassesWithNamespaceAsync();
        Task<IEnumerable<GraphNode>> GetInterfacesWithNamespaceAsync();
        Task<Dictionary<string, int>> GetSemanticRelationshipsStatsAsync();
        Task<IEnumerable<GraphEdge>> GetEdgesByRelationshipTypeAsync(string relationshipType);
    }
}
