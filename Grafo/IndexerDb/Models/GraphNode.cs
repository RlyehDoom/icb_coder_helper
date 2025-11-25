using Newtonsoft.Json;

namespace IndexerDb.Models
{
    public class GraphNode
    {
        [JsonProperty("Id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("Name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("FullName")]
        public string FullName { get; set; } = string.Empty;

        [JsonProperty("Type")]
        public string Type { get; set; } = string.Empty;

        [JsonProperty("Project")]
        public string Project { get; set; } = string.Empty;

        [JsonProperty("Namespace")]
        public string Namespace { get; set; } = string.Empty;

        [JsonProperty("Accessibility")]
        public string Accessibility { get; set; } = string.Empty;

        [JsonProperty("IsAbstract")]
        public bool IsAbstract { get; set; }

        [JsonProperty("IsStatic")]
        public bool IsStatic { get; set; }

        [JsonProperty("IsSealed")]
        public bool IsSealed { get; set; }

        [JsonProperty("Location")]
        public Location? Location { get; set; }

        [JsonProperty("Attributes")]
        public NodeAttributes Attributes { get; set; } = new NodeAttributes();

        /// <summary>
        /// For Method/Property/Field nodes: the full name of the containing class/interface.
        /// Enables direct lookup of methods by their parent type.
        /// Example: "Namespace.ClassName" for method "Namespace.ClassName.MethodName"
        /// </summary>
        [JsonProperty("ContainingType")]
        public string? ContainingType { get; set; }
    }
}
