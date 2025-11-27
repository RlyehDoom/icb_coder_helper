# Grafo

C# code analysis system using Roslyn semantic analysis. Creates knowledge graphs for AI-powered IDE integration via Model Context Protocol (MCP).

## Features

- **Roslyn Semantic Analysis** - Deep code analysis using Microsoft Roslyn
- **Versioned Collections** - Each code version in separate MongoDB collection (`nodes_6_5_0`, `nodes_7_10_2`)
- **Semantic IDs** - Human-readable node IDs: `grafo:method/Project/ClassName.Method`
- **MCP Server** - HTTP/SSE for Cursor/VS Code integration
- **Incremental Processing** - Only processes changed code

## Quick Start

### Prerequisites

- Docker Desktop (running)
- Node.js 18+
- .NET 8.0 SDK

### Installation

```bash
git clone https://github.com/RlyehDoom/icb_coder_helper.git
cd Grafo
npm install && npm link
```

### Start Services

```bash
grafo mongodb start
grafo mcp build
grafo mcp start
```

### Index Code

```bash
# Analyze solution
cd Indexer
dotnet run -- --solution "path/to/solution.sln"

# Store in MongoDB (select directory and version)
cd ../IndexerDb
dotnet run --all
```

### Configure IDE

Add to Cursor config (`~/.cursor/mcp.json` or `%APPDATA%\Cursor\User\mcp.json`):

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

## Architecture

```
C# Solution → Indexer → NDJSON → IndexerDb → MongoDB → MCP Server → IDE
                        (graph)              (nodes_X_Y_Z)
```

## CLI Commands

```bash
# MongoDB
grafo mongodb start|stop|status|logs|shell

# MCP Server
grafo mcp build|start|stop|status|logs
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_code` | Search by name, layer, project |
| `get_code_context` | Get element with relationships |
| `list_projects` | List indexed projects |
| `find_implementations` | Find interface implementations |
| `get_statistics` | Graph statistics |

### Search Parameters

```
query      - Element name (e.g., "InsertMessage")
node_type  - Method, Class, Interface
class_name - Containing class (e.g., "Communication")
layer      - BusinessComponents, DataAccess, ServiceAgents, etc.
project    - Full project name (e.g., "BackOffice.DataAccess")
```

## MongoDB Schema (v2.1)

### Collections

Each version has its own collection: `nodes_{version}` (e.g., `nodes_6_5_0`)

### Node Document

```json
{
  "_id": "grafo:method/BackOffice.DataAccess/Communication.InsertMessage",
  "@type": "grafo:Method",
  "name": "InsertMessage",
  "fullName": "Infocorp.BackOffice.DataAccess.Communication.InsertMessage",
  "kind": "method",
  "project": "BackOffice.DataAccess",
  "namespace": "Infocorp.BackOffice.DataAccess",
  "layer": "DataAccess",
  "source": { "file": "/src/DataAccess/Communication.cs", "range": { "start": 45 } },
  "containedIn": "grafo:class/BackOffice.DataAccess/Communication",
  "calls": ["grafo:method/...", ...],
  "implements": ["grafo:interface/..."],
  "uses": ["grafo:class/..."]
}
```

## REST API (v2.1)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/versions` | List versions |
| `GET /v1/nodes/{version}/search?q=...` | Search nodes |
| `GET /v1/nodes/{version}/id/{id}` | Get by ID |
| `GET /v1/graph/{version}/callers/{id}` | Find callers |
| `GET /v1/graph/{version}/callees/{id}` | Find callees |
| `GET /v1/graph/{version}/implementations/{id}` | Find implementations |
| `GET /v1/graph/{version}/inheritance/{id}` | Inheritance chain |

## Project Structure

```
Grafo/
├── Indexer/      # C# Roslyn analyzer → NDJSON
├── IndexerDb/    # NDJSON → MongoDB (versioned collections)
├── Query/        # Python FastAPI + MCP Server
└── src/          # Node.js CLI
```

## Tech Stack

- **Indexer**: .NET 8, Roslyn 4.8
- **IndexerDb**: .NET 8, MongoDB.Driver
- **MCP Server**: Python 3.11, FastAPI, Motor
- **CLI**: Node.js, Commander.js
- **Database**: MongoDB 8.0

## Ports

| Service | Port |
|---------|------|
| MongoDB | 27019 |
| MCP Server | 8082 |

## License

MIT
