using IndexerDb.Models;

namespace IndexerDb.Services
{
    public interface IFileProcessorService
    {
        /// <summary>
        /// Find all *GraphFiles directories in the input directory
        /// </summary>
        Task<IEnumerable<GraphDirectoryInfo>> FindGraphDirectoriesAsync(string inputDirectory);

        /// <summary>
        /// Find all graph files in a specific directory
        /// </summary>
        Task<IEnumerable<string>> FindGraphFilesInDirectoryAsync(string graphDirectory);

        /// <summary>
        /// Find all graph files across all directories (legacy method)
        /// </summary>
        Task<IEnumerable<string>> FindGraphFilesAsync(string inputDirectory);

        Task<GraphDocument?> ProcessGraphFileAsync(string filePath);
        Task<IEnumerable<GraphDocument>> ProcessAllGraphFilesAsync(string inputDirectory);
    }

    /// <summary>
    /// Information about a graph directory
    /// </summary>
    public class GraphDirectoryInfo
    {
        public string Path { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public int FileCount { get; set; }
        public IEnumerable<string> Files { get; set; } = Enumerable.Empty<string>();
    }
}
