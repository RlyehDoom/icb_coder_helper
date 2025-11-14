using IndexerDb.Models;

namespace IndexerDb.Services
{
    public interface IFileProcessorService
    {
        Task<IEnumerable<string>> FindGraphFilesAsync(string inputDirectory);
        Task<GraphDocument?> ProcessGraphFileAsync(string filePath);
        Task<IEnumerable<GraphDocument>> ProcessAllGraphFilesAsync(string inputDirectory);
    }
}
