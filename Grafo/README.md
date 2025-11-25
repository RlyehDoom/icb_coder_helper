# Grafo

A comprehensive C# code analysis system that creates knowledge graphs from codebases using Roslyn semantic analysis. Enables contextual code assistance through the Model Context Protocol (MCP) for integration with AI-powered IDEs like Cursor and VS Code.

## Features

- **Roslyn Semantic Analysis** - Deep code analysis using Microsoft Roslyn compiler platform
- **Knowledge Graph** - Extracts classes, methods, interfaces, inheritance, and call relationships
- **MCP Server** - HTTP/SSE server for IDE integration (supports multiple concurrent clients)
- **Incremental Processing** - Only processes changed code using SHA-256 hashing
- **Docker Ready** - All services run in containers with zero configuration

## Quick Start

### Prerequisites

- **Docker Desktop** - Running
- **Node.js 18+** - For CLI
- **.NET 8.0 SDK** - For indexing C# code

### Installation

```bash
git clone https://github.com/your-username/grafo.git
cd Grafo
npm install
npm link  # Makes 'grafo' command available globally
```

### Start Services

```bash
# Start MongoDB
grafo mongodb start

# Build and start MCP Server
grafo mcp build
grafo mcp start
```

### Index Your Code

```bash
# Analyze a C# solution
cd Indexer
dotnet run -- --solution "path/to/your/solution.sln"

# Store in MongoDB
cd ../IndexerDb
dotnet run --all
```

### Configure IDE

Add to `~/.cursor/mcp.json` (macOS/Linux) or `%APPDATA%\Cursor\User\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "grafo": {
      "url": "http://localhost:8082/sse",
      "transport": "sse"
    }
  }
}
```

Restart your IDE. You can now query your codebase from the AI chat.

## Architecture

```
C# Source Code (.sln)
        │
        ▼
┌───────────────────┐
│     Indexer       │  Roslyn semantic analysis
│    (.NET 8)       │  Generates JSON graph
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│    IndexerDb      │  Processes JSON graphs
│    (.NET 8)       │  Stores in MongoDB
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│     MongoDB       │  Graph database
│    (Docker)       │  Port: 27019
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   MCP Server      │  HTTP/SSE API
│   (Python)        │  Port: 8082
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   Cursor/VSCode   │  AI-powered IDE
└───────────────────┘
```

## CLI Commands

### MongoDB

```bash
grafo mongodb start      # Start MongoDB container
grafo mongodb stop       # Stop MongoDB
grafo mongodb status     # Check status
grafo mongodb logs       # View logs
grafo mongodb shell      # Open mongo shell
```

### MCP Server

```bash
grafo mcp build          # Build Docker image
grafo mcp start          # Start server
grafo mcp stop           # Stop server
grafo mcp status         # Check status and show config
grafo mcp logs           # View logs
```

## MCP Tools

The MCP server exposes these tools to your IDE:

| Tool | Description |
|------|-------------|
| `search_code` | Search for classes, methods, interfaces |
| `get_code_context` | Get detailed context with relationships |
| `list_projects` | List all indexed projects |
| `get_project_structure` | Get project structure |
| `find_implementations` | Find interface implementations |
| `analyze_impact` | Analyze change impact |
| `get_statistics` | Get graph statistics |

## Configuration

### Version Filtering

Specify a graph version in the MCP URL to query specific code versions:

```json
{
  "mcpServers": {
    "grafo-v7": {
      "url": "http://localhost:8082/sse?version=7.10.2",
      "transport": "sse"
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GRAFO_DEFAULT_VERSION` | Default graph version | (none) |
| `MONGODB_DATABASE` | Database name | `GraphDB` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Endpoints

| Service | Port | URL |
|---------|------|-----|
| MongoDB | 27019 | `mongodb://localhost:27019/` |
| MCP Server | 8082 | `http://localhost:8082/sse` |
| Health Check | 8082 | `http://localhost:8082/health` |

## Tech Stack

- **Indexer**: .NET 8, Roslyn 4.8
- **IndexerDb**: .NET 8, MongoDB.Driver
- **MCP Server**: Python 3.11, FastAPI, Motor
- **CLI**: Node.js, Commander.js
- **Database**: MongoDB 8.0
- **Containers**: Docker & Docker Compose

## Development

### Project Structure

```
Grafo/
├── Indexer/          # C# code analyzer (Roslyn)
├── IndexerDb/        # Graph processor & MongoDB storage
├── Query/            # MCP Server (Python/FastAPI)
├── src/              # CLI source code
├── docker-compose.yml
└── package.json
```

### Building Components

```bash
# Build Indexer
cd Indexer && dotnet build

# Build IndexerDb
cd IndexerDb && dotnet build

# Build MCP Server
grafo mcp build
```

### Running Tests

```bash
# Indexer tests
cd Indexer && dotnet test

# MCP Server tests
grafo mcp test
```

## Troubleshooting

### MongoDB won't start

```bash
docker --version        # Verify Docker is installed
docker info             # Verify Docker is running
grafo mongodb logs      # Check error logs
```

### MCP Server not connecting

```bash
grafo mcp status        # Check if running
curl http://localhost:8082/health  # Test endpoint
```

### No data returned

```bash
# Verify data exists
cd IndexerDb
dotnet run --interactive
> count
> projects list
```

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -m 'Add new feature'`
4. Push: `git push origin feature/new-feature`
5. Open a Pull Request
