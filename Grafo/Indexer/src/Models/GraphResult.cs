using System.Collections.Generic;

namespace RoslynIndexer.Models
{
    public class GraphResult
    {
        public GraphMetadata Metadata { get; set; } = new();
        public List<GraphNode> Nodes { get; set; } = new();
        public List<GraphEdge> Edges { get; set; } = new();
        public List<GraphCluster> Clusters { get; set; } = new();
        public GraphStatistics Statistics { get; set; } = new();
    }

    public class GraphMetadata
    {
        public DateTime GeneratedAt { get; set; }
        public string SolutionPath { get; set; } = "";
        public string ToolVersion { get; set; } = "1.0.0";
        public int TotalNodes { get; set; }
        public int TotalEdges { get; set; }
    }

    public class GraphStatistics
    {
        public int TotalNodes { get; set; }
        public int TotalEdges { get; set; }
        public int TotalClusters { get; set; }
        public int LayerCount { get; set; }
        public int ProjectCount { get; set; }
        public int ComponentCount { get; set; }
    }

    public class GraphNode
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string FullName { get; set; } = "";
        public string Type { get; set; } = "";
        public string Project { get; set; } = "";
        public string Namespace { get; set; } = "";
        public string Accessibility { get; set; } = "";
        public bool IsAbstract { get; set; }
        public bool IsStatic { get; set; }
        public bool IsSealed { get; set; }
        public GraphLocation? Location { get; set; }
        public GraphNodeAttributes Attributes { get; set; } = new();

        /// <summary>
        /// For Method nodes: the full name of the containing class/interface.
        /// Enables direct lookup of methods by their parent type.
        /// Example: "Namespace.ClassName" for method "Namespace.ClassName.MethodName"
        /// </summary>
        public string? ContainingType { get; set; }
    }

    public class GraphLocation
    {
        public string AbsolutePath { get; set; } = "";
        public string RelativePath { get; set; } = "";
        public int Line { get; set; }
        public int Column { get; set; }
    }

    public class GraphNodeAttributes
    {
        public string Group { get; set; } = "";
        public string Layer { get; set; } = "";
        public int Importance { get; set; } = 5;
        public int Size { get; set; } = 10;
        public string Color { get; set; } = "#4A90E2";
    }

    public class GraphEdge
    {
        public string Id { get; set; } = "";
        public string Source { get; set; } = "";
        public string Target { get; set; } = "";
        public string Relationship { get; set; } = "";
        public double Strength { get; set; } = 1.0;
        public int Count { get; set; } = 1;
        public GraphEdgeAttributes Attributes { get; set; } = new();
    }

    public class GraphEdgeAttributes
    {
        public string Style { get; set; } = "solid";
        public string Color { get; set; } = "#666666";
        public double Weight { get; set; } = 1.0;
    }

    public class GraphCluster
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Type { get; set; } = "";
        public List<string> Nodes { get; set; } = new();
        public GraphClusterAttributes Attributes { get; set; } = new();
    }

    public class GraphClusterAttributes
    {
        public string Color { get; set; } = "#E8E8E8";
        public string Style { get; set; } = "rounded";
    }
}
