using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

namespace RoslynIndexer.Models
{
    /// <summary>
    /// Simplified JSON-LD Context - designed for external publication
    /// Reference: https://grafo.dev/schema/context.jsonld
    /// </summary>
    public class JsonLdContext
    {
        [JsonPropertyName("@vocab")]
        public string Vocab { get; set; } = "https://grafo.dev/schema/";

        [JsonPropertyName("grafo")]
        public string Grafo { get; set; } = "https://grafo.dev/schema/";

        [JsonPropertyName("rdfs")]
        public string Rdfs { get; set; } = "http://www.w3.org/2000/01/rdf-schema#";

        [JsonPropertyName("xsd")]
        public string Xsd { get; set; } = "http://www.w3.org/2001/XMLSchema#";

        // Only relationship definitions (not types)
        [JsonPropertyName("name")]
        public string Name { get; set; } = "rdfs:label";

        [JsonPropertyName("contains")]
        public JsonLdPropertyDef Contains { get; set; } = new() { Id = "grafo:contains", Type = "@id" };

        [JsonPropertyName("containedIn")]
        public JsonLdPropertyDef ContainedIn { get; set; } = new() { Id = "grafo:containedIn", Type = "@id" };

        [JsonPropertyName("calls")]
        public JsonLdPropertyDef Calls { get; set; } = new() { Id = "grafo:calls", Type = "@id" };

        [JsonPropertyName("callsVia")]
        public JsonLdPropertyDef CallsVia { get; set; } = new() { Id = "grafo:callsVia", Type = "@id" };

        [JsonPropertyName("indirectCall")]
        public JsonLdPropertyDef IndirectCall { get; set; } = new() { Id = "grafo:indirectCall", Type = "@id" };

        [JsonPropertyName("implements")]
        public JsonLdPropertyDef Implements { get; set; } = new() { Id = "grafo:implements", Type = "@id" };

        [JsonPropertyName("inherits")]
        public JsonLdPropertyDef Inherits { get; set; } = new() { Id = "grafo:inherits", Type = "@id" };

        [JsonPropertyName("uses")]
        public JsonLdPropertyDef Uses { get; set; } = new() { Id = "grafo:uses", Type = "@id" };

        [JsonPropertyName("hasMember")]
        public JsonLdPropertyDef HasMember { get; set; } = new() { Id = "grafo:hasMember", Type = "@id" };
    }

    public class JsonLdPropertyDef
    {
        [JsonPropertyName("@id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("@type")]
        public string Type { get; set; } = "@id";
    }

    /// <summary>
    /// JSON-LD Node - standalone document, can be stored individually
    /// Uses short hash-based IDs for scalability
    /// </summary>
    public class JsonLdNode
    {
        /// <summary>
        /// Context reference - use external URL in production
        /// </summary>
        [JsonPropertyName("@context")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public object? Context { get; set; }

        [JsonPropertyName("@id")]
        public string Id { get; set; } = "";

        /// <summary>
        /// Type uses grafo: prefix directly (e.g., "grafo:Class", "grafo:Method")
        /// </summary>
        [JsonPropertyName("@type")]
        public string Type { get; set; } = "";

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("grafo:fullName")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? FullName { get; set; }

        [JsonPropertyName("grafo:namespace")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Namespace { get; set; }

        [JsonPropertyName("grafo:project")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Project { get; set; }

        [JsonPropertyName("grafo:accessibility")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Accessibility { get; set; }

        [JsonPropertyName("grafo:isAbstract")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public bool IsAbstract { get; set; }

        [JsonPropertyName("grafo:isStatic")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public bool IsStatic { get; set; }

        [JsonPropertyName("grafo:isSealed")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public bool IsSealed { get; set; }

        [JsonPropertyName("grafo:location")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public JsonLdLocation? Location { get; set; }

        [JsonPropertyName("grafo:layer")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? Layer { get; set; }

        [JsonPropertyName("containedIn")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? ContainedIn { get; set; }

        // Relationships as arrays of IDs (simple strings for scalability)
        [JsonPropertyName("contains")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? Contains { get; set; }

        [JsonPropertyName("calls")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? Calls { get; set; }

        [JsonPropertyName("callsVia")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? CallsVia { get; set; }

        [JsonPropertyName("indirectCall")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? IndirectCall { get; set; }

        [JsonPropertyName("implements")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? Implements { get; set; }

        [JsonPropertyName("inherits")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? Inherits { get; set; }

        [JsonPropertyName("uses")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? Uses { get; set; }

        [JsonPropertyName("hasMember")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<string>? HasMember { get; set; }
    }

    public class JsonLdLocation
    {
        [JsonPropertyName("grafo:path")]
        public string Path { get; set; } = "";

        [JsonPropertyName("grafo:line")]
        public int Line { get; set; }

        [JsonPropertyName("grafo:column")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int Column { get; set; }
    }

    /// <summary>
    /// Metadata document - first line in NDJSON output
    /// </summary>
    public class JsonLdMetadataDoc
    {
        [JsonPropertyName("@context")]
        public object? Context { get; set; }

        [JsonPropertyName("@id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("@type")]
        public string Type { get; set; } = "grafo:CodeGraph";

        [JsonPropertyName("grafo:generatedAt")]
        public DateTime GeneratedAt { get; set; }

        [JsonPropertyName("grafo:solutionPath")]
        public string SolutionPath { get; set; } = "";

        [JsonPropertyName("grafo:toolVersion")]
        public string ToolVersion { get; set; } = "2.0.0";

        [JsonPropertyName("grafo:format")]
        public string Format { get; set; } = "NDJSON-LD";

        [JsonPropertyName("grafo:nodeCount")]
        public int NodeCount { get; set; }

        [JsonPropertyName("grafo:relationshipCount")]
        public int RelationshipCount { get; set; }
    }

    /// <summary>
    /// Helper class to generate short hash-based JSON-LD URIs
    /// </summary>
    public static class JsonLdUri
    {
        public const string BaseUri = "https://grafo.dev/";
        public const string SchemaUri = "https://grafo.dev/schema/";
        public const string ContextUrl = "https://grafo.dev/schema/context.jsonld";

        /// <summary>
        /// Creates a short hash-based ID for any component
        /// Format: grafo:{type}/{hash8}
        /// Example: grafo:class/a1b2c3d4
        /// </summary>
        public static string CreateId(string type, string fullName)
        {
            var hash = ComputeShortHash(fullName);
            var shortType = type.ToLower() switch
            {
                "solution" => "sln",
                "layer" => "lyr",
                "project" => "prj",
                "file" => "file",
                "class" => "cls",
                "interface" => "ifc",
                "method" => "mtd",
                "property" => "prop",
                "field" => "fld",
                "struct" => "str",
                "enum" => "enm",
                _ => "cmp"
            };
            return $"grafo:{shortType}/{hash}";
        }

        /// <summary>
        /// Creates ID from old-style ID (for migration)
        /// </summary>
        public static string FromOldId(string oldId, string? type = null)
        {
            if (string.IsNullOrEmpty(oldId))
                return "";

            // Already new format
            if (oldId.StartsWith("grafo:"))
                return oldId;

            // Parse old format: "prefix:identifier"
            var colonIndex = oldId.IndexOf(':');
            if (colonIndex > 0)
            {
                var prefix = oldId.Substring(0, colonIndex);
                var identifier = oldId.Substring(colonIndex + 1);

                var nodeType = prefix.ToLower() switch
                {
                    "solution" => "Solution",
                    "layer" => "Layer",
                    "project" => "Project",
                    "file" => "File",
                    "component" => type ?? InferTypeFromName(identifier),
                    _ => type ?? "Component"
                };

                return CreateId(nodeType, identifier);
            }

            return CreateId(type ?? "Component", oldId);
        }

        /// <summary>
        /// Computes 8-character hash from fullName
        /// </summary>
        private static string ComputeShortHash(string input)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
            // Use first 4 bytes = 8 hex characters
            return Convert.ToHexString(bytes, 0, 4).ToLower();
        }

        /// <summary>
        /// Infers type from naming conventions
        /// </summary>
        private static string InferTypeFromName(string name)
        {
            if (string.IsNullOrEmpty(name)) return "Component";

            var lastPart = name.Split('.').LastOrDefault() ?? name;

            // Method indicators
            if (name.Contains("(") || name.Contains(")"))
                return "Method";

            // Interface indicator (starts with I + uppercase)
            if (lastPart.StartsWith("I") && lastPart.Length > 1 && char.IsUpper(lastPart[1]))
                return "Interface";

            return "Class";
        }

        /// <summary>
        /// Gets the grafo: type prefix for a node type
        /// </summary>
        public static string GetTypeUri(string type)
        {
            return $"grafo:{type}";
        }
    }
}
