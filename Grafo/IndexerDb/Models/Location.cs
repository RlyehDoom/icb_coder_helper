using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class Location
    {
        [JsonProperty("AbsolutePath")]
        public string AbsolutePath { get; set; } = string.Empty;

        [JsonProperty("RelativePath")]
        public string RelativePath { get; set; } = string.Empty;

        [JsonProperty("Line")]
        public int Line { get; set; }

        [JsonProperty("Column")]
        public int Column { get; set; }
    }
}
