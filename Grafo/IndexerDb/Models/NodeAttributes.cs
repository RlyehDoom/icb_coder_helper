using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class NodeAttributes
    {
        [JsonProperty("Group")]
        public string Group { get; set; } = string.Empty;

        [JsonProperty("Layer")]
        public string Layer { get; set; } = string.Empty;

        [JsonProperty("Importance")]
        public int Importance { get; set; }

        [JsonProperty("Size")]
        public int Size { get; set; }

        [JsonProperty("Color")]
        public string Color { get; set; } = string.Empty;
    }
}
