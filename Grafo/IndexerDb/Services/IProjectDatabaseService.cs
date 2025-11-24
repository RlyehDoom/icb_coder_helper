using IndexerDb.Models;

namespace IndexerDb.Services
{
    public interface IProjectDatabaseService
    {
        Task<bool> SaveProjectInfoAsync(ProjectInfo project);
        Task<SaveProjectResult> SaveProjectInfoDetailedAsync(ProjectInfo project);
        Task<bool> SaveProjectsAsync(IEnumerable<ProjectInfo> projects);
        Task<ProjectInfo?> GetProjectByIdAsync(string projectId);
        Task<IEnumerable<ProjectInfo>> GetProjectsBySourceFileAsync(string sourceFile);
        Task<IEnumerable<ProjectInfo>> GetAllProjectsAsync();
        Task<ProcessingState?> GetProcessingStateAsync(string sourceFile, string? version = null);
        Task<bool> SaveProcessingStateAsync(ProcessingState state);
        Task<IEnumerable<ProjectInfo>> SearchProjectsByNameAsync(string name);
        Task<IEnumerable<GraphNode>> SearchNodesByProjectAsync(string projectId);
        Task<IEnumerable<GraphEdge>> GetEdgesByProjectAsync(string projectId);
        Task<bool> DeleteProjectsBySourceFileAsync(string sourceFile);
        Task<long> GetTotalProjectCountAsync();
        Task<Dictionary<string, int>> GetProjectCountsByLayerAsync();
    }
}
