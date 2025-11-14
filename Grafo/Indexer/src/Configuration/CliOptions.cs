using CommandLine;

namespace RoslynIndexer.Configuration
{
    public class Options
    {
        [Option('s', "solution", Required = false, HelpText = "Path to the solution file")]
        public string SolutionPath { get; set; } = "";

        [Option('o', "output", Required = false, HelpText = "Output file path")]
        public string OutputPath { get; set; } = "";

        [Option('g', "graph", Required = false, HelpText = "Generate graph output file path")]
        public string? GraphOutputPath { get; set; }

        [Option('v', "verbose", Required = false, HelpText = "Verbose output")]
        public bool Verbose { get; set; }

        // Enhanced CLI options
        [Option('c', "config", Required = false, HelpText = "Configuration file path (JSON/YAML)")]
        public string? ConfigPath { get; set; }

        [Option("batch-config", Required = false, HelpText = "Batch processing configuration file")]
        public string? BatchConfigPath { get; set; }

        [Option("filter-types", Required = false, HelpText = "Filter symbol types (comma-separated: Class,Interface,Method,etc)")]
        public string? FilterTypes { get; set; }

        [Option("stats-csv", Required = false, HelpText = "Output statistics to CSV file")]
        public string? StatsCsvPath { get; set; }

        [Option("output-format", Required = false, Default = "json", HelpText = "Output format (json, xml, csv)")]
        public string OutputFormat { get; set; } = "json";

        [Option("exclude-projects", Required = false, HelpText = "Exclude projects (comma-separated regex patterns)")]
        public string? ExcludeProjects { get; set; }

        [Option("include-only", Required = false, HelpText = "Include only these projects (comma-separated regex patterns)")]
        public string? IncludeOnly { get; set; }

        [Option("max-depth", Required = false, Default = -1, HelpText = "Maximum directory depth for file search (-1 for unlimited)")]
        public int MaxDepth { get; set; } = -1;

        [Option("progress", Required = false, Default = false, HelpText = "Show progress indicator")]
        public bool ShowProgress { get; set; }
    }

    public class BatchConfiguration
    {
        public List<BatchItem> Solutions { get; set; } = new();
        public string OutputDirectory { get; set; } = "";
        public bool GenerateGraphs { get; set; } = true;
        public bool GenerateStatistics { get; set; } = true;
        public List<string> FilterTypes { get; set; } = new();
        public List<string> ExcludeProjects { get; set; } = new();
    }

    public class BatchItem
    {
        public string SolutionPath { get; set; } = "";
        public string OutputPrefix { get; set; } = "";
        public bool Enabled { get; set; } = true;
    }
}
