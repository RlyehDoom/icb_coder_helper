using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class GraphEdge
    {
        [JsonProperty("Id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("Source")]
        public string Source { get; set; } = string.Empty;

        [JsonProperty("Target")]
        public string Target { get; set; } = string.Empty;

        [JsonProperty("Relationship")]
        public string Relationship { get; set; } = string.Empty;

        [JsonProperty("Strength")]
        public double Strength { get; set; }

        [JsonProperty("Count")]
        public int Count { get; set; }

        [JsonProperty("Attributes")]
        public EdgeAttributes Attributes { get; set; } = new EdgeAttributes();
    }
}
