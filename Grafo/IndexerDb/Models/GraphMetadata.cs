using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class GraphMetadata
    {
        [JsonProperty("GeneratedAt")]
        public DateTime GeneratedAt { get; set; }

        [JsonProperty("SolutionPath")]
        public string SolutionPath { get; set; } = string.Empty;

        [JsonProperty("ToolVersion")]
        public string ToolVersion { get; set; } = string.Empty;

        [JsonProperty("TotalNodes")]
        public int TotalNodes { get; set; }

        [JsonProperty("TotalEdges")]
        public int TotalEdges { get; set; }
    }
}
