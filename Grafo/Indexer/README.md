# RoslynIndexer

C# code analyzer using Microsoft Roslyn semantic analysis. Generates NDJSON-LD graph files for processing by IndexerDb.

## Features

- **Roslyn Semantic Model** - Full semantic analysis (interfaces, inheritance, polymorphic calls)
- **MSBuild-Free** - Analyzes solutions without MSBuild infrastructure
- **NDJSON-LD Output** - Streaming format for efficient processing
- **Unity/DI Support** - Tracks calls through interface abstractions (`callsVia`, `indirectCall`)

## Quick Start

```bash
cd Grafo/Indexer
dotnet build

# Interactive mode (auto-discovers solutions)
dotnet run

# Direct analysis
dotnet run -- --solution "path/to/solution.sln"
```

## Output

Generates NDJSON-LD files in `output/{RepoName}_GraphFiles/`:

| File | Description |
|------|-------------|
| `{solution}-graph.ndjson` | Full graph with nodes and relationships |
| `{solution}-graph-structural.ndjson` | Structure only (Solution/Layer/Project/File) |
| `context.jsonld` | JSON-LD context definition |

### NDJSON-LD Format

One JSON document per line:
```jsonl
{"@id":"grafo:cls/a1b2c3d4","@type":"grafo:Class","name":"OrderService","calls":["grafo:mtd/b2c3d4e5"]}
{"@id":"grafo:mtd/b2c3d4e5","@type":"grafo:Method","name":"CreateOrder","containedIn":"grafo:cls/a1b2c3d4"}
```

### ID Format

`grafo:{type}/{hash8}` where type is:
- `sln` (Solution), `lyr` (Layer), `prj` (Project), `file` (File)
- `cls` (Class), `ifc` (Interface), `mtd` (Method)

## Relationships

| Relationship | Description |
|--------------|-------------|
| `calls` | Direct method invocations |
| `callsVia` | Calls through interface (DI pattern) |
| `indirectCall` | Possible runtime call to implementation |
| `implements` | Interface implementations |
| `inherits` | Class inheritance |
| `uses` | Type usage |
| `contains` / `containedIn` | Hierarchical containment |

## Configuration

### Environment Variables (.env)

```bash
DEFAULT_OUTPUT_DIR=./output
USE_REPO_NAME_IN_OUTPUT=true
VERBOSE_MODE=false
FILTER_SYMBOL_TYPES=Class,Interface,Method
EXCLUDE_PROJECTS_REGEX=.*\.Tests$
```

### Command Line Options

| Option | Description |
|--------|-------------|
| `-s, --solution` | Solution file path |
| `-o, --output` | Output directory |
| `-v, --verbose` | Verbose output |
| `--filter-types` | Symbol types to include |
| `--exclude-projects` | Exclude projects (regex) |

## Workflow

1. **Analyze** solution with Indexer → generates NDJSON
2. **Process** NDJSON with IndexerDb → stores in MongoDB
3. **Query** via MCP Server

```bash
# Step 1: Analyze
cd Indexer && dotnet run -- -s solution.sln

# Step 2: Store (select directory and version)
cd ../IndexerDb && dotnet run --all
```

## Architectural Layers

Automatically detected:
- **Presentation**: Web, API, MVC, UI
- **Services**: Service, Application
- **Business**: Business, Domain, Core
- **Data**: Data, Repository, Persistence
- **Infrastructure**: Infrastructure, Common, Shared
- **Test**: Test, Spec, Unit

## Docker

```bash
# Build
docker build -t roslyn-indexer .

# Run
docker run -v /path/to/code:/input -v /path/to/output:/output \
  roslyn-indexer -s /input/solution.sln -o /output/
```

## License

MIT
