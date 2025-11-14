# Instalación - Grafo CLI

## 🚀 Instalación Automática

```bash
cd Grafo
./scripts/setup.sh
node src/cli.js status
```

## 📋 Prerequisitos

Antes de instalar, verifica que tienes:

```bash
node --version    # >= 16.x
dotnet --version  # >= 8.0
git --version     # cualquier versión
```

### Windows
- Instala **Git for Windows** (incluye Git Bash automáticamente)
- Descarga: https://git-scm.com/download/win

## 🎯 Comandos Esenciales

### Primer Uso
```bash
# Configurar todo el entorno (automático)
./scripts/setup.sh

# Ver estado del sistema
node src/cli.js status

# Modo interactivo (recomendado)
node src/cli.js interactive
```

### Análisis de Código
```bash
# Compilar RoslynIndexer
node src/cli.js indexer build

# Analizar una solución
node src/cli.js indexer analyze -s ./path/to/solution.sln -v
```

### Gestión de Repositorios
```bash
# Listar repositorios disponibles
node src/cli.js repo list

# Clonar repositorio
node src/cli.js repo clone -u https://dev.azure.com/org/project/_git/repo
```

### Testing
```bash
# Configurar testing
node src/cli.js test setup

# Ejecutar análisis completo
node src/cli.js test run
```

## 🛠️ Instalación Global (Opcional)

```bash
./scripts/install.sh
grafo status  # Usar desde cualquier directorio
```

## 🔧 Configuración

```bash
# Para repositorios privados de Azure DevOps
export AZURE_DEVOPS_PAT="your-token"
```

## 🚨 Problemas Comunes

```bash
# Prerequisitos faltantes
dotnet --version  # Instalar .NET 8.0 SDK
node --version    # Instalar Node.js >= 16.x
git --version     # Instalar Git

# Windows: scripts no ejecutables
# Instalar Git for Windows (incluye Git Bash)

# Permisos en Linux/macOS
chmod +x scripts/*.sh

# Reiniciar instalación
./scripts/clean.sh && ./scripts/setup.sh
```

---

¡Listo! Usa `node src/cli.js interactive` para empezar.
