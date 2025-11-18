using System.Text.RegularExpressions;
using SymbolInfo = RoslynIndexer.Models.SymbolInfo;
using MethodInvocationInfo = RoslynIndexer.Models.MethodInvocationInfo;
using TypeUsageInfo = RoslynIndexer.Models.TypeUsageInfo;
using InheritanceInfo = RoslynIndexer.Models.InheritanceInfo;
using ImplementationInfo = RoslynIndexer.Models.ImplementationInfo;
using GraphResult = RoslynIndexer.Models.GraphResult;
using GraphNode = RoslynIndexer.Models.GraphNode;
using GraphEdge = RoslynIndexer.Models.GraphEdge;
using GraphCluster = RoslynIndexer.Models.GraphCluster;
using GraphMetadata = RoslynIndexer.Models.GraphMetadata;
using GraphStatistics = RoslynIndexer.Models.GraphStatistics;
using GraphNodeAttributes = RoslynIndexer.Models.GraphNodeAttributes;
using GraphEdgeAttributes = RoslynIndexer.Models.GraphEdgeAttributes;
using GraphClusterAttributes = RoslynIndexer.Models.GraphClusterAttributes;
using GraphLocation = RoslynIndexer.Models.GraphLocation;

namespace RoslynIndexer.Services
{
    public class GraphService
    {
        public async Task<GraphResult> GenerateSymbolGraph(
            List<SymbolInfo> symbols, 
            string solutionPath,
            List<MethodInvocationInfo>? methodInvocations = null,
            List<TypeUsageInfo>? typeUsages = null,
            List<InheritanceInfo>? inheritanceRelations = null,
            List<ImplementationInfo>? interfaceImplementations = null)
        {
            Console.WriteLine("Generating architectural hierarchy graph...");
            
            // Find repository root (where .git is) or use solution directory as fallback
            var solutionDirectory = Path.GetDirectoryName(solutionPath) ?? "";
            var repositoryRoot = FindRepositoryRoot(solutionPath) ?? solutionDirectory;
            
            Console.WriteLine($"Repository root detected: {repositoryRoot}");
            
            var graph = new GraphResult
            {
                Metadata = new GraphMetadata
                {
                    GeneratedAt = DateTime.UtcNow,
                    SolutionPath = solutionPath,
                    ToolVersion = "1.0.0"
                }
            };

            var nodes = new List<GraphNode>();
            var edges = new List<GraphEdge>();
            var clusters = new List<GraphCluster>();

            // Step 1: Create solution root node
            var solutionNode = CreateSolutionNode(solutionPath, repositoryRoot);
            nodes.Add(solutionNode);

            // Step 2: Analyze and group projects by architectural layers
            var projectsByLayer = AnalyzeProjectLayers(symbols);
            
            // Step 3: Create architectural layer nodes and clusters
            var layerNodes = CreateArchitecturalLayers(projectsByLayer);
            nodes.AddRange(layerNodes);
            
            var layerClusters = CreateArchitecturalClusters(projectsByLayer);
            clusters.AddRange(layerClusters);
            
            // Step 4: Create solution -> layer edges
            foreach (var layerNode in layerNodes)
            {
                edges.Add(new GraphEdge
                {
                    Id = $"solution-contains-{layerNode.Id}",
                    Source = solutionNode.Id,
                    Target = layerNode.Id,
                    Relationship = "contains",
                    Strength = 1.0,
                    Count = 1,
                    Attributes = new GraphEdgeAttributes
                    {
                        Style = "solid",
                        Color = "#2E86AB",
                        Weight = 2.0
                    }
                });
            }

            // Step 5: Create project nodes within layers
            foreach (var layer in projectsByLayer)
            {
                var layerId = $"layer:{layer.Key}";
                
                foreach (var project in layer.Value)
                {
                    var projectNode = CreateProjectNode(project.Key, project.Value, layer.Key, solutionPath, repositoryRoot);
                    nodes.Add(projectNode);
                    
                    // Layer contains project edge
                    edges.Add(new GraphEdge
                    {
                        Id = $"layer-contains-{projectNode.Id}",
                        Source = layerId,
                        Target = projectNode.Id,
                        Relationship = "contains",
                        Strength = 1.0,
                        Count = 1,
                        Attributes = new GraphEdgeAttributes
                        {
                            Style = "solid",
                            Color = GetLayerColor(layer.Key),
                            Weight = 1.5
                        }
                    });
                }
            }

            // Step 6: Create component nodes (key classes/interfaces) within projects
            var componentNodes = CreateComponentNodes(symbols, projectsByLayer, repositoryRoot);
            nodes.AddRange(componentNodes.nodes);
            edges.AddRange(componentNodes.edges);

            // Step 7: Create architectural dependencies between layers
            var layerDependencies = CreateLayerDependencies(projectsByLayer);
            edges.AddRange(layerDependencies);

            // Step 8: Create project dependencies
            var projectDependencies = await CreateProjectDependencies(symbols, projectsByLayer, solutionPath);
            edges.AddRange(projectDependencies);

            // Step 9: Create Uses/Calls relationships from method invocations and type usages
            if (methodInvocations != null && methodInvocations.Any())
            {
                var usageEdges = CreateUsageRelationships(methodInvocations, typeUsages, symbols);
                edges.AddRange(usageEdges);
                Console.WriteLine($"Created {usageEdges.Count} usage/call relationships");
            }
            
            // Step 10: Create Inheritance relationships
            if (inheritanceRelations != null && inheritanceRelations.Any())
            {
                var inheritanceEdges = CreateInheritanceRelationships(inheritanceRelations, symbols);
                edges.AddRange(inheritanceEdges);
                Console.WriteLine($"Created {inheritanceEdges.Count} inheritance relationships");
            }
            
            // Step 11: Create Interface Implementation relationships
            if (interfaceImplementations != null && interfaceImplementations.Any())
            {
                var implementationEdges = CreateImplementationRelationships(interfaceImplementations, symbols);
                edges.AddRange(implementationEdges);
                Console.WriteLine($"Created {implementationEdges.Count} interface implementation relationships");
            }

            graph.Nodes = nodes;
            graph.Edges = edges;
            graph.Clusters = clusters;
            graph.Statistics = new GraphStatistics
            {
                TotalNodes = nodes.Count,
                TotalEdges = edges.Count,
                TotalClusters = clusters.Count,
                LayerCount = projectsByLayer.Count,
                ProjectCount = projectsByLayer.SelectMany(l => l.Value).Count(),
                ComponentCount = componentNodes.nodes.Count(n => n.Type == "Class" || n.Type == "Interface" || n.Type == "Struct" || n.Type == "Enum" || n.Type == "Method")
            };

            Console.WriteLine($"Generated architectural graph: {nodes.Count} nodes, {edges.Count} edges, {clusters.Count} clusters");
            return graph;
        }

        public GraphResult GenerateStructuralOnlyGraph(GraphResult fullGraph)
        {
            Console.WriteLine("Generating structural-only graph (Root/Layer/Project/File only)...");
            
            var structuralGraph = new GraphResult
            {
                Metadata = new GraphMetadata
                {
                    GeneratedAt = fullGraph.Metadata.GeneratedAt,
                    SolutionPath = fullGraph.Metadata.SolutionPath,
                    ToolVersion = fullGraph.Metadata.ToolVersion
                }
            };

            var nodes = new List<GraphNode>();
            var edges = new List<GraphEdge>();
            var clusters = new List<GraphCluster>();
            var nodeIds = new HashSet<string>();

            // Step 1: Include only structural node types
            var allowedTypes = new HashSet<string> { "Solution", "Layer", "Project", "File" };
            
            foreach (var node in fullGraph.Nodes)
            {
                if (allowedTypes.Contains(node.Type))
                {
                    nodes.Add(node);
                    nodeIds.Add(node.Id);
                }
            }

            // Step 2: Include only edges between structural nodes
            foreach (var edge in fullGraph.Edges)
            {
                if (nodeIds.Contains(edge.Source) && nodeIds.Contains(edge.Target))
                {
                    edges.Add(edge);
                }
            }

            // Step 3: Include clusters that contain structural nodes
            foreach (var cluster in fullGraph.Clusters)
            {
                // Check if cluster contains any of our structural nodes
                if (cluster.Nodes?.Any(clusterNodeId => nodeIds.Contains(clusterNodeId)) == true)
                {
                    // Create a new cluster with only structural nodes
                    var structuralClusterNodes = cluster.Nodes.Where(nodeIds.Contains).ToList();
                    if (structuralClusterNodes.Any())
                    {
                        clusters.Add(new GraphCluster
                        {
                            Id = cluster.Id,
                            Name = cluster.Name,
                            Type = cluster.Type,
                            Nodes = structuralClusterNodes,
                            Attributes = cluster.Attributes
                        });
                    }
                }
            }

            structuralGraph.Nodes = nodes;
            structuralGraph.Edges = edges;
            structuralGraph.Clusters = clusters;
            structuralGraph.Statistics = new GraphStatistics
            {
                TotalNodes = nodes.Count,
                TotalEdges = edges.Count,
                TotalClusters = clusters.Count,
                ComponentCount = nodes.Count(n => n.Type == "File"),
                LayerCount = nodes.Count(n => n.Type == "Layer"),
                ProjectCount = nodes.Count(n => n.Type == "Project")
            };

            Console.WriteLine($"Generated structural graph: {nodes.Count} nodes, {edges.Count} edges, {clusters.Count} clusters");
            Console.WriteLine($"  Solution: {nodes.Count(n => n.Type == "Solution")}");
            Console.WriteLine($"  Layers: {nodes.Count(n => n.Type == "Layer")}");
            Console.WriteLine($"  Projects: {nodes.Count(n => n.Type == "Project")}");
            Console.WriteLine($"  Files: {nodes.Count(n => n.Type == "File")}");
            
            return structuralGraph;
        }

        private GraphNode CreateSolutionNode(string solutionPath, string repositoryRoot)
        {
            var solutionName = Path.GetFileNameWithoutExtension(solutionPath);
            var absoluteSolutionPath = Path.GetFullPath(solutionPath);
            
            // Use CreateLocation to get proper relative path from repository root
            var solutionLocation = CreateLocation(absoluteSolutionPath, repositoryRoot, 1, 1);
            
            return new GraphNode
            {
                Id = "solution:root",
                Name = solutionName,
                FullName = solutionName,
                Type = "Solution",
                Project = "",
                Namespace = "",
                Accessibility = "Public",
                Location = solutionLocation,
                Attributes = new GraphNodeAttributes
                {
                    Group = "solution",
                    Layer = "root",
                    Importance = 10,
                    Size = 40,
                    Color = "#1F2937"
                }
            };
        }

        private Dictionary<string, Dictionary<string, List<SymbolInfo>>> AnalyzeProjectLayers(List<SymbolInfo> symbols)
        {
            Console.WriteLine("Analyzing project layers...");
            
            var projectsByLayer = new Dictionary<string, Dictionary<string, List<SymbolInfo>>>();
            var projects = symbols.GroupBy(s => s.Project).ToDictionary(g => g.Key, g => g.ToList());
            
            foreach (var project in projects)
            {
                var layer = DetectProjectLayer(project.Key);
                
                if (!projectsByLayer.ContainsKey(layer))
                    projectsByLayer[layer] = new Dictionary<string, List<SymbolInfo>>();
                    
                projectsByLayer[layer][project.Key] = project.Value;
            }
            
            Console.WriteLine($"Detected layers: {string.Join(", ", projectsByLayer.Keys)}");
            return projectsByLayer;
        }

        private string DetectProjectLayer(string projectName)
        {
            var lowerName = projectName.ToLower();
            
            // Presentation Layer
            if (lowerName.Contains("web") || lowerName.Contains("api") || lowerName.Contains("mvc") || 
                lowerName.Contains("ui") || lowerName.Contains("frontend") || lowerName.Contains("client"))
                return "presentation";
            
            // Services Layer
            if (lowerName.Contains("service") || lowerName.Contains("application") || lowerName.Contains("app"))
                return "services";
            
            // Business Layer
            if (lowerName.Contains("business") || lowerName.Contains("domain") || lowerName.Contains("core") || 
                lowerName.Contains("logic") || lowerName.Contains("engine"))
                return "business";
            
            // Data Layer
            if (lowerName.Contains("data") || lowerName.Contains("repository") || lowerName.Contains("persistence") || 
                lowerName.Contains("database") || lowerName.Contains("entity"))
                return "data";
            
            // Infrastructure Layer
            if (lowerName.Contains("infrastructure") || lowerName.Contains("common") || lowerName.Contains("shared") || 
                lowerName.Contains("framework") || lowerName.Contains("utility") || lowerName.Contains("tools"))
                return "infrastructure";
            
            // Test Layer
            if (lowerName.Contains("test") || lowerName.Contains("spec") || lowerName.Contains("unit") || 
                lowerName.Contains("integration"))
                return "test";
            
            // Default to business layer
            return "business";
        }

        private List<GraphNode> CreateArchitecturalLayers(Dictionary<string, Dictionary<string, List<SymbolInfo>>> projectsByLayer)
        {
            var layerNodes = new List<GraphNode>();
            var layerColors = new Dictionary<string, string>
            {
                ["presentation"] = "#3B82F6",   // Blue
                ["services"] = "#10B981",       // Green  
                ["business"] = "#F59E0B",       // Orange
                ["data"] = "#EF4444",          // Red
                ["infrastructure"] = "#6B7280", // Gray
                ["test"] = "#8B5CF6"           // Purple
            };
            
            foreach (var layer in projectsByLayer)
            {
                var projectCount = layer.Value.Count;
                var symbolCount = layer.Value.SelectMany(p => p.Value).Count();
                
                var layerNode = new GraphNode
                {
                    Id = $"layer:{layer.Key}",
                    Name = layer.Key.ToUpper() + " LAYER",
                    FullName = $"{layer.Key} Layer ({projectCount} projects, {symbolCount} symbols)",
                    Type = "Layer",
                    Project = "",
                    Namespace = "",
                    Accessibility = "Public",
                    Attributes = new GraphNodeAttributes
                    {
                        Group = "layer",
                        Layer = layer.Key,
                        Importance = GetLayerImportance(layer.Key),
                        Size = Math.Max(25, projectCount * 5),
                        Color = layerColors.ContainsKey(layer.Key) ? layerColors[layer.Key] : "#6B7280"
                    }
                };
                
                layerNodes.Add(layerNode);
            }
            
            return layerNodes;
        }

        private int GetLayerImportance(string layerName)
        {
            return layerName switch
            {
                "presentation" => 9,
                "services" => 8,
                "business" => 10,
                "data" => 7,
                "infrastructure" => 6,
                "test" => 3,
                _ => 5
            };
        }

        private string GetLayerColor(string layerName)
        {
            return layerName switch
            {
                "presentation" => "#3B82F6",
                "services" => "#10B981",
                "business" => "#F59E0B",
                "data" => "#EF4444",
                "infrastructure" => "#6B7280",
                "test" => "#8B5CF6",
                _ => "#6B7280"
            };
        }

        private GraphNode CreateProjectNode(
            string projectName, 
            List<SymbolInfo> projectSymbols, 
            string layerName,
            string solutionPath,
            string repositoryRoot)
        {
            var classCount = projectSymbols.Count(s => s.Type == "Class");
            var interfaceCount = projectSymbols.Count(s => s.Type == "Interface");
            
            // Try to find the .csproj file for this project
            GraphLocation? projectLocation = null;
            try
            {
                // Search for .csproj file starting from repository root
                var csprojFiles = Directory.GetFiles(repositoryRoot, $"{projectName}.csproj", SearchOption.AllDirectories);
                if (csprojFiles.Length > 0)
                {
                    projectLocation = CreateLocation(csprojFiles[0], repositoryRoot, 1, 1);
                }
            }
            catch
            {
                // If we can't find the .csproj, leave Location as null
            }
            
            return new GraphNode
            {
                Id = $"project:{projectName}",
                Name = projectName,
                FullName = $"{projectName} ({classCount} classes, {interfaceCount} interfaces)",
                Type = "Project",
                Project = projectName,
                Namespace = "",
                Accessibility = "Public",
                Location = projectLocation,
                Attributes = new GraphNodeAttributes
                {
                    Group = "project",
                    Layer = layerName,
                    Importance = 7,
                    Size = Math.Max(15, projectSymbols.Count / 10),
                    Color = GetLayerColor(layerName)
                }
            };
        }

        private (List<GraphNode> nodes, List<GraphEdge> edges) CreateComponentNodes(
            List<SymbolInfo> symbols, 
            Dictionary<string, Dictionary<string, List<SymbolInfo>>> projectsByLayer,
            string repositoryRoot)
        {
            var nodes = new List<GraphNode>();
            var edges = new List<GraphEdge>();
            
            // Show all classes, interfaces, and methods
            var componentTypes = new[] { "Class", "Interface", "Method" };
            
            foreach (var layer in projectsByLayer)
            {
                foreach (var project in layer.Value)
                {
                    var componentSymbols = project.Value.Where(s => 
                        componentTypes.Contains(s.Type))
                        .ToList();
                    
                    // Group components by their source file
                    var componentsByFile = componentSymbols
                        .Where(s => !string.IsNullOrEmpty(s.File))
                        .GroupBy(s => s.File)
                        .ToDictionary(g => g.Key, g => g.ToList());
                    
                    foreach (var fileGroup in componentsByFile)
                    {
                        var filePath = fileGroup.Key;
                        var fileComponents = fileGroup.Value;
                        
                        // Create unique file identifier
                        var fileName = Path.GetFileName(filePath);
                        var relativePath = GetRelativePathFromProject(filePath, project.Key);
                        var fileId = $"file:{project.Key}:{relativePath.Replace('\\', '/')}";
                        
                        // Create file node
                        var fileNode = new GraphNode
                        {
                            Id = fileId,
                            Name = fileName,
                            FullName = relativePath,
                            Type = "File",
                            Project = project.Key,
                            Namespace = "",
                            Accessibility = "Public",
                            Location = CreateLocation(filePath, repositoryRoot, 1, 1),
                            Attributes = new GraphNodeAttributes
                            {
                                Group = "file",
                                Layer = layer.Key,
                                Importance = GetFileImportance(fileName, fileComponents.Count),
                                Size = Math.Min(5 + fileComponents.Count * 2, 30), // Size based on components count
                                Color = GetFileColor(fileName)
                            }
                        };
                        
                        nodes.Add(fileNode);
                        
                        // Project contains file edge
                        edges.Add(new GraphEdge
                        {
                            Id = $"project-contains-{fileNode.Id}",
                            Source = $"project:{project.Key}",
                            Target = fileNode.Id,
                            Relationship = "contains",
                            Strength = 1.0,
                            Count = 1,
                            Attributes = new GraphEdgeAttributes
                            {
                                Style = "solid",
                                Color = "#6B7280",
                                Weight = 1.0
                            }
                        });
                        
                        // Create component nodes for this file
                        foreach (var symbol in fileComponents)
                        {
                            var componentNode = new GraphNode
                            {
                                Id = $"component:{symbol.FullName}",
                                Name = symbol.Name,
                                FullName = symbol.FullName,
                                Type = symbol.Type,  // Preserve original type (Class, Interface, etc.)
                                Project = symbol.Project,
                                Namespace = GetNamespaceFromFullName(symbol.FullName),
                                Accessibility = symbol.Accessibility,
                                Location = CreateLocation(symbol.File, repositoryRoot, symbol.Line, symbol.Column),
                                Attributes = new GraphNodeAttributes
                                {
                                    Group = "component",
                                    Layer = layer.Key,
                                    Importance = GetComponentImportance(symbol),
                                    Size = 8,
                                    Color = GetComponentColor(symbol)
                                }
                            };
                            
                            nodes.Add(componentNode);
                            
                            // File contains component edge
                            edges.Add(new GraphEdge
                            {
                                Id = $"file-contains-{componentNode.Id}",
                                Source = fileNode.Id,
                                Target = componentNode.Id,
                                Relationship = "contains",
                                Strength = 1.0,
                                Count = 1,
                                Attributes = new GraphEdgeAttributes
                                {
                                    Style = "dashed",
                                    Color = "#9CA3AF",
                                    Weight = 0.8
                                }
                            });
                        }
                    }
                }
            }
            
            return (nodes, edges);
        }

        private int GetComponentImportance(SymbolInfo symbol)
        {
            var lowerName = symbol.FullName.ToLower();
            
            // Methods have lower importance than classes/interfaces
            if (symbol.Type == "Method") return 2;
            
            if (lowerName.Contains("controller")) return 8;
            if (lowerName.Contains("service")) return 7;
            if (lowerName.Contains("repository")) return 6;
            if (lowerName.Contains("manager")) return 5;
            if (lowerName.Contains("provider") || lowerName.Contains("factory")) return 4;
            
            return 3;
        }

        private string GetComponentColor(SymbolInfo symbol)
        {
            var lowerName = symbol.FullName.ToLower();
            
            if (lowerName.Contains("controller")) return "#EC4899";
            if (lowerName.Contains("service")) return "#06B6D4";
            if (lowerName.Contains("repository")) return "#84CC16";
            if (lowerName.Contains("manager")) return "#F97316";
            if (symbol.Type == "Interface") return "#A78BFA";
            if (symbol.Type == "Method") return "#94A3B8";  // Gray-blue for methods
            
            return "#64748B";
        }

        private string GetRelativePathFromProject(string filePath, string projectName)
        {
            try
            {
                // Find the project folder in the path
                var pathSegments = filePath.Split(new char[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries);
                var projectIndex = -1;
                
                for (int i = 0; i < pathSegments.Length; i++)
                {
                    if (pathSegments[i].Equals(projectName, StringComparison.OrdinalIgnoreCase) ||
                        pathSegments[i].StartsWith(projectName + ".", StringComparison.OrdinalIgnoreCase))
                    {
                        projectIndex = i;
                        break;
                    }
                }
                
                if (projectIndex >= 0 && projectIndex < pathSegments.Length - 1)
                {
                    return string.Join("/", pathSegments.Skip(projectIndex + 1));
                }
                
                // Fallback: just return the file name
                return Path.GetFileName(filePath);
            }
            catch
            {
                return Path.GetFileName(filePath);
            }
        }

        private int GetFileImportance(string fileName, int componentCount)
        {
            var lowerName = fileName.ToLower();
            
            // Important configuration files
            if (lowerName == "startup.cs" || lowerName == "program.cs") return 10;
            if (lowerName.Contains("config") || lowerName.Contains("settings")) return 8;
            
            // Important architectural files
            if (lowerName.Contains("controller")) return 7;
            if (lowerName.Contains("service")) return 6;
            if (lowerName.Contains("repository")) return 5;
            if (lowerName.Contains("manager") || lowerName.Contains("provider")) return 4;
            
            // Base importance plus component count factor
            return Math.Max(3, Math.Min(7, 3 + componentCount / 2));
        }

        private string GetFileColor(string fileName)
        {
            var lowerName = fileName.ToLower();
            
            // Configuration files
            if (lowerName == "startup.cs" || lowerName == "program.cs") return "#DC2626";
            if (lowerName.Contains("config") || lowerName.Contains("settings")) return "#EA580C";
            
            // Architectural files
            if (lowerName.Contains("controller")) return "#EC4899";
            if (lowerName.Contains("service")) return "#06B6D4";
            if (lowerName.Contains("repository")) return "#84CC16";
            if (lowerName.Contains("manager") || lowerName.Contains("provider")) return "#F97316";
            if (lowerName.Contains("test")) return "#8B5CF6";
            
            // Default file color
            return "#475569";
        }

        private List<GraphCluster> CreateArchitecturalClusters(Dictionary<string, Dictionary<string, List<SymbolInfo>>> projectsByLayer)
        {
            var clusters = new List<GraphCluster>();
            
            foreach (var layer in projectsByLayer)
            {
                var projectNodes = layer.Value.Keys.Select(p => $"project:{p}").ToList();
                
                var cluster = new GraphCluster
                {
                    Id = $"cluster:{layer.Key}",
                    Name = $"{layer.Key.ToUpper()} LAYER",
                    Type = "layer",
                    Nodes = projectNodes,
                    Attributes = new GraphClusterAttributes
                    {
                        Color = GetLayerClusterColor(layer.Key),
                        Style = "rounded"
                    }
                };
                
                clusters.Add(cluster);
            }
            
            return clusters;
        }

        private string GetLayerClusterColor(string layerName)
        {
            return layerName switch
            {
                "presentation" => "#EBF4FF",
                "services" => "#ECFDF5",
                "business" => "#FFFBEB",
                "data" => "#FEF2F2",
                "infrastructure" => "#F9FAFB",
                "test" => "#F3F4F6",
                _ => "#F9FAFB"
            };
        }

        private List<GraphEdge> CreateLayerDependencies(Dictionary<string, Dictionary<string, List<SymbolInfo>>> projectsByLayer)
        {
            var edges = new List<GraphEdge>();
            var layerOrder = new[] { "presentation", "services", "business", "data", "infrastructure" };
            
            // Create typical architectural dependencies
            for (int i = 0; i < layerOrder.Length - 1; i++)
            {
                var sourceLayer = layerOrder[i];
                var targetLayer = layerOrder[i + 1];
                
                if (projectsByLayer.ContainsKey(sourceLayer) && projectsByLayer.ContainsKey(targetLayer))
                {
                    edges.Add(new GraphEdge
                    {
                        Id = $"layer-dependency:{sourceLayer}->{targetLayer}",
                        Source = $"layer:{sourceLayer}",
                        Target = $"layer:{targetLayer}",
                        Relationship = "depends-on",
                        Strength = 0.8,
                        Count = 1,
                        Attributes = new GraphEdgeAttributes
                        {
                            Style = "solid",
                            Color = "#4B5563",
                            Weight = 2.0
                        }
                    });
                }
            }
            
            return edges;
        }

        private async Task<List<GraphEdge>> CreateProjectDependencies(List<SymbolInfo> symbols, Dictionary<string, Dictionary<string, List<SymbolInfo>>> projectsByLayer, string solutionPath)
        {
            var edges = new List<GraphEdge>();
            var projects = symbols.GroupBy(s => s.Project).ToDictionary(g => g.Key, g => g.ToList());
            
            Console.WriteLine("Extracting actual project dependencies from .csproj files...");
            
            // Parse solution to get project paths
            var solutionDir = Path.GetDirectoryName(solutionPath);
            if (string.IsNullOrEmpty(solutionDir))
            {
                Console.WriteLine("Warning: Could not determine solution directory");
                return edges;
            }
            
            var solutionContent = await File.ReadAllTextAsync(solutionPath);
            var projectRegex = new Regex(
                @"Project\(""\{[^}]+\}""\)\s*=\s*""([^""]+)"",\s*""([^""]+)"",\s*""\{([^}]+)\}""");
            
            var projectPathMap = new Dictionary<string, string>();
            var matches = projectRegex.Matches(solutionContent);
            
            foreach (Match match in matches)
            {
                var projectName = match.Groups[1].Value;
                var projectPath = match.Groups[2].Value;
                
                if (!projectPath.EndsWith(".csproj")) continue;
                
                var fullProjectPath = Path.Combine(solutionDir, projectPath);
                projectPathMap[projectName] = fullProjectPath;
            }
            
            // Extract project references from each .csproj file
            foreach (var project in projects.Keys)
            {
                if (!projectPathMap.ContainsKey(project)) continue;
                
                var projectPath = projectPathMap[project];
                if (!File.Exists(projectPath)) continue;
                
                try
                {
                    var projectContent = await File.ReadAllTextAsync(projectPath);
                    var projectRefRegex = new Regex(
                        @"<ProjectReference\s+Include\s*=\s*""([^""]+)""");
                    
                    var refMatches = projectRefRegex.Matches(projectContent);
                    
                    foreach (Match refMatch in refMatches)
                    {
                        var refPath = refMatch.Groups[1].Value;
                        var targetProjectName = ExtractProjectNameFromPath(refPath);
                        
                        // Find the target project in our project list
                        if (projects.ContainsKey(targetProjectName))
                        {
                            edges.Add(new GraphEdge
                            {
                                Id = $"project-reference:{project}->{targetProjectName}",
                                Source = $"project:{project}",
                                Target = $"project:{targetProjectName}",
                                Relationship = "project_reference",
                                Strength = 1.0,
                                Count = 1,
                                Attributes = new GraphEdgeAttributes
                                {
                                    Style = "solid",
                                    Color = "#059669",
                                    Weight = 1.5
                                }
                            });
                            
                            Console.WriteLine($"  Found dependency: {project} -> {targetProjectName}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Warning: Could not parse project file {projectPath}: {ex.Message}");
                }
            }
            
            Console.WriteLine($"Extracted {edges.Count} project dependencies from .csproj files");
            return edges;
        }
        
        private string ExtractProjectNameFromPath(string projectPath)
        {
            // Extract project name from path like "../Common/Infocorp.Services.Common.csproj"
            var fileName = Path.GetFileNameWithoutExtension(projectPath);
            return fileName;
        }

        private string GetNamespaceFromFullName(string fullName)
        {
            var lastDot = fullName.LastIndexOf('.');
            return lastDot > 0 ? fullName.Substring(0, lastDot) : "";
        }

        private List<GraphEdge> CreateUsageRelationships(
            List<MethodInvocationInfo> methodInvocations,
            List<TypeUsageInfo>? typeUsages,
            List<SymbolInfo> symbols)
        {
            var edges = new List<GraphEdge>();
            
            Console.WriteLine($"Building optimized symbol indices...");
            var startTime = DateTime.Now;
            
            // Build optimized indices for fast lookups
            var symbolLookup = symbols
                .GroupBy(s => s.FullName)
                .ToDictionary(g => g.Key, g => g.First());
            
            // Index by simple name (case-insensitive) for fast lookups
            var componentTypes = new[] { "Class", "Interface", "Struct", "Enum", "Method" };
            var components = symbols.Where(s => componentTypes.Contains(s.Type)).ToList();
            
            var nameIndex = new Dictionary<string, List<SymbolInfo>>(StringComparer.OrdinalIgnoreCase);
            var projectIndex = new Dictionary<string, List<SymbolInfo>>();
            
            foreach (var symbol in components)
            {
                // Index by Name
                if (!nameIndex.ContainsKey(symbol.Name))
                    nameIndex[symbol.Name] = new List<SymbolInfo>();
                nameIndex[symbol.Name].Add(symbol);
                
                // Index by Project
                if (!projectIndex.ContainsKey(symbol.Project))
                    projectIndex[symbol.Project] = new List<SymbolInfo>();
                projectIndex[symbol.Project].Add(symbol);
            }
            
            Console.WriteLine($"Indices built in {(DateTime.Now - startTime).TotalMilliseconds:F0}ms. Processing {methodInvocations.Count} method invocations...");

            // Process method invocations to create "Calls" relationships
            var processedCalls = new HashSet<string>();
            var searchCache = new Dictionary<string, SymbolInfo?>();
            int processed = 0;
            
            foreach (var invocation in methodInvocations)
            {
                try
                {
                    // Progress logging every 10,000 items
                    if (++processed % 10000 == 0)
                        Console.WriteLine($"  Processed {processed}/{methodInvocations.Count} invocations ({edges.Count} edges created)...");
                    
                    // Parse the invocation expression to extract the method/type being called
                    var targetInfo = ParseInvocationExpression(invocation.InvocationExpression);
                    if (!targetInfo.HasValue) continue;

                    // Use cache for repeated lookups
                    var cacheKey = $"{targetInfo.Value.typeName}|{invocation.CallerProject}";
                    if (!searchCache.TryGetValue(cacheKey, out var targetComponent))
                    {
                        targetComponent = FindMatchingComponentOptimized(targetInfo.Value, nameIndex, projectIndex, invocation.CallerProject);
                        searchCache[cacheKey] = targetComponent;
                    }
                    
                    if (targetComponent == null) continue;

                    // Create edge from caller type/method to target component
                    var sourceId = !string.IsNullOrEmpty(invocation.CallerMethod) 
                        ? $"component:{invocation.CallerMethod}"
                        : $"component:{invocation.CallerType}";
                    var targetId = $"component:{targetComponent.FullName}";

                    // Avoid duplicate edges
                    var edgeKey = $"{sourceId}->{targetId}";
                    if (processedCalls.Contains(edgeKey)) continue;
                    processedCalls.Add(edgeKey);

                    edges.Add(new GraphEdge
                    {
                        Id = $"calls-{Guid.NewGuid().ToString().Substring(0, 8)}-{sourceId}-{targetId}",
                        Source = sourceId,
                        Target = targetId,
                        Relationship = "Calls",
                        Strength = 0.7,
                        Count = 1,
                        Attributes = new GraphEdgeAttributes
                        {
                            Style = "dashed",
                            Color = "#FF6B6B",
                            Weight = 0.8
                        }
                    });
                }
                catch (Exception ex)
                {
                    // Skip malformed invocations
                    if (processed % 1000 == 0) // Only log errors occasionally to avoid spam
                        Console.WriteLine($"Warning: Could not process invocation '{invocation.InvocationExpression}': {ex.Message}");
                }
            }

            // Process type usages to create "Uses" relationships
            if (typeUsages != null && typeUsages.Count > 0)
            {
                Console.WriteLine($"Processing {typeUsages.Count} type usages...");
                var processedUses = new HashSet<string>();
                var usageCache = new Dictionary<string, SymbolInfo?>();
                int usageProcessed = 0;
                
                foreach (var usage in typeUsages)
                {
                    try
                    {
                        if (++usageProcessed % 10000 == 0)
                            Console.WriteLine($"  Processed {usageProcessed}/{typeUsages.Count} usages ({edges.Count} edges created)...");
                        
                        // Use cache for repeated lookups
                        var cacheKey = $"{usage.TypeName}|{usage.UsedInProject}";
                        if (!usageCache.TryGetValue(cacheKey, out var targetComponent))
                        {
                            targetComponent = FindComponentByTypeNameOptimized(usage.TypeName, symbolLookup, nameIndex, projectIndex, usage.UsedInProject);
                            usageCache[cacheKey] = targetComponent;
                        }
                        
                        if (targetComponent == null) continue;

                        // Create edge from user type to target type
                        var sourceId = !string.IsNullOrEmpty(usage.UsedInMethod)
                            ? $"component:{usage.UsedInMethod}"
                            : $"component:{usage.UsedInType}";
                        var targetId = $"component:{targetComponent.FullName}";

                        // Avoid duplicate edges
                        var edgeKey = $"{sourceId}->{targetId}";
                        if (processedUses.Contains(edgeKey)) continue;
                        processedUses.Add(edgeKey);

                        edges.Add(new GraphEdge
                        {
                            Id = $"uses-{Guid.NewGuid().ToString().Substring(0, 8)}-{sourceId}-{targetId}",
                            Source = sourceId,
                            Target = targetId,
                            Relationship = "Uses",
                            Strength = 0.6,
                            Count = 1,
                            Attributes = new GraphEdgeAttributes
                            {
                                Style = "dotted",
                                Color = "#4ECDC4",
                                Weight = 0.7
                            }
                        });
                    }
                    catch (Exception ex)
                    {
                        if (usageProcessed % 1000 == 0)
                            Console.WriteLine($"Warning: Could not process type usage '{usage.TypeName}': {ex.Message}");
                    }
                }
            }

            var totalTime = (DateTime.Now - startTime).TotalSeconds;
            Console.WriteLine($"Created {edges.Count} usage/call relationships in {totalTime:F1}s ({methodInvocations.Count / totalTime:F0} invocations/sec)");
            return edges;
        }

        private (string typeName, string? methodName)? ParseInvocationExpression(string expression)
        {
            try
            {
                // Handle patterns like:
                // - service.MethodName() -> service is instance, MethodName is method
                // - TypeName.StaticMethod() -> TypeName, StaticMethod
                // - this.Method() -> current type, Method
                
                var parts = expression.Split('.');
                if (parts.Length >= 2)
                {
                    var methodPart = parts[^1].Replace("(", "").Replace(")", "").Trim();
                    var typePart = string.Join(".", parts.Take(parts.Length - 1));
                    return (typePart, methodPart);
                }
                else if (parts.Length == 1)
                {
                    // Direct method call, might be in same class
                    return (parts[0].Replace("(", "").Replace(")", "").Trim(), null);
                }
            }
            catch
            {
                // Ignore parse errors
            }

            return null;
        }

        /// <summary>
        /// Optimized version using pre-built indices - O(1) instead of O(n)
        /// </summary>
        private SymbolInfo? FindMatchingComponentOptimized(
            (string typeName, string? methodName) targetInfo,
            Dictionary<string, List<SymbolInfo>> nameIndex,
            Dictionary<string, List<SymbolInfo>> projectIndex,
            string callerProject)
        {
            // Quick lookup by name using index
            if (nameIndex.TryGetValue(targetInfo.typeName, out var candidates))
            {
                // Prefer components from same project
                var sameProjectMatch = candidates.FirstOrDefault(c => c.Project == callerProject);
                if (sameProjectMatch != null) return sameProjectMatch;

                // Return first match from any project
                return candidates.FirstOrDefault();
            }

            // Try to find by matching end of FullName (e.g., "System.String" when searching "String")
            // This is still O(n) but only as fallback
            foreach (var kvp in nameIndex)
            {
                foreach (var symbol in kvp.Value)
                {
                    if (symbol.FullName.EndsWith("." + targetInfo.typeName, StringComparison.OrdinalIgnoreCase))
                    {
                        return symbol;
                    }
                }
            }

            return null;
        }
        
        /// <summary>
        /// Legacy method kept for backward compatibility - DEPRECATED, use optimized version
        /// </summary>
        private SymbolInfo? FindMatchingComponent(
            (string typeName, string? methodName) targetInfo,
            Dictionary<string, SymbolInfo> symbolLookup,
            string callerProject)
        {
            // Try exact match first
            var candidates = symbolLookup.Values
                .Where(s => s.Type == "Class" || s.Type == "Interface")
                .Where(s => s.Name.Equals(targetInfo.typeName, StringComparison.OrdinalIgnoreCase) ||
                           s.FullName.EndsWith("." + targetInfo.typeName, StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Prefer components from same project
            var sameProjectMatch = candidates.FirstOrDefault(c => c.Project == callerProject);
            if (sameProjectMatch != null) return sameProjectMatch;

            // Return first match
            return candidates.FirstOrDefault();
        }

        /// <summary>
        /// Optimized version using pre-built indices - O(1) instead of O(n)
        /// </summary>
        private SymbolInfo? FindComponentByTypeNameOptimized(
            string typeName,
            Dictionary<string, SymbolInfo> symbolLookup,
            Dictionary<string, List<SymbolInfo>> nameIndex,
            Dictionary<string, List<SymbolInfo>> projectIndex,
            string usageProject)
        {
            // Remove generic type parameters if present
            var cleanTypeName = typeName.Split('<')[0].Trim();

            // Try exact match by FullName first (fastest)
            if (symbolLookup.TryGetValue(cleanTypeName, out var exact))
                return exact;

            // Try lookup by Name using index (fast O(1))
            if (nameIndex.TryGetValue(cleanTypeName, out var candidates))
            {
                // Prefer types from same project
                var sameProjectMatch = candidates.FirstOrDefault(c => c.Project == usageProject);
                if (sameProjectMatch != null) return sameProjectMatch;

                return candidates.FirstOrDefault();
            }

            // Fallback: try matching end of FullName
            foreach (var kvp in nameIndex)
            {
                foreach (var symbol in kvp.Value)
                {
                    if (symbol.FullName.EndsWith("." + cleanTypeName, StringComparison.OrdinalIgnoreCase))
                    {
                        return symbol;
                    }
                }
            }

            return null;
        }
        
        /// <summary>
        /// Legacy method kept for backward compatibility - DEPRECATED, use optimized version
        /// </summary>
        private SymbolInfo? FindComponentByTypeName(
            string typeName,
            Dictionary<string, SymbolInfo> symbolLookup,
            string usageProject)
        {
            // Remove generic type parameters if present
            var cleanTypeName = typeName.Split('<')[0].Trim();

            // Try exact match
            if (symbolLookup.TryGetValue(cleanTypeName, out var exact))
                return exact;

            // Try fuzzy match
            var candidates = symbolLookup.Values
                .Where(s => s.Type == "Class" || s.Type == "Interface" || s.Type == "Struct" || s.Type == "Enum")
                .Where(s => s.Name.Equals(cleanTypeName, StringComparison.OrdinalIgnoreCase) ||
                           s.FullName.EndsWith("." + cleanTypeName, StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Prefer types from same project
            var sameProjectMatch = candidates.FirstOrDefault(c => c.Project == usageProject);
            if (sameProjectMatch != null) return sameProjectMatch;

            return candidates.FirstOrDefault();
        }

        /// <summary>
        /// Creates a GraphLocation with both absolute and relative paths
        /// </summary>
        private GraphLocation CreateLocation(string absoluteFilePath, string solutionDirectory, int line, int column)
        {
            var normalizedAbsolute = Path.GetFullPath(absoluteFilePath);
            var normalizedSolutionDir = Path.GetFullPath(solutionDirectory);
            
            // Calculate relative path from solution directory
            string relativePath;
            try
            {
                // Use Uri to calculate relative path (cross-platform)
                var solutionUri = new Uri(normalizedSolutionDir.EndsWith(Path.DirectorySeparatorChar.ToString()) 
                    ? normalizedSolutionDir 
                    : normalizedSolutionDir + Path.DirectorySeparatorChar);
                var fileUri = new Uri(normalizedAbsolute);
                
                relativePath = Uri.UnescapeDataString(
                    solutionUri.MakeRelativeUri(fileUri).ToString().Replace('/', Path.DirectorySeparatorChar));
            }
            catch
            {
                // Fallback: simple string replacement
                relativePath = normalizedAbsolute.Replace(normalizedSolutionDir, "").TrimStart(Path.DirectorySeparatorChar);
            }

            return new GraphLocation
            {
                AbsolutePath = normalizedAbsolute,
                RelativePath = relativePath,
                Line = line,
                Column = column
            };
        }

        /// <summary>
        /// Finds the repository root by looking for .git directory
        /// </summary>
        private string? FindRepositoryRoot(string startPath)
        {
            var directory = Path.GetDirectoryName(Path.GetFullPath(startPath));
            
            while (!string.IsNullOrEmpty(directory))
            {
                // Check if .git directory exists
                if (Directory.Exists(Path.Combine(directory, ".git")))
                {
                    return directory;
                }
                
                // Move up one directory
                var parent = Directory.GetParent(directory);
                if (parent == null)
                    break;
                    
                directory = parent.FullName;
            }
            
            // Return null if not found (will use solution directory as fallback)
            return null;
        }

        /// <summary>
        /// Creates inheritance relationship edges (Inherits)
        /// </summary>
        private List<GraphEdge> CreateInheritanceRelationships(
            List<InheritanceInfo> inheritanceRelations,
            List<SymbolInfo> symbols)
        {
            var edges = new List<GraphEdge>();
            var symbolLookup = symbols
                .Where(s => s.Type == "Class" || s.Type == "Interface")
                .GroupBy(s => s.FullName)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var relation in inheritanceRelations)
            {
                // Check if both types exist in our symbol index
                if (!symbolLookup.ContainsKey(relation.DerivedType))
                    continue;
                    
                // Base type might be external (e.g., System types), skip if not in our code
                if (!symbolLookup.ContainsKey(relation.BaseType))
                    continue;

                var sourceId = $"component:{relation.DerivedType}";
                var targetId = $"component:{relation.BaseType}";

                edges.Add(new GraphEdge
                {
                    Id = $"inherits-{Guid.NewGuid().ToString().Substring(0, 8)}-{sourceId}-{targetId}",
                    Source = sourceId,
                    Target = targetId,
                    Relationship = "Inherits",
                    Strength = 0.9,
                    Count = 1,
                    Attributes = new GraphEdgeAttributes
                    {
                        Style = "solid",
                        Color = "#9333EA",
                        Weight = 1.2
                    }
                });
            }

            return edges;
        }

        /// <summary>
        /// Creates interface implementation relationship edges (Implements)
        /// </summary>
        private List<GraphEdge> CreateImplementationRelationships(
            List<ImplementationInfo> implementations,
            List<SymbolInfo> symbols)
        {
            var edges = new List<GraphEdge>();
            var symbolLookup = symbols
                .Where(s => s.Type == "Class" || s.Type == "Interface")
                .GroupBy(s => s.FullName)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var impl in implementations)
            {
                // Check if implementing type exists in our symbol index
                if (!symbolLookup.ContainsKey(impl.ImplementingType))
                    continue;

                // ✅ FIX: Allow interface implementations even if interface is from another project
                // This enables cross-project interface implementation detection
                // Example: ApprovalSchemeExecution (BusinessComponents) implements IApprovalSchemeExecution (Interfaces)
                // Previously, this was filtered out with:
                // if (!symbolLookup.ContainsKey(impl.InterfaceType))
                //     continue;

                var sourceId = $"component:{impl.ImplementingType}";
                var targetId = $"component:{impl.InterfaceType}";

                edges.Add(new GraphEdge
                {
                    Id = $"implements-{Guid.NewGuid().ToString().Substring(0, 8)}-{sourceId}-{targetId}",
                    Source = sourceId,
                    Target = targetId,
                    Relationship = "Implements",
                    Strength = 0.95,
                    Count = 1,
                    Attributes = new GraphEdgeAttributes
                    {
                        Style = "dashed",
                        Color = "#10B981",
                        Weight = 1.1
                    }
                });
            }

            return edges;
        }
    }
}
