using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class GraphDocument
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? MongoId { get; set; }

        [JsonProperty("Metadata")]
        [BsonIgnoreIfNull]
        public GraphMetadata? Metadata { get; set; }

        [JsonProperty("Nodes")]
        public List<GraphNode> Nodes { get; set; } = new List<GraphNode>();

        [JsonProperty("Edges")]
        public List<GraphEdge> Edges { get; set; } = new List<GraphEdge>();

        // Additional metadata for MongoDB storage
        public DateTime ImportedAt { get; set; } = DateTime.UtcNow;
        public string SourceFile { get; set; } = string.Empty;
        public string SourceDirectory { get; set; } = string.Empty;

        // Compatibility fields for ProjectInfo format (incremental processing)
        [JsonProperty("Id")]
        [BsonElement("ProjectId")]
        [BsonIgnoreIfNull]
        public string? ProjectId { get; set; }

        [JsonProperty("Name")]
        [BsonElement("ProjectName")]
        [BsonIgnoreIfNull]
        public string? ProjectName { get; set; }

        [JsonProperty("Layer")]
        [BsonIgnoreIfNull]
        public string? Layer { get; set; }

        [JsonProperty("NodeCount")]
        [BsonIgnoreIfDefault]
        public int NodeCount { get; set; }

        [JsonProperty("EdgeCount")]
        [BsonIgnoreIfDefault]
        public int EdgeCount { get; set; }

        [BsonIgnoreIfNull]
        public string? ContentHash { get; set; }

        [BsonIgnoreIfDefault]
        public DateTime LastProcessed { get; set; }

        [BsonIgnoreIfDefault]
        public DateTime LastModified { get; set; }

        /// <summary>
        /// Semantic version of the graph (e.g., "1.0.0", "7.8.0", "7.9.2")
        /// Allows storing multiple versions of the same project
        /// </summary>
        [BsonElement("Version")]
        [BsonIgnoreIfNull]
        public string? Version { get; set; }
    }
}
