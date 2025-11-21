using IndexerDb.Models;

namespace IndexerDb.Services
{
    public interface IIncrementalProcessorService
    {
        Task<ProcessingState> ProcessGraphFileIncrementallyAsync(string filePath, string? version = null);
        Task<ProcessingState> GetProcessingStateAsync(string sourceFile);
        Task<bool> HasFileChangedAsync(string filePath);
        Task<List<ProjectInfo>> ExtractProjectsFromGraphAsync(GraphDocument graphDocument);
        Task<string> CalculateProjectHashAsync(ProjectInfo project);
        Task<string> CalculateFileHashAsync(string filePath);
    }
}
