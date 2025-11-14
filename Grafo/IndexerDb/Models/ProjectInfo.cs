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

        // Nodes and edges for this specific project
        [JsonProperty("Nodes")]
        public List<GraphNode> Nodes { get; set; } = new List<GraphNode>();

        [JsonProperty("Edges")]
        public List<GraphEdge> Edges { get; set; } = new List<GraphEdge>();
    }
}
