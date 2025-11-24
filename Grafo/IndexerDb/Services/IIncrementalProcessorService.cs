using IndexerDb.Models;

namespace IndexerDb.Services
{
    public interface IIncrementalProcessorService
    {
        Task<ProcessingState> ProcessGraphFileIncrementallyAsync(string filePath, string? version = null);
        Task<ProcessingState> GetProcessingStateAsync(string sourceFile, string? version = null);
        Task<bool> HasFileChangedAsync(string filePath);
        Task<List<ProjectInfo>> ExtractProjectsFromGraphAsync(GraphDocument graphDocument, string? version = null);
        Task<string> CalculateProjectHashAsync(ProjectInfo project);
        Task<string> CalculateFileHashAsync(string filePath);
    }
}
