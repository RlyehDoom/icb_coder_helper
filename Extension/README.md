# Grafo Code Explorer

VS Code / Cursor extension for exploring C# code relationships using the Grafo knowledge graph.

## Features

### Hover Information
Hover over methods, classes, or interfaces to see:
- Type information and modifiers
- Parameters and return types (for methods)
- Inheritance and implementations
- Related elements summary

### CodeLens
Inline annotations above code elements showing:
- Number of callers
- Methods called
- Implementations count
- Inheritance relationships

### Tree Views
Sidebar panels providing:
- **Relations View**: Browse all relationships for the selected element
- **Hierarchy View**: Visualize class inheritance hierarchy
- **Statistics View**: Graph statistics overview

### Commands
- `Grafo: Show Relations` - Display relationships for selected element
- `Grafo: Find Implementations` - Find all implementations of an interface
- `Grafo: Show Inheritance Hierarchy` - Display class hierarchy
- `Grafo: Show Who Calls This` - Find all callers of a method
- `Grafo: Show What This Calls` - Find all methods called by this method
- `Grafo: Search Code Elements` - Search the code graph
- `Grafo: Check API Connection` - Verify API connectivity

## Requirements

- Grafo Query Service running (default: http://localhost:8081)
- Code indexed using Grafo Indexer

## Installation

### Option 1: Install from VSIX (Recommended)

Download or build the VSIX file, then install it:

**VS Code - Command Line:**
```bash
code --install-extension grafo-code-explorer-0.1.0.vsix
```

**Cursor - Command Line:**
```bash
cursor --install-extension grafo-code-explorer-0.1.0.vsix
```

**VS Code / Cursor - GUI:**
1. Open VS Code or Cursor
2. Press `Ctrl+Shift+X` to open Extensions
3. Click the `...` menu (top right of Extensions panel)
4. Select **"Install from VSIX..."**
5. Browse to the `.vsix` file and select it
6. Reload the editor when prompted

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/RlyehDoom/icb_coder_helper.git
cd icb_coder_helper/Extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package as VSIX
npm run package

# Install the generated VSIX
code --install-extension grafo-code-explorer-0.1.0.vsix
# or for Cursor:
cursor --install-extension grafo-code-explorer-0.1.0.vsix
```

### Option 3: Development Mode

For development with hot-reload:

```bash
cd Extension
npm install
npm run watch
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `grafo.apiUrl` | URL of Grafo Query Service | `http://localhost:8081` |
| `grafo.graphVersion` | Graph version to query | `""` (all versions) |
| `grafo.enableHover` | Enable hover information | `true` |
| `grafo.enableCodeLens` | Enable CodeLens annotations | `true` |
| `grafo.enableTreeView` | Enable tree view panels | `true` |
| `grafo.maxRelatedItems` | Maximum related items to show | `20` |

## Usage

1. Start the Grafo Query Service:
   ```bash
   grafo mcp start
   ```

2. Open a C# file in VS Code / Cursor

3. Hover over methods or classes to see information

4. Right-click for context menu commands

5. Use the Grafo Explorer panel in the sidebar

## Project Structure

```
Extension/
├── src/
│   ├── api/
│   │   └── grafoClient.ts    # API client for Grafo Query
│   ├── providers/
│   │   ├── hoverProvider.ts  # Hover information
│   │   └── codeLensProvider.ts
│   ├── views/
│   │   └── relationsTreeView.ts
│   ├── config.ts             # Configuration management
│   ├── types.ts              # TypeScript interfaces
│   └── extension.ts          # Main entry point
├── package.json
└── tsconfig.json
```

## API Integration

The extension consumes the Grafo Query REST API:

- `POST /api/context/code` - Get code context with relationships
- `POST /api/nodes/search` - Search for code elements
- `GET /api/classes/{id}/hierarchy` - Get class inheritance
- `GET /api/interfaces/{id}/implementations` - Find implementations
- `GET /api/context/statistics` - Graph statistics

## Author

**Jose Luis Yanez Rojas**
- Website: [joseluisyr.com](https://joseluisyr.com)
- GitHub: [@RlyehDoom](https://github.com/RlyehDoom)

## License

MIT
