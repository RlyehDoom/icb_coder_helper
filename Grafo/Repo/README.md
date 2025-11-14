# Gestión de Repositorios

Clonado y gestión de repositorios **Azure DevOps** y **GitHub** para análisis con Grafo.

## 🚀 Uso

### Con la CLI (Recomendado)
```bash
# Desde /Grafo
node src/cli.js repo clone -u <URL>
node src/cli.js repo list
node src/cli.js repo status
```

### Script Directo  
```bash
# Desde /Grafo/Repo
./clone-repo.sh -u <URL>
./clone-repo.sh --help
```

## 🔧 Características

- **Sparse Checkout**: Solo las carpetas necesarias
- **Autenticación**: Personal Access Tokens
- **Detección `.sln`**: Encuentra soluciones automáticamente
- **Cross-Platform**: Windows, Linux, macOS

## 📋 Ejemplos

```bash
# Azure DevOps
node src/cli.js repo clone -u https://dev.azure.com/org/project/_git/repo

# GitHub
node src/cli.js repo clone -u https://github.com/owner/repo.git

# Con sparse checkout (repos grandes)
node src/cli.js repo clone -u <URL> -s "src,docs"

# Con autenticación (detecta automáticamente la plataforma)
export AZURE_DEVOPS_PAT="azure-token"
export GITHUB_TOKEN="github-token" 
node src/cli.js repo clone -u <URL>

# Workflow completo
node src/cli.js all setup
node src/cli.js repo clone -u <URL>
node src/cli.js test run --verbose
```

## 🔧 Configuración

### Archivo .env (Recomendado)
```bash
# Crear configuración personalizada
cp .env.example .env

# Editar con tus valores
# AZURE_DEVOPS_PAT="your-azure-token"
# GITHUB_TOKEN="your-github-token"
# GRAFO_DEFAULT_REPO_URL="https://dev.azure.com/org/project/_git/repo"  # URL por defecto
# GRAFO_DEFAULT_BRANCH="develop" 
# GRAFO_DEFAULT_SPARSE="src,docs"

# Con .env configurado, puedes usar modo interactivo sin parámetros
node ../src/cli.js interactive
# Selecciona "Repository" > "Clone" y los valores se cargarán automáticamente

# O usar simplificado (detecta plataforma automáticamente)
./clone-repo.sh -u <AZURE_OR_GITHUB_URL>
```

### Variables de Entorno (Alternativa)
```bash
export AZURE_DEVOPS_PAT="your-azure-token"
export GITHUB_TOKEN="your-github-token"
```

**Crear Tokens:**
- **Azure DevOps:** User Settings → Personal Access Tokens → Code (Read)
- **GitHub:** Settings → Developer settings → Personal access tokens → repo

## 🛡️ Problemas Comunes

```bash
# Verificar autenticación
echo $AZURE_DEVOPS_PAT

# Limpiar espacio
node src/cli.js repo clean

# Usar sparse checkout para repos grandes
node src/cli.js repo clone -u <URL> -s "src,docs"
```

---

Ver [README-clone.md](./README-clone.md) para detalles del script de clonado.
