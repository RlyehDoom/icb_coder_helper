using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class ProjectInfo
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? MongoId { get; set; }

        [JsonProperty("Id")]
        public string ProjectId { get; set; } = string.Empty;

        [JsonProperty("Name")]
        public string ProjectName { get; set; } = string.Empty;

        [JsonProperty("Layer")]
        public string Layer { get; set; } = string.Empty;

        [JsonProperty("NodeCount")]
        public int NodeCount { get; set; }

        [JsonProperty("EdgeCount")]
        public int EdgeCount { get; set; }

        // Metadata for change detection
        public string ContentHash { get; set; } = string.Empty;
        public DateTime LastProcessed { get; set; } = DateTime.UtcNow;
        public DateTime LastModified { get; set; } = DateTime.UtcNow;
        public string SourceFile { get; set; } = string.Empty;
        public string SourceDirectory { get; set; } = string.Empty;

        /// <summary>
        /// Reference to the ProcessingState document (ObjectId).
        /// Establishes a relationship: 1 ProcessingState -> N ProjectInfo
        /// The Version is stored in the ProcessingState document to avoid duplication.
        /// </summary>
        [BsonElement("ProcessingStateId")]
        [BsonRepresentation(BsonType.ObjectId)]
        [BsonIgnoreIfNull]
        public string? ProcessingStateId { get; set; }

        // Fragmentation fields (for projects >15MB)
        /// <summary>
        /// Indicates if this project is stored across multiple fragments due to size limits
        /// </summary>
        [BsonElement("IsFragmented")]
        [BsonIgnoreIfDefault]
        public bool IsFragmented { get; set; }

        /// <summary>
        /// Number of fragments this project is split into
        /// </summary>
        [BsonElement("FragmentCount")]
        [BsonIgnoreIfNull]
        public int? FragmentCount { get; set; }

        /// <summary>
        /// List of fragment IDs that contain this project's nodes and edges
        /// </summary>
        [BsonElement("FragmentIds")]
        [BsonIgnoreIfNull]
        public List<string>? FragmentIds { get; set; }

        // Nodes and edges for this specific project
        // NOTE: If IsFragmented = true, these lists will be empty in the main document
        [JsonProperty("Nodes")]
        public List<GraphNode> Nodes { get; set; } = new List<GraphNode>();

        [JsonProperty("Edges")]
        public List<GraphEdge> Edges { get; set; } = new List<GraphEdge>();
    }
}
