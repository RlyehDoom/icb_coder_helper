# RoslynIndexer - C# Code Analysis Tool

A powerful command-line tool for analyzing C# codebases using Microsoft Roslyn. Extracts symbols, generates architectural graphs, and provides detailed statistics about your code structure.

## Features

- **🔬 Roslyn Semantic Model**: Deep semantic analysis using Microsoft Roslyn compiler platform
  - Resolves interfaces and implementations
  - Tracks inheritance hierarchies
  - Identifies polymorphic calls and virtual method invocations
  - Detects actual type references with full namespace resolution
  - Captures method invocations with precise target information
  - No syntax-only fallback - compilation is required for accuracy
- **MSBuild-Free Analysis**: Analyzes C# solutions without requiring MSBuild infrastructure
- **Symbol Extraction**: Identifies classes, interfaces, methods, properties, fields, enums, and structs
- **Architectural Graphs**: Generates comprehensive relationship graphs organized by architectural layers
- **Multiple Output Formats**: JSON, XML, and CSV output formats
- **Batch Processing**: Process multiple solutions with configuration files
- **Filtering Options**: Filter by symbol types, projects, and other criteria
- **Progress Reporting**: Real-time progress updates for long-running analyses
- **Docker Support**: Run in containerized environments
- **Cross-Platform**: Works on Windows, macOS, and Linux using bash scripts

## Installation

### Prerequisites

- .NET 8.0 SDK
- Bash shell (available on Windows via WSL, Git Bash, or PowerShell with bash support)
- C# solutions/projects to analyze

### Build from Source

```bash
git clone <repository>
cd Grafo/Indexer

# Optional: Setup environment configuration
cp .env.example .env
# Edit .env with your preferred settings

./build.sh build
```

### Docker

```bash
./build.sh docker-build
```

## Usage

### Environment Configuration

RoslynIndexer supports environment-based configuration through a `.env` file:

```bash
# Copy the example configuration
cp env.example .env

# Edit the configuration file
nano .env  # or your preferred editor on Linux/Mac
notepad .env  # or on Windows
```

**Key Configuration Options:**

```bash
# Base output directory
DEFAULT_OUTPUT_DIR=./analysis-output

# Use repository name in output path (creates {RepoName}_GraphFiles/)
USE_REPO_NAME_IN_OUTPUT=true

# Enable verbose output by default
VERBOSE_MODE=false

# Filter symbol types
FILTER_SYMBOL_TYPES=Class,Interface,Method

# Exclude test projects
EXCLUDE_PROJECTS_REGEX=.*\.Tests$,.*\.UnitTests$
```

The tool **automatically loads** `.env` on first run (lazy loading). No manual configuration needed - just create the file and run!

#### Adding Custom Variables (Dynamic Configuration)

You can add **ANY custom variable** to `.env` without modifying C# code:

```bash
# In .env
MY_API_URL=https://api.example.com
MAX_FILE_SIZE_MB=100
ENABLE_BETA_FEATURES=true
```

```csharp
// Access in code anywhere using the Singleton
var config = EnvironmentConfig.Current;

// Get string values with optional defaults
var apiUrl = config.Get("MY_API_URL", "https://default-api.com");

// Get typed values
var maxSize = config.GetInt("MAX_FILE_SIZE_MB", 50);
var enableBeta = config.GetBool("ENABLE_BETA_FEATURES", false);

// Check if a variable exists
if (config.Has("MY_API_URL")) 
{
    // do something
}

// Get all variables
foreach (var kvp in config.AllVariables) 
{
    Console.WriteLine($"{kvp.Key} = {kvp.Value}");
}
```

**Benefits:**
- ✅ No code changes needed when adding new config variables
- ✅ Type-safe access with `Get()`, `GetInt()`, `GetBool()`
- ✅ Default values built-in
- ✅ Case-insensitive keys
- ✅ Automatic masking of sensitive values (password, token, secret, key) in logs

### Basic Analysis

```bash
# Interactive Mode (Recommended)
# Simply run without parameters for interactive solution selection
dotnet run

# Or using build script
./build.sh analyze

# List available solutions
./build.sh list-solutions

# Direct analysis with explicit parameters
dotnet run -- -s solution.sln -o output/

# With verbose output
dotnet run -- -s solution.sln -o output/ -v
```

> **Note:** RoslynIndexer always uses Roslyn's **Semantic Model** for high-precision analysis. 
> If compilation fails, it automatically falls back to syntax-only mode.

### Interactive Mode Features

When you run `dotnet run` without parameters, the tool will:

1. **🔍 Auto-discover** repositories in `../Repo/Cloned/`
2. **📁 List repositories** with interactive selection
3. **📋 Find .sln files** in selected repository (sorted by size, largest first)
4. **✅ Auto-configure** output directory as `{RepoName}_GraphFiles/`
5. **🚀 Start analysis** with semantic model

> **Smart Ordering:** Solutions are automatically sorted by file size (largest first), 
> so the main solution typically appears at position #1.

Example session:
```
🔬 RoslynIndexer - Interactive Mode
═══════════════════════════════════════

📁 Available Repositories:

   1) MyProject
   2) AnotherRepo
   3) TestSolution

Select a repository (1-3) or 'q' to quit: 1
✓ Selected repository: MyProject

📋 Available Solutions (sorted by size, largest first):

   1) ✓ MyProject: Solution.sln                              [125.5 KB]
   2) ✓ MyProject: Backend/Backend.sln                       [45.2 KB]

Select a solution (1-2) or 'q' to quit: 1
✓ Selected: MyProject: Solution.sln

📂 Output directory: C:\Path\MyProject_GraphFiles

Analysis Mode: SEMANTIC MODEL (high precision)
Processing solution with SEMANTIC MODEL analysis...
...
```

### What Makes Semantic Model Special?

RoslynIndexer uses Roslyn's semantic analysis to provide:

✅ **Exact Symbol Resolution** - No name guessing  
✅ **Interface Detection** - Tracks all implementations  
✅ **Inheritance Tracking** - Complete hierarchy analysis  
✅ **Polymorphic Calls** - Resolves virtual/abstract methods  
✅ **Generic Types** - Handles type parameters correctly  
✅ **Cross-Project References** - Accurate dependency tracking

### Advanced Options

```bash
# Filter specific symbol types
./RoslynIndexer -s solution.sln -o output.json --filter-types "Class,Interface"

# Exclude test projects
./RoslynIndexer -s solution.sln -o output.json --exclude-projects ".*\.Tests$,.*\.Test$"

# Generate statistics CSV
./RoslynIndexer -s solution.sln -o output.json --stats-csv stats.csv

# XML output format
./RoslynIndexer -s solution.sln -o output.xml --output-format xml
```

### Batch Processing

```bash
# Process multiple solutions using YAML config
./RoslynIndexer --batch-config batch-config.yaml

# Process multiple solutions using JSON config
./RoslynIndexer --batch-config batch-config.json
```

### Docker Usage

```bash
# Basic analysis
docker run --rm \
  -v /path/to/code:/input \
  -v /path/to/output:/output \
  roslyn-indexer -s /input/solution.sln -o /output/result.json

# With graph generation
docker run --rm \
  -v /path/to/code:/input \
  -v /path/to/output:/output \
  roslyn-indexer -s /input/solution.sln -o /output/result.json -g /output/graph.json

# Batch processing
docker run --rm \
  -v /path/to/code:/input \
  -v /path/to/output:/output \
  -v /path/to/config:/config \
  roslyn-indexer --batch-config /config/batch.yaml
```

## Configuration

### Environment Variables (.env)

The indexer supports environment-based configuration for convenient default settings. Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `DEFAULT_SOLUTION_PATH` | Default solution to analyze | Auto-discover from `Grafo/Repo/Cloned/` |
| `DEFAULT_OUTPUT_DIR` | Base output directory | `./analysis-output` |
| `USE_REPO_NAME_IN_OUTPUT` | Use repo name + "_GraphFiles" as output dir | `true` |
| `DEFAULT_OUTPUT_FORMAT` | Output format (json/xml) | `json` |
| `GENERATE_GRAPHS` | Generate architectural graphs | `true` |
| `GENERATE_STATISTICS` | Generate CSV statistics | `true` |
| `VERBOSE_MODE` | Enable verbose output | `false` |
| `FILTER_SYMBOL_TYPES` | Symbol types to include | `Class,Interface,Method,Property` |
| `EXCLUDE_PROJECTS_REGEX` | Projects to exclude (regex patterns) | `.*\.Tests?$,.*\.UnitTests?$` |

#### Project Filtering with EXCLUDE_PROJECTS_REGEX

Exclude projects from analysis using comma-separated regex patterns. Patterns are matched against **both** project name and project path.

**Common Examples:**

```bash
# Exclude all test projects
EXCLUDE_PROJECTS_REGEX=.*\.Tests?$,.*\.UnitTests?$,.*\.IntegrationTests?$

# Exclude specific projects by name
EXCLUDE_PROJECTS_REGEX=MyProject\.Tests,Legacy\.OldProject,Deprecated\..*

# Exclude by path pattern (Windows-style paths)
EXCLUDE_PROJECTS_REGEX=.*\\tests\\.*,.*\\TestProjects\\.*,.*\\samples\\.*

# Combine multiple patterns
EXCLUDE_PROJECTS_REGEX=.*\.Tests?$,.*Migration.*,.*Legacy.*,.*\.Benchmark$
```

**When using verbose mode (`-v` or `VERBOSE_MODE=true`):**
- Shows which projects are excluded: `[Project] MyProject.Tests - EXCLUDED (matches EXCLUDE_PROJECTS_REGEX)`
- Displays total excluded count: `⚠️ Excluded 5 project(s) based on EXCLUDE_PROJECTS_REGEX`

**Pattern Matching:**
- Case-insensitive matching (e.g., `test` matches `Test`, `TEST`, etc.)
- Checks both project name (e.g., `MyApp.Tests`) and project path (e.g., `src\Tests\MyApp.Tests.csproj`)
- Use `.*` for wildcard matching
- Use `$` to match end of string
- Use `\.` to match literal dot (not any character)

**Usage with smart defaults:**
```bash
./build.sh analyze        # Auto-discovers solutions or uses .env defaults
./build.sh list-solutions # Shows all available solutions in Grafo/Repo/Cloned/
```

**Dynamic Output Directory:**
- When `USE_REPO_NAME_IN_OUTPUT=true`, output goes to `./{REPO_NAME}_GraphFiles/`
- Example: Selecting repo "ICB7C" creates output in `./ICB7C_GraphFiles/`
- When `false`, uses `DEFAULT_OUTPUT_DIR` value

**Auto-Discovery Behavior:**
- If `DEFAULT_SOLUTION_PATH` is configured and exists → uses it directly
- If `DEFAULT_SOLUTION_PATH` is empty/missing → auto-discovers from `Grafo/Repo/Cloned/`
- **Two-step selection process:**
  1. **Repository Selection**: Choose from available repositories in `Grafo/Repo/Cloned/`
  2. **Solution Selection**: Choose from `.sln` files within the selected repository
- If only one repository found → selects it automatically  
- If only one solution found in repository → uses it automatically

### Command Line Options

| Option | Short | Description |
|--------|-------|-------------|
| `--solution` | `-s` | Path to the solution file |
| `--output` | `-o` | Output file path |
| `--graph` | `-g` | Generate graph output file |
| `--verbose` | `-v` | Verbose output |
| `--config` | `-c` | Configuration file path |
| `--batch-config` | | Batch processing configuration file |
| `--filter-types` | | Filter symbol types (comma-separated) |
| `--stats-csv` | | Output statistics to CSV file |
| `--output-format` | | Output format (json, xml, csv) |
| `--exclude-projects` | | Exclude projects (regex patterns) |
| `--include-only` | | Include only these projects (regex patterns) |
| `--progress` | | Show progress indicator |

### Batch Configuration

#### YAML Format

```yaml
outputDirectory: "./output"
generateGraphs: true
generateStatistics: true
filterTypes:
  - "Class"
  - "Interface"
  - "Method"
excludeProjects:
  - ".*\\.Tests$"
  - ".*\\.Test$"
solutions:
  - solutionPath: "./solution1.sln"
    outputPrefix: "project1"
    enabled: true
  - solutionPath: "./solution2.sln"
    outputPrefix: "project2"
    enabled: true
```

#### JSON Format

```json
{
  "outputDirectory": "./output",
  "generateGraphs": true,
  "generateStatistics": true,
  "filterTypes": ["Class", "Interface", "Method"],
  "excludeProjects": [".*\\.Tests$", ".*\\.Test$"],
  "solutions": [
    {
      "solutionPath": "./solution1.sln",
      "outputPrefix": "project1",
      "enabled": true
    }
  ]
}
```

## Output Formats

### Symbol Index (JSON)

```json
{
  "generatedAt": "2024-01-01T12:00:00Z",
  "solutionPath": "/path/to/solution.sln",
  "symbols": [
    {
      "name": "MyClass",
      "fullName": "MyNamespace.MyClass",
      "type": "Class",
      "project": "MyProject",
      "file": "/path/to/file.cs",
      "line": 10,
      "column": 5,
      "accessibility": "Public",
      "modifiers": ["abstract"],
      "attributes": ["Serializable"],
      "signature": "public abstract class MyClass"
    }
  ],
  "statistics": {
    "TotalSymbols": 1000,
    "Classes": 100,
    "Interfaces": 50,
    "Methods": 600
  }
}
```

### Graph Structure (JSON)

```json
{
  "metadata": {
    "generatedAt": "2024-01-01T12:00:00Z",
    "solutionPath": "/path/to/solution.sln",
    "toolVersion": "1.0.0"
  },
  "nodes": [
    {
      "id": "solution:root",
      "name": "MySolution",
      "type": "Solution",
      "attributes": {
        "importance": 10,
        "size": 40,
        "color": "#1F2937"
      }
    }
  ],
  "edges": [
    {
      "id": "solution-contains-layer:presentation",
      "source": "solution:root",
      "target": "layer:presentation",
      "relationship": "contains"
    }
  ],
  "statistics": {
    "totalNodes": 150,
    "totalEdges": 200,
    "layerCount": 5,
    "projectCount": 8
  }
}
```

## Architectural Layers

The tool automatically detects and categorizes projects into architectural layers:

- **Presentation Layer**: Web, API, MVC, UI projects
- **Services Layer**: Service, Application projects
- **Business Layer**: Business, Domain, Core, Logic projects
- **Data Layer**: Data, Repository, Persistence, Database projects
- **Infrastructure Layer**: Infrastructure, Common, Shared, Framework projects
- **Test Layer**: Test, Spec, Unit, Integration projects

## Graph Relationships

With semantic model analysis, the graph now includes precise relationships:

### Structural Relationships
- `contains`: Hierarchical containment (Solution → Layer → Project → File → Component)
- `depends-on`: Layer dependencies

### Code Relationships (Semantic Model)
- `Calls`: Method invocations (resolved with semantic model)
- `Uses`: Type usage (field types, object creation)
- `Inherits`: Class inheritance (accurate hierarchy)
- `Implements`: Interface implementations (precise resolution)
- `project_reference`: Project dependencies from .csproj files

### Relationship Colors
- **Inherits**: Purple (`#9333EA`) - solid line
- **Implements**: Green (`#10B981`) - dashed line
- **Calls**: Red (`#FF6B6B`) - dashed line
- **Uses**: Cyan (`#4ECDC4`) - dotted line
- **project_reference**: Green (`#059669`) - solid line

## Integration with Guru Ecosystem

This tool is part of the Guru project ecosystem and can be integrated with other Guru services:

1. **Build Integration**: Use in CI/CD pipelines to analyze code changes
2. **Documentation**: Generate architecture documentation
3. **Quality Gates**: Implement code quality checks based on metrics
4. **Dependency Analysis**: Identify architectural violations

## Development

### Building

```bash
./build.sh build
```

### Testing

```bash
./build.sh test
```

### Repository-based Analysis Workflow

```bash
# 1. Clone repositories using grafo-cli
cd ../..  # Go to project root
npm run repo:clone  # or: node src/cli.js repo clone -u <repo-url>

# 2. Return to indexer and list available solutions
cd Grafo/Indexer
./build.sh list-solutions

# 3. Run analysis (auto-discovers from Grafo/Repo/Cloned/)
./build.sh analyze
```

### Analysis with Defaults

```bash
# Setup environment first (optional)
cp .env.example .env
# Edit .env to set DEFAULT_SOLUTION_PATH if desired

# Run analysis (uses auto-discovery if no default configured)
./build.sh analyze
```

### Quick Test

```bash
./build.sh quick-test
```

### Docker Development

```bash
./build.sh docker-build
./build.sh docker-run --volume-src /path/to/code --volume-out /path/to/output -- -s /input/solution.sln -o /output/result.json -v
```

## Performance Considerations

- **Large Solutions**: Use filtering options to reduce analysis scope
- **Memory Usage**: Monitor memory usage with very large codebases
- **Progress Reporting**: Use `--progress` for long-running analyses
- **Batch Processing**: Process multiple solutions efficiently with batch configuration

## Troubleshooting

### Common Issues

1. **Solution Not Found**: Ensure the solution path is correct and accessible
2. **Permission Errors**: Check file system permissions for input/output directories
3. **Memory Issues**: Use filtering options for large codebases
4. **Docker Volume Issues**: Ensure proper volume mapping and permissions

### Debug Mode

Use verbose mode (`-v`) to get detailed output for troubleshooting:

```bash
./RoslynIndexer -s solution.sln -o output.json -v
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run `./build.sh all` to verify everything works
6. Submit a pull request

## License

This project is part of the Guru ecosystem. See the main project license for details.

## Changelog

### Version 1.0.0
- Initial release
- MSBuild-free analysis
- Architectural graph generation
- Multiple output formats
- Batch processing support
- Docker support
