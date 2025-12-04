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

        // MongoDB Direct Export Options (v2.1)
        [Option("output-mongodb", Required = false, Default = false, HelpText = "Export directly to MongoDB instead of files")]
        public bool OutputMongoDB { get; set; }

        [Option("mongodb-connection", Required = false, HelpText = "MongoDB connection string (default: mongodb://localhost:27019/)")]
        public string? MongoDbConnection { get; set; }

        [Option("mongodb-database", Required = false, Default = "GraphDB", HelpText = "MongoDB database name")]
        public string MongoDbDatabase { get; set; } = "GraphDB";

        [Option("mongodb-clean", Required = false, Default = false, HelpText = "Delete existing data for this solution before importing")]
        public bool MongoDbClean { get; set; }

        // Layer Detection Options
        [Option("layer-mode", Required = false, Default = "auto", HelpText = "Layer detection mode: auto, directory, naming")]
        public string LayerDetectionMode { get; set; } = "auto";

        [Option("skip-layer-confirmation", Required = false, Default = false, HelpText = "Skip layer classification confirmation prompt")]
        public bool SkipLayerConfirmation { get; set; }

        [Option("show-layer-summary", Required = false, Default = true, HelpText = "Show layer classification summary before processing")]
        public bool ShowLayerSummary { get; set; } = true;
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
