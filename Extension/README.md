# Grafo Code Explorer

VS Code / Cursor extension for exploring C# code relationships using the Grafo knowledge graph.

## Features

### Hover Information
Hover over methods, classes, or interfaces to see:
- Type information and modifiers
- Parameters and return types
- Inheritance and implementations
- Related elements summary

### CodeLens
Inline annotations showing:
- Number of callers
- Methods called
- Implementation count
- Inheritance relationships

### Tree Views
Sidebar panels:
- **Relations View**: Browse relationships for selected element
- **Hierarchy View**: Class inheritance hierarchy
- **Statistics View**: Graph statistics

### Commands
- `Grafo: Show Relations` - Display relationships
- `Grafo: Find Implementations` - Find interface implementations
- `Grafo: Show Inheritance Hierarchy` - Display hierarchy
- `Grafo: Show Who Calls This` - Find callers
- `Grafo: Show What This Calls` - Find callees
- `Grafo: Search Code Elements` - Search graph
- `Grafo: Check API Connection` - Verify connectivity

## Requirements

- Grafo Query Service running (default: http://localhost:8081)
- Code indexed using Grafo Indexer

## Installation

### From VSIX

```bash
# VS Code
code --install-extension dist/grafo-code-explorer-0.1.0.vsix

# Cursor
cursor --install-extension dist/grafo-code-explorer-0.1.0.vsix
```

### Build from Source

```bash
cd Extension
npm install
npm run compile
npm run package
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `grafo.apiUrl` | Grafo Query Service URL | `http://localhost:8081` |
| `grafo.graphVersion` | Graph version (e.g., `6.5.0`) | `""` |
| `grafo.enableHover` | Enable hover info | `true` |
| `grafo.enableCodeLens` | Enable CodeLens | `true` |
| `grafo.enableTreeView` | Enable tree views | `true` |
| `grafo.maxRelatedItems` | Max related items | `20` |

## Usage

1. Start Grafo services:
   ```bash
   grafo mcp start
   ```

2. Open a C# file

3. Hover over methods/classes for info

4. Right-click for context menu

5. Use Grafo Explorer sidebar panel

## API v2.1 Endpoints

The extension uses versioned REST endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /v1/versions` | List available versions |
| `GET /v1/nodes/{version}/search` | Search nodes |
| `GET /v1/nodes/{version}/id/{id}` | Get node by ID |
| `GET /v1/graph/{version}/callers/{id}` | Find callers |
| `GET /v1/graph/{version}/callees/{id}` | Find callees |
| `GET /v1/graph/{version}/implementations/{id}` | Find implementations |
| `GET /v1/graph/{version}/inheritance/{id}` | Inheritance chain |
| `GET /v1/stats/{version}` | Statistics |

### Node ID Format

Semantic IDs: `grafo:{kind}/{project}/{identifier}`

Examples:
- `grafo:class/BackOffice.BusinessComponents/Communication`
- `grafo:method/BackOffice.DataAccess/InsertBackOfficeMessage`

## Project Structure

```
Extension/
├── src/
│   ├── api/grafoClient.ts     # API client (v2.1)
│   ├── providers/
│   │   ├── hoverProvider.ts
│   │   └── codeLensProvider.ts
│   ├── views/relationsTreeView.ts
│   ├── types.ts               # TypeScript interfaces
│   └── extension.ts           # Entry point
├── package.json
└── tsconfig.json
```

## Author

**Jose Luis Yanez Rojas**
[joseluisyr.com](https://joseluisyr.com) | [@RlyehDoom](https://github.com/RlyehDoom)

## License

MIT
