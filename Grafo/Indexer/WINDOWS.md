# Windows Usage Instructions

This project uses bash scripts for cross-platform compatibility. Here are the different ways to run the build script on Windows:

## Option 1: PowerShell with Bash (Recommended)

If you have Git for Windows or WSL installed, you can run bash directly from PowerShell:

```powershell
# Navigate to the project directory
cd Grafo\Indexer

# Run the build script
bash build.sh help
bash build.sh build
bash build.sh test
```

## Option 2: Git Bash

If you have Git for Windows installed, you can use Git Bash:

1. Right-click in the `Grafo/Indexer` directory
2. Select "Git Bash Here"
3. Run the script:

```bash
./build.sh help
./build.sh build
./build.sh test
```

## Option 3: WSL (Windows Subsystem for Linux)

If you have WSL installed:

```bash
# Navigate to your project (adjust path as needed)
cd /mnt/c/GIT/Guru/Grafo/Indexer

# Run the script
./build.sh help
./build.sh build
./build.sh test
```

## Option 4: PowerShell Direct Execution

PowerShell can execute bash scripts directly if bash is in your PATH:

```powershell
.\build.sh help
.\build.sh build
.\build.sh test
```

## Common Commands

All the following commands work with any of the above methods:

### Build and Development
```bash
./build.sh build          # Build the application
./build.sh clean          # Clean build artifacts
./build.sh test           # Run tests
./build.sh dev-setup      # Setup development environment
```

### Environment Configuration
```bash
# Copy example configuration
cp .env.example .env

# Edit configuration (use your preferred editor)
notepad .env              # Windows Notepad
code .env                 # VS Code
vim .env                  # If you have vim installed
```

**Key Configuration Options:**
- `USE_REPO_NAME_IN_OUTPUT=true` - Creates output in `{REPO_NAME}_GraphFiles/` directory
- `DEFAULT_OUTPUT_DIR=./analysis-output` - Base output directory (when not using repo name)
- `VERBOSE_MODE=true` - Enable detailed output
- `GENERATE_GRAPHS=true` - Generate architectural graphs
- `GENERATE_STATISTICS=true` - Generate CSV statistics

### Analysis Commands
```bash
./build.sh analyze        # Auto-discover repos and solutions
./build.sh list-solutions # Show all available solutions

# Example output directory for ICB7C repo:
# ./ICB7C_GraphFiles/Infocorp.Banking-symbols.json
# ./ICB7C_GraphFiles/Infocorp.Banking-graph.json
# ./ICB7C_GraphFiles/Infocorp.Banking-stats.csv
```

### Running the Application
```bash
./build.sh run -s ../solution.sln -o output.json -v
```

### Docker Commands
```bash
./build.sh docker-build
./build.sh docker-run --volume-src /path/to/code --volume-out /path/to/output -- -s /input/solution.sln -o /output/result.json
```

### Package and Release
```bash
./build.sh package        # Create release package
./build.sh all           # Build, test, and package everything
```

## Troubleshooting

### "bash: command not found"

Install one of the following:
- **Git for Windows**: [https://git-scm.com/download/win](https://git-scm.com/download/win)
- **WSL**: Run `wsl --install` in an elevated PowerShell
- **MSYS2**: [https://www.msys2.org/](https://www.msys2.org/)

### Permission Issues

If you get permission errors, you might need to run:
```powershell
# In PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy Unrestricted -Scope CurrentUser
```

### Path Issues

If the script can't find dotnet or docker, make sure they're in your PATH:
```powershell
# Check if dotnet is available
dotnet --version

# Check if docker is available  
docker --version
```

### Line Ending Issues

If you get `^M` characters or "command not found" errors, convert line endings:
```bash
# In Git Bash or WSL
dos2unix build.sh
```

## Development Tips

1. **Use Git Bash** for the most consistent experience
2. **Configure your editor** to use LF line endings for `.sh` files
3. **Keep paths relative** when possible to avoid Windows/Unix path conflicts
4. **Use forward slashes** in paths when calling the script
