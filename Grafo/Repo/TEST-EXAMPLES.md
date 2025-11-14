# Test Examples - Universal Git Repository Cloner

Ejemplos de prueba para el script `clone-repo.sh` con soporte para Azure DevOps y GitHub.

## 🧪 Tests Rápidos

### Azure DevOps URLs
```bash
# Test detección de plataforma Azure DevOps
./clone-repo.sh -u https://dev.azure.com/microsoft/vscode/_git/vscode --help

# Test con URL antigua de Visual Studio
./clone-repo.sh -u https://microsoft.visualstudio.com/vscode/_git/vscode --help
```

### GitHub URLs
```bash
# Test detección de plataforma GitHub HTTPS
./clone-repo.sh -u https://github.com/microsoft/vscode.git --help

# Test con URL SSH de GitHub
./clone-repo.sh -u git@github.com:microsoft/vscode.git --help

# Test sin .git al final
./clone-repo.sh -u https://github.com/microsoft/vscode --help
```

## 🔧 Tests con .env

### Crear archivo .env de prueba
```bash
# Copiar ejemplo
cp .env.example .env

# Editar con tokens de prueba (NO REALES)
cat > .env << EOF
AZURE_DEVOPS_PAT="test-azure-token"
GITHUB_TOKEN="test-github-token"
GRAFO_DEFAULT_BRANCH="develop"
GRAFO_DEFAULT_SPARSE="src,docs"
EOF
```

### Probar con configuración .env
```bash
# Debería mostrar "Loading configuration from .env file..."
./clone-repo.sh -u https://github.com/owner/repo.git --help

# Debería usar rama "develop" por defecto
./clone-repo.sh -u https://dev.azure.com/org/project/_git/repo --help
```

## 🌐 Tests de Detección de Plataforma

### URLs que deberían detectarse como "github"
- `https://github.com/owner/repo.git`
- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git`
- `git@github.com:owner/repo`

### URLs que deberían detectarse como "azure"
- `https://dev.azure.com/org/project/_git/repo`
- `https://organization.visualstudio.com/project/_git/repo`
- `https://custom.azure.com/project/_git/repo`

### URLs que deberían detectarse como "unknown"
- `https://gitlab.com/owner/repo.git`
- `https://bitbucket.org/owner/repo.git`

## 🚀 Tests de Funcionalidad Completa

⚠️ **ADVERTENCIA**: Estos tests harán clonados reales. Úsalos con cuidado.

### Test con repositorio público de GitHub
```bash
./clone-repo.sh -u https://github.com/git/git.git -f git-test -s "Documentation" -b master
```

### Test con repositorio público de Azure DevOps (si está disponible)
```bash
# Nota: Muchos repos de Azure DevOps requieren autenticación
./clone-repo.sh -u https://dev.azure.com/dnceng/public/_git/dotnet-helix-machines -f dotnet-test
```

## 🧹 Limpiar después de las pruebas

```bash
# Eliminar repositorios de prueba
rm -rf git-test dotnet-test

# Eliminar archivo .env de prueba
rm -f .env
```

## ✅ Resultados Esperados

### Detección correcta de plataforma
El script debería mostrar:
```
🔍 Repository Information:
  Platform: github    # o "azure" o "unknown"
  URL: [la URL proporcionada]
  ...
```

### Autenticación automática
Con archivo .env configurado:
```
Loading configuration from .env file...
✓ Configuration loaded from .env
...
  Authentication: Using GitHub Token    # o "Using Azure DevOps PAT"
```

### Extracción correcta de nombres
- `https://github.com/owner/repo.git` → `repo`
- `https://dev.azure.com/org/project/_git/repository` → `repository`
- `git@github.com:owner/repo.git` → `repo`
