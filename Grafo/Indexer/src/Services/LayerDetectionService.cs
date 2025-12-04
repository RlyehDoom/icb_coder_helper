using System.Text.RegularExpressions;

namespace RoslynIndexer.Services
{
    /// <summary>
    /// Service for detecting architectural layers of projects.
    /// Supports multiple detection modes: directory-based, naming-based, or auto.
    /// </summary>
    public class LayerDetectionService
    {
        /// <summary>
        /// Detection mode for layer classification
        /// </summary>
        public enum DetectionMode
        {
            /// <summary>
            /// Automatically try directory-based first, fallback to naming-based
            /// </summary>
            Auto,

            /// <summary>
            /// Detect layers from directory structure (e.g., 1_PresentationLayer, 2_ServicesLayer)
            /// </summary>
            Directory,

            /// <summary>
            /// Detect layers from project naming conventions
            /// </summary>
            Naming
        }

        /// <summary>
        /// Result of layer detection for a project
        /// </summary>
        public class LayerDetectionResult
        {
            public string ProjectName { get; set; } = "";
            public string ProjectPath { get; set; } = "";
            public string DetectedLayer { get; set; } = "";
            public string DetectionSource { get; set; } = ""; // "directory", "naming", "default"
            public string DirectoryHint { get; set; } = ""; // The directory that triggered the detection
            public double Confidence { get; set; } = 0.0; // 0.0 to 1.0
        }

        /// <summary>
        /// Summary of layer detection for all projects
        /// </summary>
        public class LayerDetectionSummary
        {
            public DetectionMode Mode { get; set; }
            public int TotalProjects { get; set; }
            public int DirectoryDetected { get; set; }
            public int NamingDetected { get; set; }
            public int DefaultFallback { get; set; }
            public Dictionary<string, List<LayerDetectionResult>> ProjectsByLayer { get; set; } = new();
            public List<LayerDetectionResult> AllResults { get; set; } = new();
            public List<string> Warnings { get; set; } = new();

            /// <summary>
            /// Indicates if a valid layer structure was detected in the directory hierarchy
            /// </summary>
            public bool HasValidLayerStructure { get; set; }

            /// <summary>
            /// The layer directories detected in the project structure
            /// </summary>
            public List<string> DetectedLayerDirectories { get; set; } = new();

            /// <summary>
            /// Average confidence score across all detections (0.0 to 1.0)
            /// </summary>
            public double AverageConfidence { get; set; }

            /// <summary>
            /// Number of distinct layers detected
            /// </summary>
            public int DistinctLayersCount => ProjectsByLayer.Count;

            /// <summary>
            /// Quality assessment of the detection
            /// </summary>
            public string QualityAssessment
            {
                get
                {
                    if (HasValidLayerStructure && DirectoryDetected > NamingDetected)
                        return "Excellent - Directory structure detected";
                    if (AverageConfidence >= 0.8)
                        return "Good - High confidence detections";
                    if (AverageConfidence >= 0.6)
                        return "Fair - Mixed confidence detections";
                    if (DefaultFallback > TotalProjects / 2)
                        return "Poor - Many projects defaulted to fallback";
                    return "Acceptable";
                }
            }
        }

        /// <summary>
        /// Comprehensive layer keyword dictionary supporting multiple languages and naming conventions.
        /// Each layer has primary keywords (high confidence) and secondary keywords (medium confidence).
        /// </summary>
        public static class LayerDictionary
        {
            // Presentation Layer - UI, Views, Controllers, Web
            public static readonly HashSet<string> PresentationPrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "presentationlayer", "presentation", "ui", "userinterface", "userinterfaceprocess",
                "frontend", "web", "webui", "webapi", "api", "client", "views", "controllers",
                "mvc", "razor", "blazor", "angular", "react", "vue", "uiprocess", "webapp",
                // Spanish
                "presentacion", "capapresentacion", "interfazusuario", "vistas", "controladores",
                // Numbered patterns
                "1_presentation", "01_presentation", "1presentation", "1-presentation"
            };

            public static readonly HashSet<string> PresentationSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "pages", "components", "forms", "screens", "endpoints", "handlers",
                "paginas", "formularios", "pantallas"
            };

            // Services Layer - Application Services, Service Hosts, WCF/gRPC
            public static readonly HashSet<string> ServicesPrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "serviceslayer", "services", "servicehost", "servicecomponents", "applicationserver",
                "applicationservices", "appservices", "wcf", "grpc", "serviceagents",
                "contracts", "servicecontracts", "faultcontracts",
                // Spanish
                "servicios", "capaservicios", "servidoraplicaciones",
                // Numbered patterns
                "2_services", "02_services", "2services", "2-services"
            };

            public static readonly HashSet<string> ServicesSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "facade", "facades", "orchestration", "orquestacion", "mediators"
            };

            // Business Layer - Domain, Business Logic, Core
            public static readonly HashSet<string> BusinessPrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "businesslayer", "business", "businesscomponents", "businessentities",
                "domain", "domainmodel", "domainservices", "core", "corelogic",
                "businesslogic", "logic", "engine", "rules", "businessrules",
                // Spanish
                "negocio", "capanegocio", "dominio", "logica", "logicanegocio",
                "reglasnegocio", "entidadesnegocio", "componentesnegocio",
                // Numbered patterns
                "3_business", "03_business", "3business", "3-business"
            };

            public static readonly HashSet<string> BusinessSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "models", "entities", "aggregates", "valueobjects", "specifications",
                "modelos", "entidades", "agregados"
            };

            // Data Layer - Persistence, Repositories, DAL
            public static readonly HashSet<string> DataPrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "datalayer", "data", "dataaccess", "dal", "persistence", "repository",
                "repositories", "database", "db", "orm", "entityframework", "efcore",
                "dapper", "ado", "sql", "nosql", "mongodb", "redis",
                // Spanish
                "datos", "capadatos", "accesodatos", "persistencia", "repositorios",
                // Numbered patterns
                "4_data", "04_data", "4data", "4-data"
            };

            public static readonly HashSet<string> DataSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "context", "contexts", "migrations", "seeding", "queries",
                "contexto", "migraciones"
            };

            // Cross-Cutting Layer - Shared components across all layers
            public static readonly HashSet<string> CrossCuttingPrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "cross-cutting", "crosscutting", "crosscut", "shared", "common",
                "contracts", "interfaces", "abstractions", "methodparameters",
                "attributes", "smartattributes", "faultcontracts",
                // Spanish
                "transversal", "compartido", "comun", "contratos", "interfaces",
                // Numbered patterns (typically before or after main layers)
                "0_crosscutting", "00_shared", "crosscutting", "shared"
            };

            public static readonly HashSet<string> CrossCuttingSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "constants", "enums", "exceptions", "extensions",
                "constantes", "enumeraciones", "excepciones"
            };

            // Infrastructure Layer - Background services, External integrations
            public static readonly HashSet<string> InfrastructurePrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "infrastructure", "infra", "utilities", "utils", "tools",
                "daemons", "daemon", "background", "backgroundservices", "workers", "jobs",
                "external", "messaging", "caching", "logging",
                // Spanish
                "infraestructura", "herramientas", "utilidades",
                "demonios", "trabajos",
                // Numbered patterns
                "5_infrastructure", "05_infrastructure", "5infrastructure", "5-infrastructure"
            };
            // NOTE: "adapter", "framework", "integration" removed - their layer depends on directory context

            public static readonly HashSet<string> InfrastructureSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "helpers", "middleware", "filters", "interceptors",
                "ayudantes"
            };

            // Test Layer - Unit Tests, Integration Tests, Specs
            public static readonly HashSet<string> TestPrimary = new(StringComparer.OrdinalIgnoreCase)
            {
                // English
                "tests", "test", "unittests", "unittest", "integrationtests", "integrationtest",
                "specs", "specifications", "e2e", "endtoend", "acceptance", "functional",
                "xunit", "nunit", "mstest", "moq", "testing",
                // Spanish
                "pruebas", "pruebasunitarias", "pruebasintegracion", "especificaciones",
                // Numbered patterns
                "6_test", "06_test", "6test", "6-test"
            };

            public static readonly HashSet<string> TestSecondary = new(StringComparer.OrdinalIgnoreCase)
            {
                "fixtures", "mocks", "stubs", "fakes", "builders",
                "mockups", "simulaciones"
            };

            /// <summary>
            /// Gets all primary keywords mapped to their layer
            /// </summary>
            public static Dictionary<string, string> GetAllPrimaryMappings()
            {
                var mappings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                foreach (var keyword in PresentationPrimary) mappings[keyword] = "presentation";
                foreach (var keyword in ServicesPrimary) mappings[keyword] = "services";
                foreach (var keyword in BusinessPrimary) mappings[keyword] = "business";
                foreach (var keyword in DataPrimary) mappings[keyword] = "data";
                foreach (var keyword in CrossCuttingPrimary) mappings[keyword] = "shared";
                foreach (var keyword in InfrastructurePrimary) mappings[keyword] = "infrastructure";
                foreach (var keyword in TestPrimary) mappings[keyword] = "test";

                return mappings;
            }

            /// <summary>
            /// Gets all secondary keywords mapped to their layer
            /// </summary>
            public static Dictionary<string, string> GetAllSecondaryMappings()
            {
                var mappings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                foreach (var keyword in PresentationSecondary) mappings[keyword] = "presentation";
                foreach (var keyword in ServicesSecondary) mappings[keyword] = "services";
                foreach (var keyword in BusinessSecondary) mappings[keyword] = "business";
                foreach (var keyword in DataSecondary) mappings[keyword] = "data";
                foreach (var keyword in CrossCuttingSecondary) mappings[keyword] = "shared";
                foreach (var keyword in InfrastructureSecondary) mappings[keyword] = "infrastructure";
                foreach (var keyword in TestSecondary) mappings[keyword] = "test";

                return mappings;
            }

            /// <summary>
            /// Attempts to match a directory name to a layer
            /// </summary>
            public static (string? layer, double confidence) MatchDirectory(string directoryName)
            {
                var normalized = NormalizeName(directoryName);

                // Check primary keywords (high confidence)
                var primaryMappings = GetAllPrimaryMappings();
                if (primaryMappings.TryGetValue(normalized, out var primaryLayer))
                    return (primaryLayer, 0.95);

                // Check if the normalized name contains any primary keyword
                foreach (var (keyword, layer) in primaryMappings)
                {
                    if (normalized.Contains(keyword) || keyword.Contains(normalized))
                        return (layer, 0.85);
                }

                // Check secondary keywords (medium confidence)
                var secondaryMappings = GetAllSecondaryMappings();
                if (secondaryMappings.TryGetValue(normalized, out var secondaryLayer))
                    return (secondaryLayer, 0.70);

                // No match
                return (null, 0.0);
            }

            /// <summary>
            /// Normalize a name by removing numbers, separators, and converting to lowercase
            /// </summary>
            private static string NormalizeName(string name)
            {
                // Remove leading numbers and separators: "1_PresentationLayer" -> "presentationlayer"
                var normalized = NumberedLayerRegex.Replace(name, "$1");
                // Remove remaining separators and convert to lowercase
                return normalized.Replace("_", "").Replace("-", "").Replace(" ", "").Replace(".", "").ToLower();
            }
        }

        // Directory patterns - kept for backward compatibility, now uses LayerDictionary internally
        private static readonly Dictionary<string, string> DirectoryLayerPatterns = LayerDictionary.GetAllPrimaryMappings();

        // Regex to extract layer name from numbered directories like "1_PresentationLayer" or "2-ServicesLayer"
        private static readonly Regex NumberedLayerRegex = new(@"^\d+[_\-\s]?(.+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private readonly DetectionMode _mode;
        private readonly bool _verbose;

        public LayerDetectionService(DetectionMode mode = DetectionMode.Auto, bool verbose = false)
        {
            _mode = mode;
            _verbose = verbose;
        }

        /// <summary>
        /// Detects layers for all projects and returns a summary for user validation
        /// </summary>
        public LayerDetectionSummary DetectAllLayers(
            Dictionary<string, string> projectPaths, // projectName -> csprojPath
            string solutionPath)
        {
            var summary = new LayerDetectionSummary
            {
                Mode = _mode,
                TotalProjects = projectPaths.Count
            };

            var solutionDir = Path.GetDirectoryName(Path.GetFullPath(solutionPath)) ?? "";
            var detectedDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            double totalConfidence = 0;

            foreach (var (projectName, projectPath) in projectPaths)
            {
                var result = DetectProjectLayer(projectName, projectPath, solutionDir);
                summary.AllResults.Add(result);
                totalConfidence += result.Confidence;

                // Track detected layer directories
                if (!string.IsNullOrEmpty(result.DirectoryHint))
                    detectedDirectories.Add(result.DirectoryHint);

                // Track detection source counts
                switch (result.DetectionSource)
                {
                    case "directory":
                        summary.DirectoryDetected++;
                        break;
                    case "naming":
                        summary.NamingDetected++;
                        break;
                    case "default":
                        summary.DefaultFallback++;
                        summary.Warnings.Add($"Project '{projectName}' defaulted to '{result.DetectedLayer}' layer (no pattern matched)");
                        break;
                }

                // Group by layer
                if (!summary.ProjectsByLayer.ContainsKey(result.DetectedLayer))
                    summary.ProjectsByLayer[result.DetectedLayer] = new List<LayerDetectionResult>();
                summary.ProjectsByLayer[result.DetectedLayer].Add(result);
            }

            // Calculate summary metrics
            summary.AverageConfidence = projectPaths.Count > 0 ? totalConfidence / projectPaths.Count : 0;
            summary.DetectedLayerDirectories = detectedDirectories.OrderBy(d => d).ToList();

            // Determine if we found a valid layer structure
            // A valid structure has at least 2 distinct layer directories detected
            summary.HasValidLayerStructure =
                summary.DirectoryDetected >= summary.TotalProjects / 2 && // At least half detected by directory
                detectedDirectories.Count >= 2; // At least 2 distinct layer directories

            // Add warnings for potential misclassifications
            ValidateClassifications(summary);

            // Add summary-level warnings
            if (summary.DefaultFallback > summary.TotalProjects / 3)
            {
                summary.Warnings.Insert(0,
                    $"High fallback rate: {summary.DefaultFallback}/{summary.TotalProjects} projects used default classification. " +
                    "Consider organizing projects into layer directories.");
            }

            if (!summary.HasValidLayerStructure && _mode == DetectionMode.Directory)
            {
                summary.Warnings.Insert(0,
                    "No layer directory structure detected. Falling back to naming-based detection. " +
                    "Consider using --layer-mode=naming or organizing projects into layer directories " +
                    "(e.g., 1_PresentationLayer, 2_ServicesLayer, 3_BusinessLayer, 4_DataLayer).");
            }

            return summary;
        }

        /// <summary>
        /// Detects the layer for a single project
        /// </summary>
        public LayerDetectionResult DetectProjectLayer(string projectName, string projectPath, string solutionDir)
        {
            var result = new LayerDetectionResult
            {
                ProjectName = projectName,
                ProjectPath = projectPath
            };

            // Try directory-based detection first (if mode is Auto or Directory)
            if (_mode == DetectionMode.Auto || _mode == DetectionMode.Directory)
            {
                var directoryResult = DetectFromDirectory(projectPath, solutionDir);
                if (directoryResult.HasValue)
                {
                    result.DetectedLayer = directoryResult.Value.layer;
                    result.DetectionSource = "directory";
                    result.DirectoryHint = directoryResult.Value.directoryHint;
                    result.Confidence = 0.95; // High confidence for directory-based
                    return result;
                }
            }

            // Fallback to naming-based detection (if mode is Auto or Naming)
            if (_mode == DetectionMode.Auto || _mode == DetectionMode.Naming)
            {
                var namingResult = DetectFromNaming(projectName);
                result.DetectedLayer = namingResult.layer;
                result.DetectionSource = namingResult.isDefault ? "default" : "naming";
                result.Confidence = namingResult.isDefault ? 0.3 : 0.7;
                return result;
            }

            // Ultimate fallback
            result.DetectedLayer = "business";
            result.DetectionSource = "default";
            result.Confidence = 0.3;
            return result;
        }

        /// <summary>
        /// Detect layer from directory structure.
        /// Looks for patterns like "1_PresentationLayer", "BusinessLayer", "Cross-Cutting", etc.
        /// Searches recursively through the path hierarchy from root to project.
        /// </summary>
        private (string layer, string directoryHint)? DetectFromDirectory(string projectPath, string solutionDir)
        {
            try
            {
                var fullPath = Path.GetFullPath(projectPath);
                var relativePath = GetRelativePath(fullPath, solutionDir);

                // Split path into directory components
                var pathParts = relativePath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);

                // Search from root to project, looking for layer indicators
                // We process from root because layer folders are typically at the top level
                double bestConfidence = 0;
                string? bestLayer = null;
                string? bestHint = null;

                foreach (var part in pathParts)
                {
                    // Skip common non-layer directories
                    if (IsCommonNonLayerDirectory(part))
                        continue;

                    // Use the LayerDictionary for matching
                    var (matchedLayer, confidence) = LayerDictionary.MatchDirectory(part);

                    if (matchedLayer != null && confidence > bestConfidence)
                    {
                        bestLayer = matchedLayer;
                        bestConfidence = confidence;
                        bestHint = part;

                        if (_verbose)
                            Console.WriteLine($"  Directory match: '{part}' -> {matchedLayer} (confidence: {confidence:P0})");

                        // If we found a high-confidence match, we can stop
                        if (confidence >= 0.90)
                            break;
                    }

                    // Also check numbered patterns explicitly (e.g., "1_PresentationLayer")
                    var numberedMatch = NumberedLayerRegex.Match(part);
                    if (numberedMatch.Success)
                    {
                        var innerPart = numberedMatch.Groups[1].Value;
                        var (numberedLayer, numberedConfidence) = LayerDictionary.MatchDirectory(innerPart);

                        // Boost confidence for numbered patterns (they're very explicit)
                        numberedConfidence = Math.Min(0.98, numberedConfidence + 0.05);

                        if (numberedLayer != null && numberedConfidence > bestConfidence)
                        {
                            bestLayer = numberedLayer;
                            bestConfidence = numberedConfidence;
                            bestHint = part;

                            if (_verbose)
                                Console.WriteLine($"  Numbered directory match: '{part}' -> {numberedLayer} (confidence: {numberedConfidence:P0})");
                        }
                    }
                }

                if (bestLayer != null)
                    return (bestLayer, bestHint!);
            }
            catch (Exception ex)
            {
                if (_verbose)
                    Console.WriteLine($"  Warning: Could not analyze path '{projectPath}': {ex.Message}");
            }

            return null;
        }

        /// <summary>
        /// Check if a directory name is a common non-layer directory that should be skipped
        /// </summary>
        private bool IsCommonNonLayerDirectory(string dirName)
        {
            var lowerName = dirName.ToLower();
            var skipPatterns = new[]
            {
                "src", "source", "sources", "lib", "libs", "packages",
                "bin", "obj", "debug", "release", "x64", "x86",
                ".git", ".vs", ".idea", "node_modules",
                "properties", "resources", "assets", "content",
                // Project-specific folders that aren't layers
                "infocorp", "tailored", "icbanking"
            };

            return skipPatterns.Contains(lowerName) ||
                   lowerName.StartsWith(".") ||
                   lowerName.StartsWith("_");
        }

        /// <summary>
        /// Detect layer from project naming conventions (improved version)
        /// </summary>
        private (string layer, bool isDefault) DetectFromNaming(string projectName)
        {
            var lowerName = projectName.ToLower();

            // Priority 1: Specific compound keywords (most reliable)
            // These should always win regardless of other keywords in the name
            if (lowerName.Contains("dataaccess") || lowerName.EndsWith(".dal"))
                return ("data", false);

            if (lowerName.Contains("businesscomponents") || lowerName.Contains("businessentities"))
                return ("business", false);

            if (lowerName.Contains("uiprocess") || lowerName.Contains("userinterface"))
                return ("presentation", false);

            if (lowerName.Contains("serviceagents") || lowerName.Contains("servicehost"))
                return ("services", false);

            // Priority 2: Suffix patterns (second most reliable)
            // Check what the project name ends with
            if (lowerName.EndsWith(".data") || lowerName.EndsWith(".repository") ||
                lowerName.EndsWith(".persistence") || lowerName.EndsWith(".entities"))
            {
                // But check if it's "BusinessEntities" - that's business layer
                if (!lowerName.Contains("business"))
                    return ("data", false);
            }

            // Priority 3: General keywords with careful ordering
            // Test layer (check early to avoid false positives with "test" in other patterns)
            if (lowerName.Contains("test") || lowerName.Contains("spec") ||
                lowerName.Contains("unittest") || lowerName.Contains("integrationtest"))
                return ("test", false);

            // Presentation Layer - UI-related keywords
            if (lowerName.Contains("web") || lowerName.Contains("mvc") ||
                lowerName.Contains("frontend") || lowerName.Contains("client") ||
                lowerName.Contains("webapi") || lowerName.Contains(".api"))
                return ("presentation", false);

            // Check for "ui" more carefully to avoid false positives
            if (ContainsWord(lowerName, "ui"))
                return ("presentation", false);

            // Data Layer
            if (lowerName.Contains("data") || lowerName.Contains("repository") ||
                lowerName.Contains("persistence") || lowerName.Contains("database") ||
                lowerName.Contains("entity") || lowerName.Contains("dal"))
                return ("data", false);

            // Services Layer - but be careful with "app" (causes false positives with "approval", etc.)
            if (lowerName.Contains("service") || lowerName.Contains("application.") ||
                lowerName.Contains("applicationserver"))
                return ("services", false);

            // Business Layer
            if (lowerName.Contains("business") || lowerName.Contains("domain") ||
                lowerName.Contains("core") || lowerName.Contains("logic") ||
                lowerName.Contains("engine"))
                return ("business", false);

            // Infrastructure Layer
            if (lowerName.Contains("infrastructure") || lowerName.Contains("common") ||
                lowerName.Contains("shared") || lowerName.Contains("framework") ||
                lowerName.Contains("utility") || lowerName.Contains("tools") ||
                lowerName.Contains("daemon") || lowerName.Contains("adapter"))
                return ("infrastructure", false);

            // Default to business layer with low confidence
            return ("business", true);
        }

        /// <summary>
        /// Check if a word exists as a standalone component (not part of another word)
        /// </summary>
        private bool ContainsWord(string text, string word)
        {
            // Check for word as a component: ".ui.", ".ui", "ui."
            return text.Contains($".{word}.") ||
                   text.Contains($".{word}") ||
                   text.StartsWith($"{word}.") ||
                   text == word;
        }

        /// <summary>
        /// Normalize directory name for matching (remove numbers, underscores, dashes)
        /// </summary>
        private string NormalizeDirectoryName(string name)
        {
            // Remove leading numbers and separators: "1_PresentationLayer" -> "presentationlayer"
            var normalized = NumberedLayerRegex.Replace(name, "$1");
            // Remove remaining separators and convert to lowercase
            return normalized.Replace("_", "").Replace("-", "").Replace(" ", "").ToLower();
        }

        /// <summary>
        /// Get relative path from solution directory
        /// </summary>
        private string GetRelativePath(string fullPath, string basePath)
        {
            try
            {
                var baseUri = new Uri(basePath.EndsWith(Path.DirectorySeparatorChar.ToString())
                    ? basePath
                    : basePath + Path.DirectorySeparatorChar);
                var fullUri = new Uri(fullPath);
                return Uri.UnescapeDataString(baseUri.MakeRelativeUri(fullUri).ToString());
            }
            catch
            {
                return fullPath;
            }
        }

        /// <summary>
        /// Validate classifications and add warnings for potential issues
        /// </summary>
        private void ValidateClassifications(LayerDetectionSummary summary)
        {
            foreach (var result in summary.AllResults)
            {
                var lowerName = result.ProjectName.ToLower();
                var layer = result.DetectedLayer;

                // Check for potential misclassifications
                if (layer == "services" && (lowerName.Contains("businessentities") || lowerName.Contains("businesscomponents")))
                {
                    summary.Warnings.Add($"Warning: '{result.ProjectName}' classified as 'services' but contains 'business' in name");
                }

                if (layer == "services" && lowerName.Contains("dataaccess"))
                {
                    summary.Warnings.Add($"Warning: '{result.ProjectName}' classified as 'services' but contains 'dataaccess' in name");
                }

                if (layer == "business" && lowerName.Contains("daemon"))
                {
                    summary.Warnings.Add($"Warning: '{result.ProjectName}' classified as 'business' but appears to be a daemon/background service");
                }
            }
        }

        /// <summary>
        /// Print a formatted summary to the console for user validation
        /// </summary>
        public static void PrintSummary(LayerDetectionSummary summary)
        {
            const int boxWidth = 70; // Inner width between ║ characters

            string Line(string content) => $"║  {content.PadRight(boxWidth - 2)}║";
            string Header(string title) => $"║{title.PadLeft((boxWidth + title.Length) / 2).PadRight(boxWidth)}║";

            Console.WriteLine();
            Console.WriteLine($"╔{new string('═', boxWidth)}╗");
            Console.WriteLine(Header("LAYER DETECTION SUMMARY"));
            Console.WriteLine($"╠{new string('═', boxWidth)}╣");
            Console.WriteLine(Line($"Mode: {summary.Mode}"));
            Console.WriteLine(Line($"Quality: {summary.QualityAssessment}"));
            Console.WriteLine(Line($"Avg Confidence: {summary.AverageConfidence:P0}"));
            Console.WriteLine($"╠{new string('═', boxWidth)}╣");
            Console.WriteLine(Line($"Total Projects: {summary.TotalProjects}"));
            Console.WriteLine(Line($"Detected by Directory: {summary.DirectoryDetected}"));
            Console.WriteLine(Line($"Detected by Naming: {summary.NamingDetected}"));
            Console.WriteLine(Line($"Default Fallback: {summary.DefaultFallback}"));
            Console.WriteLine($"╠{new string('═', boxWidth)}╣");

            // Show layers summary
            Console.WriteLine(Line("LAYERS DETECTED:"));
            var layerOrder = new[] { "presentation", "services", "business", "data", "shared", "infrastructure", "test" };

            foreach (var layerName in layerOrder)
            {
                if (!summary.ProjectsByLayer.ContainsKey(layerName))
                    continue;

                var projects = summary.ProjectsByLayer[layerName];
                var dirCount = projects.Count(p => p.DetectionSource == "directory");
                var nameCount = projects.Count(p => p.DetectionSource == "naming");
                var defaultCount = projects.Count(p => p.DetectionSource == "default");

                var details = new List<string>();
                if (dirCount > 0) details.Add($"{dirCount} dir");
                if (nameCount > 0) details.Add($"{nameCount} name");
                if (defaultCount > 0) details.Add($"{defaultCount} default");

                var detailStr = details.Count > 0 ? $"({string.Join(", ", details)})" : "";
                Console.WriteLine(Line($"  {layerName.ToUpper(),-18} {projects.Count,3} projects {detailStr}"));
            }

            // Show detected layer directories
            if (summary.DetectedLayerDirectories.Count > 0)
            {
                Console.WriteLine($"╠{new string('═', boxWidth)}╣");
                Console.WriteLine(Line("SOURCE DIRECTORIES:"));
                foreach (var dir in summary.DetectedLayerDirectories.Take(8))
                {
                    var dirDisplay = dir.Length > boxWidth - 6 ? dir.Substring(0, boxWidth - 9) + "..." : dir;
                    Console.WriteLine(Line($"  {dirDisplay}"));
                }
                if (summary.DetectedLayerDirectories.Count > 8)
                {
                    Console.WriteLine(Line($"  ... and {summary.DetectedLayerDirectories.Count - 8} more"));
                }
            }

            // Print warnings (only critical ones)
            var criticalWarnings = summary.Warnings.Where(w =>
                w.Contains("High fallback") || w.Contains("No layer directory")).ToList();

            if (criticalWarnings.Count > 0)
            {
                Console.WriteLine($"╠{new string('═', boxWidth)}╣");
                foreach (var warning in criticalWarnings.Take(3))
                {
                    var warnDisplay = warning.Length > boxWidth - 6 ? warning.Substring(0, boxWidth - 9) + "..." : warning;
                    Console.WriteLine(Line($"! {warnDisplay}"));
                }
            }

            Console.WriteLine($"╚{new string('═', boxWidth)}╝");
        }

        /// <summary>
        /// Ask user to confirm the layer classification before proceeding
        /// </summary>
        public static bool ConfirmClassification(LayerDetectionSummary summary, bool interactive = true)
        {
            PrintSummary(summary);

            if (!interactive)
                return true;

            Console.Write("Do you want to proceed with this classification? (Y/n): ");
            var response = Console.ReadLine()?.Trim().ToLower();

            return string.IsNullOrEmpty(response) || response == "y" || response == "yes";
        }
    }
}
