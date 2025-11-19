# Docker Hub Deployment

Guía para publicar las imágenes Docker de Grafo Query Service y MCP Server en Docker Hub.

## 📋 Configuración

La configuración de Docker Hub se encuentra en `Query/.env`:

```bash
# Docker Hub Configuration
DOCKER_REGISTRY=docker.io
DOCKER_USERNAME=rlyehdoom
DOCKER_PASSWORD=                    # Opcional - se solicitará si no está definido
DOCKER_REPO_QUERY=rlyehdoom/grafo-query
DOCKER_REPO_MCP=rlyehdoom/grafo-mcp
DOCKER_TAG=latest
```

### Variables de Configuración

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DOCKER_REGISTRY` | Registro de Docker (default: docker.io) | `docker.io` |
| `DOCKER_USERNAME` | Usuario de Docker Hub | `rlyehdoom` |
| `DOCKER_PASSWORD` | Contraseña (opcional - se solicitará interactivamente) | `mi_password` |
| `DOCKER_REPO_QUERY` | Repositorio para Query Service | `usuario/grafo-query` |
| `DOCKER_REPO_MCP` | Repositorio para MCP Server | `usuario/grafo-mcp` |
| `DOCKER_TAG` | Tag de la imagen | `latest`, `v1.0.0`, `prod` |

## 🚀 Publicar Imágenes

### Comando Único

El CLI de Grafo automatiza todo el proceso:

```bash
cd Grafo
grafo query push
```

### Flujo Automático

El comando ejecuta automáticamente los siguientes pasos:

1. **Lectura de Configuración**
   - Lee las variables de `Query/.env`
   - Verifica que existan todas las variables requeridas

2. **Autenticación**
   - Si `DOCKER_PASSWORD` no está en .env, solicita la contraseña interactivamente
   - Ejecuta `docker login` con las credenciales

3. **Construcción de Imágenes**
   - Construye imagen de Query Service
   - Construye imagen de MCP Server

4. **Etiquetado**
   - Etiqueta Query Service: `{DOCKER_REPO_QUERY}:{DOCKER_TAG}`
   - Etiqueta MCP Server: `{DOCKER_REPO_MCP}:{DOCKER_TAG}`

5. **Push a Docker Hub**
   - Sube Query Service al repositorio configurado
   - Sube MCP Server al repositorio configurado

6. **Logout Opcional**
   - Pregunta si deseas cerrar sesión de Docker Hub
   - Recomendado en máquinas compartidas

## 📝 Ejemplo de Uso

```bash
$ cd Grafo
$ grafo query push

╔══════════════════════════════════════════════════════╗
║                                                      ║
║   ██████╗ ██████╗  █████╗ ███████╗ ██████╗          ║
║  ██╔════╝ ██╔══██╗██╔══██╗██╔════╝██╔═══██╗         ║
║  ██║  ███╗██████╔╝███████║█████╗  ██║   ██║         ║
║  ██║   ██║██╔══██╗██╔══██║██╔══╝  ██║   ██║         ║
║  ╚██████╔╝██║  ██║██║  ██║██║     ╚██████╔╝         ║
║   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝          ║
║                                                      ║
║                GRAFO - Query Service                 ║
║      C# Code Analysis & Repository Management CLI   ║
╚══════════════════════════════════════════════════════╝

🔄 Preparando push a Docker Hub ...
ℹ️  Registry: docker.io
ℹ️  Usuario: rlyehdoom
ℹ️  Repositorio Query: rlyehdoom/grafo-query
ℹ️  Repositorio MCP: rlyehdoom/grafo-mcp
ℹ️  Tag: latest
? Ingresa la contraseña de Docker Hub para rlyehdoom: ****
✅ Sesión iniciada exitosamente
🔄 Construyendo imagen Query Service ...
✅ Query Service construido exitosamente
🔄 Construyendo imagen MCP Server ...
✅ MCP Server construido exitosamente
🔄 Etiquetando imágenes ...
✅ Imágenes etiquetadas exitosamente
🔄 Subiendo Query Service a rlyehdoom/grafo-query:latest ...
The push refers to repository [docker.io/rlyehdoom/grafo-query]
...
✅ Query Service subido exitosamente
🔄 Subiendo MCP Server a rlyehdoom/grafo-mcp:latest ...
The push refers to repository [docker.io/rlyehdoom/grafo-mcp]
...
✅ MCP Server subido exitosamente
✅ ✓ Imágenes subidas exitosamente a Docker Hub
ℹ️  Query Service: rlyehdoom/grafo-query:latest
ℹ️  MCP Server: rlyehdoom/grafo-mcp:latest
? ¿Deseas cerrar sesión de Docker Hub? (Y/n) Y
ℹ️  Sesión cerrada en Docker Hub
```

## 🏷️ Tags y Versionado

### Tag `latest`

Por defecto, las imágenes se suben con el tag `latest`:

```bash
# Usa el tag configurado en .env (default: latest)
grafo query push
```

### Tags Personalizados

Para usar tags personalizados (versiones, ambientes, etc.):

**Opción 1: Editar `.env` temporalmente**

```bash
# Editar Query/.env
DOCKER_TAG=v1.2.0

# Push con el nuevo tag
grafo query push

# Restaurar a latest
DOCKER_TAG=latest
```

**Opción 2: Múltiples tags con script**

```bash
# Push con latest
grafo query push

# Crear tags adicionales manualmente
docker tag grafo-query-service rlyehdoom/grafo-query:v1.2.0
docker push rlyehdoom/grafo-query:v1.2.0

docker tag grafo-mcp-server rlyehdoom/grafo-mcp:v1.2.0
docker push rlyehdoom/grafo-mcp:v1.2.0
```

### Estrategia Recomendada

Para producción, se recomienda usar tags semánticos:

```bash
DOCKER_TAG=v1.0.0    # Release estable
DOCKER_TAG=v1.1.0-rc1 # Release candidate
DOCKER_TAG=dev       # Development
DOCKER_TAG=staging   # Staging environment
DOCKER_TAG=latest    # Última versión estable
```

## 🔐 Seguridad

### Contraseña en .env

**NO recomendado** - Solo para CI/CD automatizado:

```bash
DOCKER_PASSWORD=mi_password_secreto
```

**Importante:** Si defines `DOCKER_PASSWORD` en `.env`:
- Asegúrate de que `.env` esté en `.gitignore`
- NO commitees el archivo al repositorio
- Considera usar Docker Credential Helpers en su lugar

### Contraseña Interactiva

**Recomendado** para desarrollo local:

```bash
# Dejar vacío en .env
DOCKER_PASSWORD=

# El CLI solicitará la contraseña de forma segura
? Ingresa la contraseña de Docker Hub para rlyehdoom: ****
```

### Docker Credential Helpers

Para mayor seguridad, usa Docker Credential Helpers:

```bash
# macOS - Keychain
brew install docker-credential-helper

# Linux - pass
sudo apt-get install pass gnupg2

# Configurar en ~/.docker/config.json
{
  "credsStore": "osxkeychain"  # macOS
  "credsStore": "pass"         # Linux
}
```

Con credential helpers configurados, no necesitas `DOCKER_PASSWORD`.

## 📦 Repositorios en Docker Hub

### Crear Repositorios

Antes de hacer push, crea los repositorios en Docker Hub:

1. Visita https://hub.docker.com
2. Click en "Create Repository"
3. Crea dos repositorios:
   - `grafo-query` - REST API para consultar grafos de código
   - `grafo-mcp` - Model Context Protocol Server

### Visibilidad

**Público:** Cualquiera puede descargar las imágenes
```bash
docker pull rlyehdoom/grafo-query:latest
docker pull rlyehdoom/grafo-mcp:latest
```

**Privado:** Solo usuarios autorizados pueden acceder

## 🌐 Uso de Imágenes Publicadas

### Docker Compose Producción

Actualizar `docker-compose.prod.yml` para usar imágenes de Docker Hub en lugar de construcción local:

```yaml
version: '3.8'

services:
  query-service:
    image: rlyehdoom/grafo-query:latest  # En lugar de build
    # build:
    #   context: ./Query
    #   dockerfile: Dockerfile
    container_name: grafo-query-service-prod
    ports:
      - "8081:8081"
    environment:
      - MONGODB_CONNECTION_STRING=...
    # ... resto de configuración

  mcp-server:
    image: rlyehdoom/grafo-mcp:latest  # En lugar de build
    # build:
    #   context: ./Query
    #   dockerfile: Dockerfile.mcp
    container_name: grafo-mcp-server-prod
    ports:
      - "8083:8082"
    environment:
      - MONGODB_CONNECTION_STRING=...
    # ... resto de configuración
```

### Pull y Run

```bash
# Pull de imágenes
docker pull rlyehdoom/grafo-query:latest
docker pull rlyehdoom/grafo-mcp:latest

# Run con docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

## 🔄 Workflow CI/CD

### GitHub Actions

Ejemplo de workflow para publicación automática:

```yaml
name: Build and Push to Docker Hub

on:
  push:
    tags:
      - 'v*'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Build and push Query Service
        uses: docker/build-push-action@v4
        with:
          context: ./Grafo/Query
          file: ./Grafo/Query/Dockerfile
          push: true
          tags: |
            rlyehdoom/grafo-query:latest
            rlyehdoom/grafo-query:${{ steps.version.outputs.VERSION }}

      - name: Build and push MCP Server
        uses: docker/build-push-action@v4
        with:
          context: ./Grafo/Query
          file: ./Grafo/Query/Dockerfile.mcp
          push: true
          tags: |
            rlyehdoom/grafo-mcp:latest
            rlyehdoom/grafo-mcp:${{ steps.version.outputs.VERSION }}
```

### Secretos Requeridos

En GitHub Settings → Secrets:
- `DOCKER_USERNAME`: Tu usuario de Docker Hub
- `DOCKER_PASSWORD`: Token de acceso de Docker Hub

## 🛠️ Troubleshooting

### Error: denied: requested access to the resource is denied

**Problema:** No tienes permiso para publicar en el repositorio

**Solución:**
1. Verifica que el repositorio exista en Docker Hub
2. Verifica que `DOCKER_USERNAME` sea correcto
3. Verifica que tengas permisos de escritura en el repositorio

### Error: unauthorized: incorrect username or password

**Problema:** Credenciales incorrectas

**Solución:**
1. Verifica `DOCKER_USERNAME` en `.env`
2. Verifica que la contraseña sea correcta
3. Considera usar un Access Token en lugar de contraseña:
   - Docker Hub → Account Settings → Security → New Access Token

### Error: tag does not exist

**Problema:** La imagen local no existe

**Solución:**
```bash
# Verifica que las imágenes existan
docker images | grep grafo

# Si no existen, construye primero
grafo query build
grafo mcp build
```

### Push muy lento

**Problema:** Imágenes muy grandes o conexión lenta

**Solución:**
- Optimiza las imágenes Docker (multi-stage builds)
- Usa `.dockerignore` para excluir archivos innecesarios
- Considera usar un registro local para desarrollo

## 📊 Estadísticas de Imágenes

### Tamaños Aproximados

| Imagen | Tamaño Comprimido | Tamaño Descomprimido |
|--------|-------------------|----------------------|
| grafo-query:latest | ~200 MB | ~500 MB |
| grafo-mcp:latest | ~200 MB | ~500 MB |

### Reducir Tamaño

**1. Multi-stage builds** (ya implementado)
```dockerfile
FROM python:3.11-slim AS builder
# Build dependencies
FROM python:3.11-slim
# Copy only runtime artifacts
```

**2. Alpine Linux**
```dockerfile
FROM python:3.11-alpine
# Más pequeño pero puede requerir compilación de dependencias
```

**3. .dockerignore**
```
.git
.gitignore
__pycache__
*.pyc
*.pyo
tests/
docs/
README.md
```

## 📚 Referencias

- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [Docker Build Documentation](https://docs.docker.com/engine/reference/commandline/build/)
- [Docker Tag Documentation](https://docs.docker.com/engine/reference/commandline/tag/)
- [Docker Push Documentation](https://docs.docker.com/engine/reference/commandline/push/)
- [Best Practices for Writing Dockerfiles](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
