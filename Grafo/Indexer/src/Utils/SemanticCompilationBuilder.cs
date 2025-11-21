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

                // Extract ProjectReference elements - CRITICAL for cross-project interface resolution
                var projRefMatches = System.Text.RegularExpressions.Regex.Matches(
                    content,
                    @"<ProjectReference\s+Include\s*=\s*""([^""]+)""");

                foreach (System.Text.RegularExpressions.Match match in projRefMatches)
                {
                    var relativeProjectPath = match.Groups[1].Value;
                    var absoluteProjectPath = Path.GetFullPath(Path.Combine(projectDir, relativeProjectPath));

                    // Try to find the compiled DLL for this project reference
                    TryAddProjectReferenceAssembly(absoluteProjectPath);
                }

                // ENHANCEMENT: Add all compiled DLLs from the solution directory to handle transitive references
                // This helps resolve references that are not directly listed in the .csproj
                AddSolutionCompiledReferences(projectPath);

                // Add NuGet package references from packages directory
                AddNuGetPackageReferences(packageMatches, projectPath);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Could not parse project references from {projectPath}: {ex.Message}");
            }
        }

        /// <summary>
        /// Adds NuGet package DLLs to references
        /// </summary>
        private void AddNuGetPackageReferences(System.Text.RegularExpressions.MatchCollection packageMatches, string projectPath)
        {
            try
            {
                // Get user's NuGet packages directory
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var nugetPackagesDir = Path.Combine(userProfile, ".nuget", "packages");

                if (!Directory.Exists(nugetPackagesDir))
                    return;

                foreach (System.Text.RegularExpressions.Match match in packageMatches)
                {
                    var packageName = match.Groups[1].Value.ToLowerInvariant();

                    // Look for this package in NuGet cache
                    var packageDir = Path.Combine(nugetPackagesDir, packageName);
                    if (Directory.Exists(packageDir))
                    {
                        // Find the most recent version
                        var versions = Directory.GetDirectories(packageDir);
                        if (versions.Length > 0)
                        {
                            // Use the first version found (could be improved with proper version selection)
                            var latestVersion = versions.OrderByDescending(v => v).First();

                            // Look for lib/netstandard* or lib/net* DLLs
                            var libDir = Path.Combine(latestVersion, "lib");
                            if (Directory.Exists(libDir))
                            {
                                var tfmDirs = new[] { "netstandard2.0", "netstandard2.1", "net8.0", "net7.0", "net6.0", "net5.0" };
                                foreach (var tfm in tfmDirs)
                                {
                                    var tfmPath = Path.Combine(libDir, tfm);
                                    if (Directory.Exists(tfmPath))
                                    {
                                        var dlls = Directory.GetFiles(tfmPath, "*.dll", SearchOption.TopDirectoryOnly);
                                        foreach (var dll in dlls)
                                        {
                                            try
                                            {
                                                _references.Add(MetadataReference.CreateFromFile(dll));
                                            }
                                            catch (BadImageFormatException)
                                            {
                                                // Native DLL without .NET metadata - skip silently
                                            }
                                            catch
                                            {
                                                // Skip DLLs that can't be loaded as metadata
                                            }
                                        }

                                        if (dlls.Length > 0)
                                            break; // Found DLLs in this TFM, don't check others
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch
            {
                // Silently fail if we can't add NuGet references
            }
        }

        /// <summary>
        /// Adds all compiled DLLs from the solution directory to handle transitive references
        /// </summary>
        private void AddSolutionCompiledReferences(string projectPath)
        {
            try
            {
                var projectDir = Path.GetDirectoryName(projectPath);
                if (string.IsNullOrEmpty(projectDir)) return;

                // Find the solution root directory (walk up until we find a .sln or stop at a reasonable depth)
                var solutionDir = FindSolutionDirectory(projectDir);
                if (string.IsNullOrEmpty(solutionDir)) return;

                // Search for all compiled DLLs in the solution
                var dllPattern = "*.dll";
                var searchPaths = new[]
                {
                    Path.Combine(solutionDir, "**", "bin", "Debug", "net8.0", dllPattern),
                    Path.Combine(solutionDir, "**", "bin", "Release", "net8.0", dllPattern),
                    Path.Combine(solutionDir, "**", "bin", "Debug", "netstandard2.0", dllPattern),
                    Path.Combine(solutionDir, "**", "bin", "Release", "netstandard2.0", dllPattern),
                    Path.Combine(solutionDir, "**", "bin", "Debug", "netstandard2.1", dllPattern),
                    Path.Combine(solutionDir, "**", "bin", "Release", "netstandard2.1", dllPattern)
                };

                var addedDlls = new HashSet<string>();

                foreach (var searchPattern in searchPaths)
                {
                    var baseDir = solutionDir;
                    var pattern = searchPattern.Replace(solutionDir + Path.DirectorySeparatorChar, "").Replace("**" + Path.DirectorySeparatorChar, "");

                    // Manual recursive search since .NET doesn't support ** in Directory.GetFiles directly
                    AddDllsFromDirectory(solutionDir, pattern, addedDlls);
                }
            }
            catch
            {
                // Silently fail if we can't add solution references
            }
        }

        /// <summary>
        /// Recursively searches for DLLs matching a pattern
        /// </summary>
        private void AddDllsFromDirectory(string directory, string pattern, HashSet<string> addedDlls)
        {
            try
            {
                // Look for bin/Debug and bin/Release directories
                var binDirs = new[] { "bin/Debug", "bin\\Debug", "bin/Release", "bin\\Release" };

                foreach (var binRelative in binDirs)
                {
                    var binPath = Path.Combine(directory, binRelative);
                    if (Directory.Exists(binPath))
                    {
                        // Search in target framework directories
                        var tfmDirs = new[] { "net8.0", "netstandard2.0", "netstandard2.1", "net7.0", "net6.0" };
                        foreach (var tfm in tfmDirs)
                        {
                            var tfmPath = Path.Combine(binPath, tfm);
                            if (Directory.Exists(tfmPath))
                            {
                                var dlls = Directory.GetFiles(tfmPath, "*.dll", SearchOption.TopDirectoryOnly);
                                foreach (var dll in dlls)
                                {
                                    var fileName = Path.GetFileName(dll);

                                    // Skip system/framework DLLs to avoid conflicts
                                    if (IsSystemAssembly(fileName))
                                        continue;

                                    // Add all project DLLs (not already added)
                                    if (!addedDlls.Contains(dll))
                                    {
                                        try
                                        {
                                            _references.Add(MetadataReference.CreateFromFile(dll));
                                            addedDlls.Add(dll);
                                        }
                                        catch (BadImageFormatException)
                                        {
                                            // This is a native DLL (C/C++) without .NET metadata
                                            // Silently skip - this is expected for libraries like SQLClient SNI
                                        }
                                        catch
                                        {
                                            // Skip other DLLs that can't be loaded as metadata
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Recursively search subdirectories
                var subdirs = Directory.GetDirectories(directory);
                foreach (var subdir in subdirs)
                {
                    var dirName = Path.GetFileName(subdir);
                    // Skip bin and obj directories to avoid going too deep
                    if (dirName != "bin" && dirName != "obj" && dirName != "packages" && dirName != "node_modules")
                    {
                        AddDllsFromDirectory(subdir, pattern, addedDlls);
                    }
                }
            }
            catch
            {
                // Silently skip directories we can't access
            }
        }

        /// <summary>
        /// Checks if a DLL is a system/framework assembly or native DLL that should be skipped
        /// </summary>
        private bool IsSystemAssembly(string fileName)
        {
            var name = fileName.ToLower();

            // Skip well-known system assemblies
            var systemPrefixes = new[]
            {
                "system.",
                "microsoft.aspnetcore.",
                "microsoft.extensions.",
                "microsoft.codeanalysis.",
                "microsoft.visualstudio.",
                "microsoft.win32.",
                "microsoft.entityframeworkcore.",
                "netstandard.",
                "mscorlib.",
                "windowsbase.",
                "presentationcore.",
                "presentationframework.",
                "system32.",
                "api-ms-",
                "clr",
                "ucrtbase"
            };

            // Check if filename starts with any system prefix
            foreach (var prefix in systemPrefixes)
            {
                if (name.StartsWith(prefix))
                    return true;
            }

            // Skip native DLLs (not managed code)
            // These are C/C++ libraries that don't have .NET metadata
            var nativePatterns = new[]
            {
                ".sni.",           // SQL Native Interface (e.g., Microsoft.Data.SqlClient.SNI.x64.dll)
                ".native.",        // Native libraries
                "e_sqlite3.",      // SQLite native
                "libe_sqlite3.",
                "sqlcipher.",
                "winsqlite3.",
                "sqlite3."
            };

            foreach (var pattern in nativePatterns)
            {
                if (name.Contains(pattern))
                    return true;
            }

            // Also skip some exact matches and patterns
            var exactMatches = new[]
            {
                "netstandard.dll",
                "mscorlib.dll",
                "vshost.exe",
                "vshost32.exe"
            };

            foreach (var match in exactMatches)
            {
                if (name == match)
                    return true;
            }

            return false;
        }

        /// <summary>
        /// Finds the solution directory by walking up from the project directory
        /// </summary>
        private string? FindSolutionDirectory(string startDir)
        {
            var currentDir = startDir;
            var maxDepth = 10;
            var depth = 0;

            while (!string.IsNullOrEmpty(currentDir) && depth < maxDepth)
            {
                // Check if this directory contains a .sln file
                var slnFiles = Directory.GetFiles(currentDir, "*.sln", SearchOption.TopDirectoryOnly);
                if (slnFiles.Length > 0)
                {
                    return currentDir;
                }

                // Move up one directory
                var parentDir = Directory.GetParent(currentDir);
                if (parentDir == null) break;

                currentDir = parentDir.FullName;
                depth++;
            }

            return null;
        }

        /// <summary>
        /// Tries to add a reference to a compiled project assembly
        /// </summary>
        private void TryAddProjectReferenceAssembly(string projectPath)
        {
            try
            {
                var projectDir = Path.GetDirectoryName(projectPath);
                if (string.IsNullOrEmpty(projectDir)) return;

                // Read AssemblyName from .csproj if available, otherwise use project file name
                var assemblyName = GetAssemblyNameFromProject(projectPath);
                var projectName = Path.GetFileNameWithoutExtension(projectPath);

                // Try common build output locations with both AssemblyName and project name
                var targetFrameworks = new[]
                {
                    "net8.0", "net7.0", "net6.0",
                    "netstandard2.1", "netstandard2.0"
                };

                var configurations = new[] { "Debug", "Release" };
                var namesToTry = new[] { assemblyName, projectName };

                foreach (var name in namesToTry.Distinct())
                {
                    foreach (var config in configurations)
                    {
                        foreach (var tfm in targetFrameworks)
                        {
                            var path = Path.Combine(projectDir, "bin", config, tfm, $"{name}.dll");
                            if (File.Exists(path))
                            {
                                _references.Add(MetadataReference.CreateFromFile(path));
                                return; // Found and added, stop searching
                            }
                        }
                    }
                }
            }
            catch
            {
                // Couldn't add this project reference, continue
            }
        }

        /// <summary>
        /// Reads the AssemblyName from a .csproj file
        /// </summary>
        private string GetAssemblyNameFromProject(string projectPath)
        {
            try
            {
                if (!File.Exists(projectPath))
                    return Path.GetFileNameWithoutExtension(projectPath);

                var content = File.ReadAllText(projectPath);

                // Try to extract <AssemblyName>...</AssemblyName>
                var match = System.Text.RegularExpressions.Regex.Match(
                    content,
                    @"<AssemblyName>([^<]+)</AssemblyName>",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                if (match.Success)
                {
                    return match.Groups[1].Value.Trim();
                }

                // Fallback to project file name
                return Path.GetFileNameWithoutExtension(projectPath);
            }
            catch
            {
                return Path.GetFileNameWithoutExtension(projectPath);
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

