using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace IndexerDb.Models
{
    public class ProcessingState
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? MongoId { get; set; }

        public string SourceFile { get; set; } = string.Empty;
        public string SourceDirectory { get; set; } = string.Empty;
        public string FileHash { get; set; } = string.Empty;
        public DateTime LastProcessed { get; set; } = DateTime.UtcNow;
        public DateTime FileLastModified { get; set; }
        public long FileSize { get; set; }

        /// <summary>
        /// Semantic version of the graph (e.g., "1.0.0", "7.10.2", "7.10.3")
        /// Extracted from graph metadata. All projects in this processing batch share this version.
        /// </summary>
        [BsonElement("Version")]
        [BsonIgnoreIfNull]
        public string? Version { get; set; }

        public int TotalProjects { get; set; }
        public int ProcessedProjects { get; set; }
        public int SkippedProjects { get; set; }
        public int NewProjects { get; set; }
        public int UpdatedProjects { get; set; }
        public int FailedProjects { get; set; }
        public int FragmentedProjects { get; set; } // Projects too large (>15MB), saved across multiple fragments

        public Dictionary<string, ProjectProcessingInfo> ProjectStates { get; set; } = new Dictionary<string, ProjectProcessingInfo>();
    }

    public class ProjectProcessingInfo
    {
        public string ProjectId { get; set; } = string.Empty;
        public string ProjectName { get; set; } = string.Empty;
        public string ContentHash { get; set; } = string.Empty;
        public DateTime LastProcessed { get; set; }
        public int NodeCount { get; set; }
        public int EdgeCount { get; set; }
        public ProcessingStatus Status { get; set; }
        public string? ProcessingMessage { get; set; }
    }

    public enum ProcessingStatus
    {
        New,
        Updated,
        Skipped,
        Failed,
        Fragmented  // Project saved across multiple fragments due to size limit (>15MB)
    }
}
