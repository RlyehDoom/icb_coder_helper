# Universal Git Repository Cloner

Script shell universal para clonar repositorios de **Azure DevOps** y **GitHub** en la estructura `/Grafo/Repo/Cloned/<RepoName>`.

## Uso

```bash
# Desde la carpeta /Grafo/Repo
./clone-repo.sh -u <URL_DEL_REPOSITORIO> [OPCIONES]

# O usando la CLI de Grafo (recomendado)
cd ../
node src/cli.js repo clone -u <URL_DEL_REPOSITORIO> [OPCIONES]
```

### Opciones

- `-u, --url` - URL del repositorio (requerido)
- `-n, --name` - Nombre del repositorio (opcional, se extrae de la URL si no se provee)
- `-f, --folder` - Nombre personalizado de carpeta para el clonado (opcional, usa el nombre del repo si no se provee)
- `-s, --sparse` - Lista de carpetas separadas por comas para sparse checkout (opcional)
- `-b, --branch` - Rama a clonar (por defecto: main)
- `-t, --token` - Personal Access Token para autenticación (opcional)
- `-h, --help` - Mostrar ayuda

### Variables de Entorno

- `AZURE_DEVOPS_PAT` - Personal Access Token (alternativa a la opción -t)

## Ejemplos

### Usando la CLI de Grafo (Recomendado)

```bash
# Azure DevOps
node src/cli.js repo clone -u https://dev.azure.com/org/project/_git/repo
node src/cli.js repo clone -u https://dev.azure.com/org/project/_git/repo -f Custom -b develop

# GitHub  
node src/cli.js repo clone -u https://github.com/owner/repo.git
node src/cli.js repo clone -u git@github.com:owner/repo.git -s "src,docs"

# Con autenticación
node src/cli.js repo clone -u https://dev.azure.com/org/project/_git/repo -t $AZURE_DEVOPS_PAT
node src/cli.js repo clone -u https://github.com/owner/private-repo.git -t $GITHUB_TOKEN
```

### Uso Directo del Script

```bash
# Azure DevOps
./clone-repo.sh -u https://dev.azure.com/org/project/_git/repo
./clone-repo.sh -u https://org.visualstudio.com/project/_git/repo -b develop

# GitHub
./clone-repo.sh -u https://github.com/owner/repo.git  
./clone-repo.sh -u git@github.com:owner/repo.git -s "src,docs"

# Con autenticación
./clone-repo.sh -u https://dev.azure.com/org/project/_git/repo -t $AZURE_DEVOPS_PAT
./clone-repo.sh -u https://github.com/owner/private-repo.git -t $GITHUB_TOKEN
```

### Configuración con .env (Recomendado)

Crea un archivo `.env` en la carpeta `Repo/` con tus valores por defecto:

```bash
# Copiar plantilla
cp .env.example .env

# Editar con tus valores
nano .env  # O tu editor preferido
```

Contenido del archivo `.env`:
```bash
# Tokens para autenticación
AZURE_DEVOPS_PAT="your-azure-token-here"
GITHUB_TOKEN="your-github-token-here"

# Configuración por defecto
GRAFO_DEFAULT_BRANCH="develop"
GRAFO_DEFAULT_SPARSE="src,docs"
```

Con la configuración `.env`, puedes usar el script simplificado:
```bash
# Azure DevOps - usa automáticamente AZURE_DEVOPS_PAT
./clone-repo.sh -u https://dev.azure.com/org/project/_git/repo

# GitHub - usa automáticamente GITHUB_TOKEN  
./clone-repo.sh -u https://github.com/owner/repo.git

# El script detecta la plataforma y usa el token apropiado
# + rama por defecto + carpetas sparse del .env
```

### Variables de Entorno (Alternativa)
```bash
export AZURE_DEVOPS_PAT="your-personal-access-token-here"
export GRAFO_DEFAULT_BRANCH="develop"
# Luego usar cualquiera de los comandos
```

## Estructura Resultante

```
/Grafo/
  ├── Indexer/
  ├── Repo/
  │   ├── clone-repo.sh     # Este script
  │   ├── README-clone.md   # Esta documentación
  │   └── Cloned/
  │       └── ICB7/         # Repositorio clonado
  │           ├── src/
  │           ├── docs/
  │           └── ...
  └── src/                  # CLI de Grafo
```

## Sparse Checkout - Optimización para Repositorios Grandes

El **sparse checkout** permite clonar solo las carpetas específicas que necesitas, ideal para repositorios grandes (como el de 5GB). Beneficios:

- ⚡ **Clonado más rápido**: Solo descarga los archivos que necesitas
- 💾 **Menos espacio en disco**: Reduce significativamente el tamaño local
- 🎯 **Enfoque específico**: Trabaja solo con las partes relevantes del proyecto
- 🔄 **Mantenimiento más fácil**: Menos archivos que gestionar

### Cómo funciona

1. Clona el repositorio con `--filter=blob:none` (solo metadatos)
2. Configura sparse checkout en el repositorio local
3. Especifica las carpetas que quieres incluir
4. Descarga solo esos archivos

## Notas

- El script funciona desde la carpeta `/Grafo/Repo`
- Los repositorios se clonan en `/Grafo/Repo/Cloned/`
- Si el repositorio ya existe, ofrece opciones inteligentes: pull, reset, cancelar o re-clonar
- Compatible con la CLI unificada de Grafo
- Soporta URLs de Azure DevOps estándar
- El sparse checkout es especialmente útil para repositorios > 1GB

## Integración con Grafo CLI

Este script está integrado con la CLI de Grafo:

```bash
# Listar repositorios clonados
node src/cli.js repo list

# Ver estado de repositorios
node src/cli.js repo status

# Limpiar archivos temporales
node src/cli.js repo clean
```
