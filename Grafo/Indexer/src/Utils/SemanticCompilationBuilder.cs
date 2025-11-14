using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System.Reflection;

namespace RoslynIndexer.Utils
{
    /// <summary>
    /// Builds Roslyn compilations with semantic models for accurate code analysis
    /// </summary>
    public class SemanticCompilationBuilder
    {
        private readonly List<MetadataReference> _references = new();
        private readonly CSharpCompilationOptions _options;

        public SemanticCompilationBuilder()
        {
            _options = new CSharpCompilationOptions(
                OutputKind.DynamicallyLinkedLibrary,
                allowUnsafe: true,
                nullableContextOptions: NullableContextOptions.Enable);
            
            AddDefaultReferences();
        }

        /// <summary>
        /// Adds default framework references required for most C# code
        /// </summary>
        private void AddDefaultReferences()
        {
            // Core framework references
            var assemblies = new[]
            {
                typeof(object).Assembly,                    // System.Private.CoreLib
                typeof(Console).Assembly,                   // System.Console
                typeof(Enumerable).Assembly,               // System.Linq
                Assembly.Load("System.Runtime"),
                Assembly.Load("System.Collections"),
                Assembly.Load("netstandard")
            };

            foreach (var assembly in assemblies)
            {
                try
                {
                    if (!string.IsNullOrEmpty(assembly.Location))
                    {
                        _references.Add(MetadataReference.CreateFromFile(assembly.Location));
                    }
                }
                catch
                {
                    // Skip assemblies that can't be loaded
                }
            }

            // Try to add common framework assemblies
            TryAddAssemblyReference("System.Runtime");
            TryAddAssemblyReference("System.Collections");
            TryAddAssemblyReference("System.Linq");
            TryAddAssemblyReference("System.Threading.Tasks");
            TryAddAssemblyReference("System.Text.RegularExpressions");
            TryAddAssemblyReference("Microsoft.CSharp");
        }

        /// <summary>
        /// Try to add an assembly reference by name
        /// </summary>
        private void TryAddAssemblyReference(string assemblyName)
        {
            try
            {
                var assembly = Assembly.Load(assemblyName);
                if (!string.IsNullOrEmpty(assembly.Location))
                {
                    _references.Add(MetadataReference.CreateFromFile(assembly.Location));
                }
            }
            catch
            {
                // Assembly not available, skip it
            }
        }

        /// <summary>
        /// Adds references from a .csproj file
        /// </summary>
        public void AddProjectReferences(string projectPath)
        {
            if (!File.Exists(projectPath)) return;

            try
            {
                var projectDir = Path.GetDirectoryName(projectPath);
                if (string.IsNullOrEmpty(projectDir)) return;

                // Parse .csproj to extract PackageReferences and References
                var content = File.ReadAllText(projectPath);
                
                // Extract PackageReference elements (simplified parsing)
                var packageMatches = System.Text.RegularExpressions.Regex.Matches(
                    content, 
                    @"<PackageReference\s+Include\s*=\s*""([^""]+)""");

                foreach (System.Text.RegularExpressions.Match match in packageMatches)
                {
                    var packageName = match.Groups[1].Value;
                    TryAddAssemblyReference(packageName);
                }

                // Extract Reference elements
                var refMatches = System.Text.RegularExpressions.Regex.Matches(
                    content, 
                    @"<Reference\s+Include\s*=\s*""([^""]+)""");

                foreach (System.Text.RegularExpressions.Match match in refMatches)
                {
                    var refName = match.Groups[1].Value.Split(',')[0]; // Remove version info
                    TryAddAssemblyReference(refName);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Could not parse project references from {projectPath}: {ex.Message}");
            }
        }

        /// <summary>
        /// Creates a compilation for a project with all its source files
        /// </summary>
        public CSharpCompilation CreateCompilation(
            string projectName, 
            IEnumerable<string> sourceFiles,
            bool verbose = false)
        {
            var syntaxTrees = new List<SyntaxTree>();
            
            foreach (var file in sourceFiles)
            {
                try
                {
                    var sourceCode = File.ReadAllText(file);
                    var syntaxTree = CSharpSyntaxTree.ParseText(
                        sourceCode, 
                        path: file,
                        options: new CSharpParseOptions(LanguageVersion.Latest));
                    
                    syntaxTrees.Add(syntaxTree);
                }
                catch (Exception ex)
                {
                    if (verbose)
                        Console.WriteLine($"  Warning: Could not parse {file}: {ex.Message}");
                }
            }

            if (verbose)
            {
                Console.WriteLine($"  Creating compilation with {syntaxTrees.Count} syntax trees");
                Console.WriteLine($"  Using {_references.Count} metadata references");
            }

            return CSharpCompilation.Create(
                projectName,
                syntaxTrees,
                _references,
                _options);
        }

        /// <summary>
        /// Creates individual syntax trees with semantic models
        /// Useful when you can't compile the entire project
        /// </summary>
        public (SyntaxTree tree, SemanticModel model) CreateSemanticModel(
            string sourceCode, 
            string filePath,
            string projectName = "TempProject")
        {
            var syntaxTree = CSharpSyntaxTree.ParseText(
                sourceCode,
                path: filePath,
                options: new CSharpParseOptions(LanguageVersion.Latest));

            var compilation = CSharpCompilation.Create(
                projectName,
                new[] { syntaxTree },
                _references,
                _options);

            var semanticModel = compilation.GetSemanticModel(syntaxTree);
            
            return (syntaxTree, semanticModel);
        }

        /// <summary>
        /// Gets the semantic model for a syntax tree within a compilation
        /// </summary>
        public static SemanticModel GetSemanticModel(CSharpCompilation compilation, SyntaxTree syntaxTree)
        {
            return compilation.GetSemanticModel(syntaxTree);
        }
    }
}

