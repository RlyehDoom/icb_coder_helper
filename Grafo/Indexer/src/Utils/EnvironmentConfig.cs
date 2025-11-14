namespace RoslynIndexer.Utils
{
    /// <summary>
    /// Loads and manages environment configuration from .env file dynamically
    /// Automatically loads on first access (Singleton pattern)
    /// No need to modify code when adding new .env variables!
    /// </summary>
    public class EnvironmentConfig
    {
        private static readonly Lazy<EnvironmentConfig> _instance = new Lazy<EnvironmentConfig>(() => LoadInternal(".env"));
        
        /// <summary>
        /// Gets the singleton instance (automatically loads .env on first access)
        /// </summary>
        public static EnvironmentConfig Current => _instance.Value;

        /// <summary>
        /// Dictionary holding all environment variables from .env
        /// Access any variable dynamically: config["MY_NEW_VAR"]
        /// </summary>
        private readonly Dictionary<string, string> _variables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Private constructor to enforce singleton pattern
        /// </summary>
        private EnvironmentConfig() { }
        
        /// <summary>
        /// Gets a value from .env by key, returns default if not found
        /// </summary>
        public string Get(string key, string defaultValue = "")
        {
            return _variables.TryGetValue(key, out var value) ? value : defaultValue;
        }
        
        /// <summary>
        /// Gets a boolean value from .env by key
        /// </summary>
        public bool GetBool(string key, bool defaultValue = false)
        {
            if (!_variables.TryGetValue(key, out var value))
                return defaultValue;
            
            var lower = value.ToLower();
            return lower == "true" || lower == "yes" || lower == "1";
        }
        
        /// <summary>
        /// Gets an integer value from .env by key
        /// </summary>
        public int GetInt(string key, int defaultValue = 0)
        {
            if (!_variables.TryGetValue(key, out var value))
                return defaultValue;
            
            return int.TryParse(value, out var result) ? result : defaultValue;
        }
        
        /// <summary>
        /// Checks if a key exists in .env
        /// </summary>
        public bool Has(string key)
        {
            return _variables.ContainsKey(key);
        }
        
        /// <summary>
        /// Gets all loaded variables (read-only)
        /// </summary>
        public IReadOnlyDictionary<string, string> AllVariables => _variables;
        
        // Convenience properties for commonly used variables
        // These are shortcuts but you can still add new variables without modifying code
        public string DefaultSolutionPath => Get("DEFAULT_SOLUTION_PATH");
        public string DefaultOutputDir => Get("DEFAULT_OUTPUT_DIR", "./analysis-output");
        public bool UseRepoNameInOutput => GetBool("USE_REPO_NAME_IN_OUTPUT", true);
        public string DefaultOutputFormat => Get("DEFAULT_OUTPUT_FORMAT", "json");
        public bool GenerateGraphs => GetBool("GENERATE_GRAPHS", true);
        public bool GenerateStatistics => GetBool("GENERATE_STATISTICS", true);
        public bool VerboseMode => GetBool("VERBOSE_MODE", false);
        public string FilterSymbolTypes => Get("FILTER_SYMBOL_TYPES");
        public string ExcludeProjectsRegex => Get("EXCLUDE_PROJECTS_REGEX");
        public bool IncludeTimestamp => GetBool("INCLUDE_TIMESTAMP", false);
        public bool CreateSolutionSubdir => GetBool("CREATE_SOLUTION_SUBDIR", true);
        public string OutputFilePrefix => Get("OUTPUT_FILE_PREFIX");

        /// <summary>
        /// Internal method to load configuration from .env file dynamically
        /// All variables are stored in a dictionary for flexible access
        /// </summary>
        private static EnvironmentConfig LoadInternal(string envFilePath)
        {
            var config = new EnvironmentConfig();

            if (!File.Exists(envFilePath))
            {
                return config; // Return empty configuration
            }

            try
            {
                var lines = File.ReadAllLines(envFilePath);
                foreach (var line in lines)
                {
                    // Skip comments and empty lines
                    var trimmedLine = line.Trim();
                    if (string.IsNullOrWhiteSpace(trimmedLine) || trimmedLine.StartsWith("#"))
                        continue;

                    // Parse KEY=VALUE
                    var parts = trimmedLine.Split('=', 2);
                    if (parts.Length != 2)
                        continue;

                    var key = parts[0].Trim();
                    var value = parts[1].Trim();

                    // Remove quotes if present
                    if ((value.StartsWith("\"") && value.EndsWith("\"")) ||
                        (value.StartsWith("'") && value.EndsWith("'")))
                    {
                        value = value.Substring(1, value.Length - 2);
                    }

                    // Store in dictionary - ALL variables, not just predefined ones!
                    config._variables[key] = value;
                }
            }
            catch
            {
                // Silently fail and return empty configuration
            }

            return config;
        }
        
        /// <summary>
        /// Logs the current configuration (for debugging/verbose mode)
        /// Shows ALL variables loaded from .env file dynamically
        /// </summary>
        public void LogConfiguration()
        {
            Console.WriteLine("=== Environment Configuration (.env) ===");
            if (_variables.Count == 0)
            {
                Console.WriteLine("  (No .env file loaded or file is empty)");
            }
            else
            {
                foreach (var kvp in _variables.OrderBy(x => x.Key))
                {
                    // Mask sensitive values (password, token, key, secret)
                    var value = kvp.Value;
                    if (kvp.Key.ToLower().Contains("password") || 
                        kvp.Key.ToLower().Contains("token") || 
                        kvp.Key.ToLower().Contains("secret") ||
                        kvp.Key.ToLower().Contains("key"))
                    {
                        value = "***MASKED***";
                    }
                    
                    Console.WriteLine($"  {kvp.Key,-30} : {value}");
                }
            }
            Console.WriteLine("========================================");
        }

        /// <summary>
        /// Builds output directory based on configuration and solution path
        /// Always respects DEFAULT_OUTPUT_DIR as the base directory
        /// </summary>
        public string BuildOutputDirectory(string solutionPath)
        {
            // If not using repo name, just return the default output dir
            if (!UseRepoNameInOutput)
                return DefaultOutputDir;

            // If using repo name, append it to the default output dir
            var repoName = SolutionDiscovery.GetRepositoryName(solutionPath);
            if (!string.IsNullOrEmpty(repoName))
            {
                // Use DEFAULT_OUTPUT_DIR as base, then add repo-specific subdirectory
                return Path.Combine(DefaultOutputDir, $"{repoName}_GraphFiles");
            }

            return DefaultOutputDir;
        }

        /// <summary>
        /// Builds full output path including subdirectory if configured
        /// </summary>
        public string BuildFullOutputPath(string solutionPath)
        {
            var baseDir = BuildOutputDirectory(solutionPath);
            
            if (!CreateSolutionSubdir)
                return baseDir;

            var solutionName = Path.GetFileNameWithoutExtension(solutionPath);
            return Path.Combine(baseDir, solutionName);
        }

        /// <summary>
        /// Gets the output file prefix (from config or solution name)
        /// </summary>
        public string GetOutputFilePrefix(string solutionPath)
        {
            if (!string.IsNullOrEmpty(OutputFilePrefix))
                return OutputFilePrefix;

            return Path.GetFileNameWithoutExtension(solutionPath);
        }

        /// <summary>
        /// Adds timestamp to filename if configured
        /// </summary>
        public string AddTimestamp(string fileName)
        {
            if (!IncludeTimestamp)
                return fileName;

            var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            var extension = Path.GetExtension(fileName);
            var nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
            
            return $"{nameWithoutExt}-{timestamp}{extension}";
        }
    }
}

