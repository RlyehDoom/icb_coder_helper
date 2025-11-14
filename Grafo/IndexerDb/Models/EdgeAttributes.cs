using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class EdgeAttributes
    {
        [JsonProperty("Style")]
        public string Style { get; set; } = string.Empty;

        [JsonProperty("Color")]
        public string Color { get; set; } = string.Empty;

        [JsonProperty("Weight")]
        public double Weight { get; set; }
    }
}
