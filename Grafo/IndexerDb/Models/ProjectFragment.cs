using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace IndexerDb.Models
{
    /// <summary>
    /// Represents a fragment (chunk) of a large project.
    /// Used when a project exceeds MongoDB's 16MB document size limit.
    /// </summary>
    public class ProjectFragment
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? MongoId { get; set; }

        /// <summary>
        /// ID of the fragment: "project:{ProjectName}:chunk:{Index}"
        /// </summary>
        [BsonElement("FragmentId")]
        public string FragmentId { get; set; } = string.Empty;

        /// <summary>
        /// Reference to the parent project: "project:{ProjectName}"
        /// </summary>
        [BsonElement("ParentProjectId")]
        public string ParentProjectId { get; set; } = string.Empty;

        /// <summary>
        /// Zero-based index of this chunk (0, 1, 2, ...)
        /// </summary>
        [BsonElement("ChunkIndex")]
        public int ChunkIndex { get; set; }

        /// <summary>
        /// Total number of chunks for the parent project
        /// </summary>
        [BsonElement("TotalChunks")]
        public int TotalChunks { get; set; }

        /// <summary>
        /// Subset of nodes belonging to this chunk
        /// </summary>
        [BsonElement("Nodes")]
        public List<GraphNode> Nodes { get; set; } = new List<GraphNode>();

        /// <summary>
        /// Subset of edges belonging to this chunk
        /// </summary>
        [BsonElement("Edges")]
        public List<GraphEdge> Edges { get; set; } = new List<GraphEdge>();

        /// <summary>
        /// When this fragment was created
        /// </summary>
        [BsonElement("CreatedAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Size of this fragment in bytes (approximate)
        /// </summary>
        [BsonElement("EstimatedSizeBytes")]
        public long EstimatedSizeBytes { get; set; }
    }
}
