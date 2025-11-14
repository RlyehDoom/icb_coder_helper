using System.Text.RegularExpressions;

namespace RoslynIndexer.Utils
{
    /// <summary>
    /// Discovers and selects solutions interactively from repository directories
    /// </summary>
    public class SolutionDiscovery
    {
        private readonly string _repoBasePath;

        public SolutionDiscovery(string? repoBasePath = null)
        {
            // Default to ../Repo/Cloned relative to current directory
            _repoBasePath = repoBasePath ?? Path.Combine("..", "Repo", "Cloned");
        }

        /// <summary>
        /// Discovers repositories in the configured base path
        /// </summary>
        public List<string> DiscoverRepositories()
        {
            var repositories = new List<string>();

            if (!Directory.Exists(_repoBasePath))
            {
                Console.WriteLine($"Repository directory not found: {_repoBasePath}");
                return repositories;
            }

            // Find only direct directories in Repo/Cloned
            var repoDirs = Directory.GetDirectories(_repoBasePath);
            foreach (var repoDir in repoDirs)
            {
                if (Directory.Exists(repoDir))
                {
                    repositories.Add(repoDir);
                }
            }

            return repositories;
        }

        /// <summary>
        /// Finds all .sln files in a repository (root and first subdirectory level)
        /// Sorted by file size (largest first) to show main solution at top
        /// </summary>
        public List<(string path, string displayName)> FindSolutionsInRepository(string repoDir)
        {
            var solutions = new List<(string path, string displayName, long size)>();
            var repoName = Path.GetFileName(repoDir);

            if (!Directory.Exists(repoDir))
            {
                return new List<(string, string)>();
            }

            // Look for .sln files in repository root
            var rootSolutions = Directory.GetFiles(repoDir, "*.sln", SearchOption.TopDirectoryOnly);
            foreach (var sln in rootSolutions)
            {
                try
                {
                    var fileInfo = new FileInfo(sln);
                    var slnName = Path.GetFileName(sln);
                    solutions.Add((sln, $"{repoName}: {slnName}", fileInfo.Length));
                }
                catch
                {
                    // If we can't get file size, add with size 0
                    var slnName = Path.GetFileName(sln);
                    solutions.Add((sln, $"{repoName}: {slnName}", 0));
                }
            }

            // Look for .sln files in first-level subdirectories
            try
            {
                var subDirs = Directory.GetDirectories(repoDir);
                foreach (var subDir in subDirs)
                {
                    var subDirName = Path.GetFileName(subDir);
                    var subSolutions = Directory.GetFiles(subDir, "*.sln", SearchOption.TopDirectoryOnly);
                    
                    foreach (var sln in subSolutions)
                    {
                        try
                        {
                            var fileInfo = new FileInfo(sln);
                            var slnName = Path.GetFileName(sln);
                            solutions.Add((sln, $"{repoName}: {subDirName}/{slnName}", fileInfo.Length));
                        }
                        catch
                        {
                            // If we can't get file size, add with size 0
                            var slnName = Path.GetFileName(sln);
                            solutions.Add((sln, $"{repoName}: {subDirName}/{slnName}", 0));
                        }
                    }
                }
            }
            catch
            {
                // Ignore errors accessing subdirectories
            }

            // Sort by file size descending (largest first - typically the main solution)
            return solutions
                .OrderByDescending(s => s.size)
                .Select(s => (s.path, s.displayName))
                .ToList();
        }

        /// <summary>
        /// Interactive repository selection
        /// </summary>
        public string? SelectRepositoryInteractive(List<string> repositories)
        {
            if (repositories.Count == 0)
            {
                Console.WriteLine("No repositories available for selection.");
                return null;
            }

            if (repositories.Count == 1)
            {
                var repoName = Path.GetFileName(repositories[0]);
                Console.WriteLine($"✓ Only one repository found: {repoName}");
                return repositories[0];
            }

            Console.WriteLine("\n📁 Available Repositories:");
            Console.WriteLine();

            for (int i = 0; i < repositories.Count; i++)
            {
                var repoName = Path.GetFileName(repositories[i]);
                Console.WriteLine($"  {i + 1,2}) {repoName}");
            }

            Console.WriteLine();

            while (true)
            {
                Console.Write($"Select a repository (1-{repositories.Count}) or 'q' to quit: ");
                var input = Console.ReadLine()?.Trim();

                if (string.IsNullOrEmpty(input))
                    continue;

                if (input.Equals("q", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("Selection cancelled.");
                    return null;
                }

                if (int.TryParse(input, out int choice) && choice >= 1 && choice <= repositories.Count)
                {
                    var selected = repositories[choice - 1];
                    var repoName = Path.GetFileName(selected);
                    Console.WriteLine($"✓ Selected repository: {repoName}");
                    return selected;
                }

                Console.WriteLine($"Invalid selection. Please enter a number between 1 and {repositories.Count}, or 'q' to quit.");
            }
        }

        /// <summary>
        /// Interactive solution selection
        /// </summary>
        public string? SelectSolutionInteractive(List<(string path, string displayName)> solutions)
        {
            if (solutions.Count == 0)
            {
                Console.WriteLine("No solutions available for selection.");
                return null;
            }

            if (solutions.Count == 1)
            {
                Console.WriteLine($"✓ Only one solution found: {solutions[0].displayName}");
                return solutions[0].path;
            }

            Console.WriteLine("\n📋 Available Solutions (sorted by size, largest first):");
            Console.WriteLine();

            for (int i = 0; i < solutions.Count; i++)
            {
                var displayName = solutions[i].displayName;
                var exists = File.Exists(solutions[i].path);
                var status = exists ? "✓" : "✗";
                
                // Get file size for display
                string sizeStr = "";
                if (exists)
                {
                    try
                    {
                        var fileInfo = new FileInfo(solutions[i].path);
                        sizeStr = FormatFileSize(fileInfo.Length);
                    }
                    catch
                    {
                        sizeStr = "?";
                    }
                }
                
                Console.WriteLine($"  {i + 1,2}) {status} {displayName,-50} [{sizeStr}]");
            }

            Console.WriteLine();

            while (true)
            {
                Console.Write($"Select a solution (1-{solutions.Count}) or 'q' to quit: ");
                var input = Console.ReadLine()?.Trim();

                if (string.IsNullOrEmpty(input))
                    continue;

                if (input.Equals("q", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("Selection cancelled.");
                    return null;
                }

                if (int.TryParse(input, out int choice) && choice >= 1 && choice <= solutions.Count)
                {
                    var selected = solutions[choice - 1];
                    Console.WriteLine($"✓ Selected: {selected.displayName}");
                    return selected.path;
                }

                Console.WriteLine($"Invalid selection. Please enter a number between 1 and {solutions.Count}, or 'q' to quit.");
            }
        }

        /// <summary>
        /// Formats file size in human-readable format
        /// </summary>
        private static string FormatFileSize(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB" };
            double len = bytes;
            int order = 0;
            
            while (len >= 1024 && order < sizes.Length - 1)
            {
                order++;
                len = len / 1024;
            }
            
            return $"{len:0.##} {sizes[order]}";
        }

        /// <summary>
        /// Auto-discover and select solution with two-step interactive process
        /// </summary>
        public string? AutoDiscoverAndSelectSolution(bool verbose = false)
        {
            if (verbose)
                Console.WriteLine("🔍 Auto-discovering repositories and solutions...");

            // Step 1: Discover repositories
            var repositories = DiscoverRepositories();

            if (repositories.Count == 0)
            {
                Console.WriteLine("\n⚠️  No repositories found.");
                Console.WriteLine($"   Expected location: {Path.GetFullPath(_repoBasePath)}");
                Console.WriteLine("\nOptions:");
                Console.WriteLine("1. Clone repositories to the expected location");
                Console.WriteLine("2. Use direct analysis: dotnet run -- -s path/to/solution.sln -o output/");
                return null;
            }

            // Step 2: Select repository
            var selectedRepo = SelectRepositoryInteractive(repositories);
            if (selectedRepo == null)
                return null;

            // Step 3: Find solutions in selected repository
            var solutions = FindSolutionsInRepository(selectedRepo);

            if (solutions.Count == 0)
            {
                Console.WriteLine($"\n⚠️  No .sln files found in the selected repository.");
                Console.WriteLine($"   Searched in: {selectedRepo}");
                return null;
            }

            // Step 4: Select solution
            return SelectSolutionInteractive(solutions);
        }

        /// <summary>
        /// Gets the repository name from a solution path
        /// </summary>
        public static string? GetRepositoryName(string solutionPath)
        {
            try
            {
                // Normalize path separators
                var normalizedPath = solutionPath.Replace('\\', '/');
                
                // Look for "Repo/Cloned/RepoName" pattern in the path
                // This regex captures the directory name immediately after "/Repo/Cloned/"
                var match = Regex.Match(normalizedPath, @"Repo/Cloned/([^/]+)", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    var repoName = match.Groups[1].Value;
                    
                    // Make sure we don't capture "Cloned" itself as the repo name
                    if (!string.IsNullOrWhiteSpace(repoName) && 
                        !repoName.Equals("Cloned", StringComparison.OrdinalIgnoreCase))
                    {
                        return repoName;
                    }
                }
            }
            catch
            {
                // Ignore errors
            }

            return null;
        }

        /// <summary>
        /// Builds output directory based on repository name
        /// </summary>
        public static string BuildOutputDirectory(string solutionPath, string defaultOutputDir, bool useRepoName = true)
        {
            if (!useRepoName)
                return defaultOutputDir;

            var repoName = GetRepositoryName(solutionPath);
            if (!string.IsNullOrEmpty(repoName))
            {
                return $"./{repoName}_GraphFiles";
            }

            return defaultOutputDir;
        }
    }
}

