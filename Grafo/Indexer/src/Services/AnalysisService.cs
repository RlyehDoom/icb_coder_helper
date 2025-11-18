using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using RoslynIndexer.Walkers;
using RoslynIndexer.Utils;
using System.Text.RegularExpressions;
using SymbolInfo = RoslynIndexer.Models.SymbolInfo;
using MethodInvocationInfo = RoslynIndexer.Models.MethodInvocationInfo;
using TypeUsageInfo = RoslynIndexer.Models.TypeUsageInfo;
using InheritanceInfo = RoslynIndexer.Models.InheritanceInfo;
using ImplementationInfo = RoslynIndexer.Models.ImplementationInfo;

namespace RoslynIndexer.Services
{
    public class AnalysisService
    {
        public List<MethodInvocationInfo> AllMethodInvocations { get; private set; } = new();
        public List<TypeUsageInfo> AllTypeUsages { get; private set; } = new();
        public List<InheritanceInfo> AllInheritanceRelations { get; private set; } = new();
        public List<ImplementationInfo> AllInterfaceImplementations { get; private set; } = new();
        
        private readonly List<Regex> _excludeProjectPatterns = new();

        public AnalysisService()
        {
            // Load exclude patterns from environment config
            var config = EnvironmentConfig.Current;
            var excludeRegex = config.ExcludeProjectsRegex;
            
            if (!string.IsNullOrWhiteSpace(excludeRegex))
            {
                // Support comma-separated patterns
                var patterns = excludeRegex.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                foreach (var pattern in patterns)
                {
                    try
                    {
                        _excludeProjectPatterns.Add(new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.Compiled));
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"⚠️  Warning: Invalid regex pattern '{pattern}': {ex.Message}");
                    }
                }
            }
        }
        
        /// <summary>
        /// Checks if a project should be excluded based on EXCLUDE_PROJECTS_REGEX
        /// </summary>
        private bool ShouldExcludeProject(string projectName, string projectPath)
        {
            if (_excludeProjectPatterns.Count == 0)
                return false;
            
            foreach (var pattern in _excludeProjectPatterns)
            {
                // Check against both project name and full path
                if (pattern.IsMatch(projectName) || pattern.IsMatch(projectPath))
                    return true;
            }
            
            return false;
        }

        public async Task<List<SymbolInfo>> ProcessSolutionDirectly(string solutionPath, bool verbose, IProgress<string>? progress = null)
        {
            var allSymbols = new List<SymbolInfo>();
            AllMethodInvocations.Clear();
            AllTypeUsages.Clear();
            AllInheritanceRelations.Clear();
            AllInterfaceImplementations.Clear();
            
            if (verbose)
            {
                Console.WriteLine($"🔬 Processing solution with Roslyn Semantic Model...");
                progress?.Report($"Processing solution with Roslyn Semantic Model...");
            }
            
            var solutionDir = Path.GetDirectoryName(solutionPath);
            
            if (string.IsNullOrEmpty(solutionDir)) 
            {
                Console.WriteLine("ERROR: Solution directory is null or empty!");
                return allSymbols;
            }

            // Parse solution file to get project references
            var solutionContent = await File.ReadAllTextAsync(solutionPath);
            if (verbose)
                Console.WriteLine($"Solution file has {solutionContent.Length} characters");
            
            var projectRegex = new Regex(
                @"Project\(""\{[^}]+\}""\)\s*=\s*""([^""]+)"",\s*""([^""]+)"",\s*""\{([^}]+)\}""");
            
            var matches = projectRegex.Matches(solutionContent);
            
            if (verbose)
                Console.WriteLine($"Found {matches.Count} project entries in solution file");
            
            int excludedCount = 0;
            
            foreach (Match match in matches)
            {
                var projectName = match.Groups[1].Value;
                var projectPath = match.Groups[2].Value;
                
                if (!projectPath.EndsWith(".csproj")) continue;
                
                var fullProjectPath = Path.Combine(solutionDir, projectPath);
                if (!File.Exists(fullProjectPath)) continue;

                // Check if project should be excluded based on EXCLUDE_PROJECTS_REGEX
                if (ShouldExcludeProject(projectName, projectPath))
                {
                    excludedCount++;
                    if (verbose)
                    {
                        Console.WriteLine($"\n[Project] {projectName} - EXCLUDED (matches EXCLUDE_PROJECTS_REGEX)");
                    }
                    continue;
                }

                if (verbose)
                {
                    Console.WriteLine($"\n[Project] {projectName}");
                    progress?.Report($"Analyzing project: {projectName}");
                }

                var projectSymbols = await ProcessProjectFiles(fullProjectPath, projectName, verbose, progress);
                allSymbols.AddRange(projectSymbols);
            }

            if (verbose && excludedCount > 0)
            {
                Console.WriteLine($"\n⚠️  Excluded {excludedCount} project(s) based on EXCLUDE_PROJECTS_REGEX");
            }

            if (verbose)
            {
                Console.WriteLine($"\n=== Analysis Summary ===");
                Console.WriteLine($"Total Symbols: {allSymbols.Count}");
                Console.WriteLine($"Method Invocations: {AllMethodInvocations.Count}");
                Console.WriteLine($"Type Usages: {AllTypeUsages.Count}");
                Console.WriteLine($"Inheritance Relations: {AllInheritanceRelations.Count}");
                Console.WriteLine($"Interface Implementations: {AllInterfaceImplementations.Count}");
            }

            return allSymbols;
        }

        public async Task<List<SymbolInfo>> ProcessProjectFiles(string projectPath, string projectName, bool verbose, IProgress<string>? progress = null)
        {
            var projectDir = Path.GetDirectoryName(projectPath);
            if (string.IsNullOrEmpty(projectDir)) 
                return new List<SymbolInfo>();

            // Find all C# files in the project directory
            var csFiles = Directory.GetFiles(projectDir, "*.cs", SearchOption.AllDirectories)
                .Where(f => !f.Contains("\\bin\\") && !f.Contains("\\obj\\") && 
                           !f.Contains("/bin/") && !f.Contains("/obj/"))
                .ToArray();

            if (verbose)
                Console.WriteLine($"  Found {csFiles.Length} C# files");

            // Always use Semantic Model analysis
            return await ProcessProjectFilesWithSemanticModel(projectPath, projectName, csFiles, verbose, progress);
        }

        private async Task<List<SymbolInfo>> ProcessProjectFilesWithSemanticModel(
            string projectPath, 
            string projectName, 
            string[] csFiles, 
            bool verbose, 
            IProgress<string>? progress)
        {
            var allSymbols = new List<SymbolInfo>();
            
            try
            {
                if (verbose)
                    Console.WriteLine($"  Building compilation with semantic model...");

                // Create compilation builder
                var builder = new SemanticCompilationBuilder();
                builder.AddProjectReferences(projectPath);
                
                // Create compilation for the entire project
                var compilation = builder.CreateCompilation(projectName, csFiles, verbose);
                
                // Check for compilation errors (non-blocking)
                var diagnostics = compilation.GetDiagnostics()
                    .Where(d => d.Severity == DiagnosticSeverity.Error)
                    .ToList();

                if (diagnostics.Any())
                {
                    if (verbose)
                    {
                        Console.WriteLine($"  Note: {diagnostics.Count} compilation errors (analysis will continue)");
                    }

                    // DEBUG: Show errors for ApprovalScheme projects
                    if (projectName.Contains("ApprovalScheme"))
                    {
                        Console.WriteLine($"  DEBUG: Compilation errors for {projectName}:");
                        foreach (var diag in diagnostics.Take(10))
                        {
                            Console.WriteLine($"    - {diag.GetMessage()}");
                        }
                        if (diagnostics.Count > 10)
                        {
                            Console.WriteLine($"    ... and {diagnostics.Count - 10} more errors");
                        }
                    }
                }

                // Process each file with semantic model
                for (int i = 0; i < csFiles.Length; i++)
                {
                    var csFile = csFiles[i];
                    try
                    {
                        var syntaxTree = compilation.SyntaxTrees.FirstOrDefault(t => t.FilePath == csFile);
                        if (syntaxTree == null)
                        {
                            // Fallback: create new tree
                            var sourceCode = await File.ReadAllTextAsync(csFile);
                            syntaxTree = CSharpSyntaxTree.ParseText(sourceCode, path: csFile);
                        }

                        var semanticModel = compilation.GetSemanticModel(syntaxTree);
                        var root = await syntaxTree.GetRootAsync();

                        // Use semantic walker
                        var walker = new SemanticWalker(projectName, csFile, semanticModel);
                        walker.Visit(root);
                        
                        allSymbols.AddRange(walker.Symbols);
                        AllMethodInvocations.AddRange(walker.MethodInvocations);
                        AllTypeUsages.AddRange(walker.TypeUsages);
                        AllInheritanceRelations.AddRange(walker.InheritanceRelations);
                        AllInterfaceImplementations.AddRange(walker.InterfaceImplementations);

                        if (verbose && (i % 10 == 0 || i == csFiles.Length - 1))
                            Console.WriteLine($"  Progress: {i + 1}/{csFiles.Length} files");

                        progress?.Report($"Processed {i + 1}/{csFiles.Length} files in {projectName}");
                    }
                    catch (Exception ex)
                    {
                        if (verbose)
                            Console.WriteLine($"  Warning: Error in {Path.GetFileName(csFile)}: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n❌ CRITICAL ERROR: Failed to create Roslyn compilation for project '{projectName}'");
                Console.WriteLine($"   Error: {ex.Message}");
                if (verbose)
                {
                    Console.WriteLine($"\n   Stack trace:");
                    Console.WriteLine($"   {ex.StackTrace}");
                }
                Console.WriteLine($"\n💡 Possible solutions:");
                Console.WriteLine($"   1. Check that all project references are valid");
                Console.WriteLine($"   2. Ensure .NET SDK is properly installed");
                Console.WriteLine($"   3. Verify the project compiles with 'dotnet build'");
                Console.WriteLine($"   4. Check for missing NuGet packages");
                
                // Re-throw the exception to stop analysis
                throw new InvalidOperationException(
                    $"Semantic Model analysis failed for project '{projectName}'. " +
                    $"The project must be compilable for semantic analysis to work. " +
                    $"Original error: {ex.Message}", 
                    ex);
            }

            return allSymbols;
        }

        public Dictionary<string, int> CalculateStatistics(List<SymbolInfo> symbols)
        {
            return new Dictionary<string, int>
            {
                ["TotalSymbols"] = symbols.Count,
                ["Classes"] = symbols.Count(s => s.Type == "Class"),
                ["Interfaces"] = symbols.Count(s => s.Type == "Interface"),
                ["Methods"] = symbols.Count(s => s.Type == "Method"),
                ["Properties"] = symbols.Count(s => s.Type == "Property"),
                ["Fields"] = symbols.Count(s => s.Type == "Field"),
                ["Enums"] = symbols.Count(s => s.Type == "Enum"),
                ["Structs"] = symbols.Count(s => s.Type == "Struct")
            };
        }

        public List<SymbolInfo> FilterSymbols(List<SymbolInfo> symbols, HashSet<string>? filterTypes = null, List<string>? excludeProjects = null, List<string>? includeOnly = null)
        {
            var filtered = symbols.AsEnumerable();

            // Filter by symbol types
            if (filterTypes != null && filterTypes.Any())
            {
                filtered = filtered.Where(s => filterTypes.Contains(s.Type));
            }

            // Filter by project exclusions
            if (excludeProjects != null && excludeProjects.Any())
            {
                var exclusionRegexes = excludeProjects.Select(pattern => new Regex(pattern, RegexOptions.IgnoreCase)).ToList();
                filtered = filtered.Where(s => !exclusionRegexes.Any(regex => regex.IsMatch(s.Project)));
            }

            // Filter by project inclusions
            if (includeOnly != null && includeOnly.Any())
            {
                var inclusionRegexes = includeOnly.Select(pattern => new Regex(pattern, RegexOptions.IgnoreCase)).ToList();
                filtered = filtered.Where(s => inclusionRegexes.Any(regex => regex.IsMatch(s.Project)));
            }

            return filtered.ToList();
        }
    }
}
