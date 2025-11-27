using Newtonsoft.Json;
using System.Text;
using System.Text.Json;
using System.Xml;
using System.Xml.Serialization;
using SymbolInfo = RoslynIndexer.Models.SymbolInfo;
using IndexResult = RoslynIndexer.Models.IndexResult;
using GraphResult = RoslynIndexer.Models.GraphResult;

namespace RoslynIndexer.Services
{
    public class OutputService
    {
        private readonly JsonLdConverter _jsonLdConverter = new();

        public async Task SaveIndexResult(IndexResult result, string outputPath, string format)
        {
            var content = format.ToLower() switch
            {
                "json" => JsonConvert.SerializeObject(result, Newtonsoft.Json.Formatting.Indented),
                "xml" => SerializeToXml(result),
                _ => throw new NotSupportedException($"Output format not supported: {format}")
            };

            await File.WriteAllTextAsync(outputPath, content, Encoding.UTF8);
        }

        public async Task SaveGraphResult(GraphResult result, string outputPath, string format)
        {
            switch (format.ToLower())
            {
                case "json":
                case "jsonld":
                case "ndjson":
                    // Default: NDJSON-LD format (scalable, one document per line)
                    await SaveNdjsonLd(result, outputPath);
                    break;

                case "json-legacy":
                    // Legacy format (old custom format with all data in one file)
                    var content = JsonConvert.SerializeObject(result, Newtonsoft.Json.Formatting.Indented);
                    await File.WriteAllTextAsync(outputPath, content, Encoding.UTF8);
                    Console.WriteLine($"Graph saved in JSON-LEGACY format to: {outputPath}");
                    break;

                case "xml":
                    var xmlContent = SerializeToXml(result);
                    await File.WriteAllTextAsync(outputPath, xmlContent, Encoding.UTF8);
                    Console.WriteLine($"Graph saved in XML format to: {outputPath}");
                    break;

                default:
                    throw new NotSupportedException($"Output format not supported: {format}. Supported: json, ndjson, json-legacy, xml");
            }
        }

        /// <summary>
        /// Saves graph as NDJSON-LD format (one JSON document per line)
        /// Streaming output for memory efficiency with large graphs
        /// </summary>
        private async Task SaveNdjsonLd(GraphResult result, string outputPath)
        {
            // Change extension to .ndjson if it's .json
            var ndjsonPath = outputPath;
            if (outputPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                ndjsonPath = outputPath.Substring(0, outputPath.Length - 5) + ".ndjson";
            }

            // Stream write for memory efficiency
            using var writer = new StreamWriter(ndjsonPath, false, Encoding.UTF8);

            var lineCount = 0;
            foreach (var line in _jsonLdConverter.ConvertToNdjsonLd(result))
            {
                await writer.WriteLineAsync(line);
                lineCount++;
            }

            Console.WriteLine($"Graph saved in NDJSON-LD format ({lineCount} documents) to: {ndjsonPath}");

            // Also save context.jsonld for reference
            var contextPath = Path.Combine(Path.GetDirectoryName(ndjsonPath) ?? "", "context.jsonld");
            await File.WriteAllTextAsync(contextPath, _jsonLdConverter.GenerateContextFile(), Encoding.UTF8);
            Console.WriteLine($"Context file saved to: {contextPath}");
        }

        public async Task SaveStatistics(Dictionary<string, int> statistics, string csvPath)
        {
            var csv = new StringBuilder();
            csv.AppendLine("Metric,Count");
            
            foreach (var stat in statistics.OrderBy(s => s.Key))
            {
                csv.AppendLine($"{stat.Key},{stat.Value}");
            }

            await File.WriteAllTextAsync(csvPath, csv.ToString(), Encoding.UTF8);
        }

        public async Task SaveSymbolsCsv(List<SymbolInfo> symbols, string csvPath)
        {
            var csv = new StringBuilder();
            csv.AppendLine("Name,FullName,Type,Project,File,Line,Column,Accessibility,Signature");
            
            foreach (var symbol in symbols)
            {
                csv.AppendLine($"\"{EscapeCsv(symbol.Name)}\",\"{EscapeCsv(symbol.FullName)}\",\"{symbol.Type}\",\"{EscapeCsv(symbol.Project)}\",\"{EscapeCsv(symbol.File)}\",{symbol.Line},{symbol.Column},\"{symbol.Accessibility}\",\"{EscapeCsv(symbol.Signature)}\"");
            }

            await File.WriteAllTextAsync(csvPath, csv.ToString(), Encoding.UTF8);
        }

        public async Task SaveGraphStatisticsCsv(GraphResult graph, string csvPath)
        {
            var csv = new StringBuilder();
            csv.AppendLine("Metric,Value");
            
            csv.AppendLine($"Total Nodes,{graph.Statistics.TotalNodes}");
            csv.AppendLine($"Total Edges,{graph.Statistics.TotalEdges}");
            csv.AppendLine($"Total Clusters,{graph.Statistics.TotalClusters}");
            csv.AppendLine($"Layer Count,{graph.Statistics.LayerCount}");
            csv.AppendLine($"Project Count,{graph.Statistics.ProjectCount}");
            csv.AppendLine($"Component Count,{graph.Statistics.ComponentCount}");

            // Node statistics by type
            var nodesByType = graph.Nodes.GroupBy(n => n.Type).ToDictionary(g => g.Key, g => g.Count());
            foreach (var nodeType in nodesByType.OrderBy(nt => nt.Key))
            {
                csv.AppendLine($"{nodeType.Key} Nodes,{nodeType.Value}");
            }

            // Edge statistics by relationship
            var edgesByRelationship = graph.Edges.GroupBy(e => e.Relationship).ToDictionary(g => g.Key, g => g.Count());
            foreach (var edgeType in edgesByRelationship.OrderBy(et => et.Key))
            {
                csv.AppendLine($"{edgeType.Key} Edges,{edgeType.Value}");
            }

            await File.WriteAllTextAsync(csvPath, csv.ToString(), Encoding.UTF8);
        }

        private string SerializeToXml<T>(T obj)
        {
            var serializer = new XmlSerializer(typeof(T));
            using var stringWriter = new StringWriter();
            using var xmlWriter = XmlWriter.Create(stringWriter, new XmlWriterSettings 
            { 
                Indent = true, 
                Encoding = Encoding.UTF8 
            });
            
            serializer.Serialize(xmlWriter, obj);
            return stringWriter.ToString();
        }

        private string EscapeCsv(string value)
        {
            if (string.IsNullOrEmpty(value))
                return value;

            // Escape quotes by doubling them
            return value.Replace("\"", "\"\"");
        }

        public async Task<Dictionary<string, object>> GenerateReport(IndexResult indexResult, GraphResult? graphResult = null)
        {
            var report = new Dictionary<string, object>
            {
                ["metadata"] = new
                {
                    generated_at = DateTime.UtcNow,
                    solution_path = indexResult.SolutionPath,
                    total_symbols = indexResult.Symbols.Count
                },
                ["statistics"] = indexResult.Statistics,
                ["symbol_summary"] = GenerateSymbolSummary(indexResult.Symbols)
            };

            if (graphResult != null)
            {
                report["graph_statistics"] = new
                {
                    total_nodes = graphResult.Statistics.TotalNodes,
                    total_edges = graphResult.Statistics.TotalEdges,
                    layers = graphResult.Statistics.LayerCount,
                    projects = graphResult.Statistics.ProjectCount,
                    components = graphResult.Statistics.ComponentCount
                };

                report["architectural_layers"] = AnalyzeArchitecturalLayers(graphResult);
            }

            return report;
        }

        private object GenerateSymbolSummary(List<SymbolInfo> symbols)
        {
            var projectSymbols = symbols.GroupBy(s => s.Project)
                .ToDictionary(g => g.Key, g => new
                {
                    total = g.Count(),
                    classes = g.Count(s => s.Type == "Class"),
                    interfaces = g.Count(s => s.Type == "Interface"),
                    methods = g.Count(s => s.Type == "Method"),
                    properties = g.Count(s => s.Type == "Property")
                });

            var accessibilityBreakdown = symbols.GroupBy(s => s.Accessibility)
                .ToDictionary(g => g.Key, g => g.Count());

            return new
            {
                by_project = projectSymbols,
                by_accessibility = accessibilityBreakdown,
                top_namespaces = symbols
                    .Where(s => !string.IsNullOrEmpty(s.FullName))
                    .Select(s => s.FullName.Contains('.') ? s.FullName.Substring(0, s.FullName.LastIndexOf('.')) : "Global")
                    .GroupBy(ns => ns)
                    .OrderByDescending(g => g.Count())
                    .Take(10)
                    .ToDictionary(g => g.Key, g => g.Count())
            };
        }

        private object AnalyzeArchitecturalLayers(GraphResult graphResult)
        {
            var layers = graphResult.Nodes
                .Where(n => n.Type == "Layer")
                .Select(n => new
                {
                    name = n.Name,
                    importance = n.Attributes.Importance,
                    projects = graphResult.Edges
                        .Where(e => e.Source == n.Id && e.Relationship == "contains")
                        .Count()
                })
                .OrderByDescending(l => l.importance)
                .ToList();

            var projectDependencies = graphResult.Edges
                .Where(e => e.Relationship == "project_reference")
                .GroupBy(e => e.Source)
                .ToDictionary(g => g.Key, g => g.Select(e => e.Target).ToList());

            return new
            {
                layers = layers,
                project_dependencies = projectDependencies
            };
        }
    }
}
