# Instalación - Grafo

Guía de instalación del sistema Grafo para análisis de código C# y servidor MCP.

## 📋 Prerequisitos

Antes de instalar, verifica que tienes:

### Requeridos
- **Docker Desktop** - Para MongoDB y servicios containerizados
  - Windows: https://www.docker.com/products/docker-desktop/
  - Mac: https://www.docker.com/products/docker-desktop/
  - Linux: https://docs.docker.com/engine/install/

- **Node.js 18+** - Para CLI de Grafo
  ```bash
  node --version  # >= 18.0.0
  ```
  - Descargar: https://nodejs.org/

### Para Indexación (Opcional)
Si vas a indexar código C#:

- **.NET 8.0 SDK** - Para Indexer y IndexerDb
  ```bash
  dotnet --version  # >= 8.0.0
  ```
  - Descargar: https://dotnet.microsoft.com/download

## 🚀 Instalación

### 1. Instalar CLI de Grafo

```bash
cd Grafo
npm install
npm link
```

Verificar instalación:
```bash
grafo --version
```

### 2. Iniciar Servicios

```bash
# Iniciar MongoDB
grafo mongodb start

# Construir e iniciar MCP Server
grafo mcp build
grafo mcp start
```

### 3. Verificar Estado

```bash
grafo mongodb status
grafo mcp status
```

## ✅ Verificación Completa

```bash
# Ver estado de todos los servicios
docker ps

# Deberías ver:
# - grafo-mongodb (puerto 27019)
# - grafo-mcp-server (puerto 8083)
```

## 🎯 Próximos Pasos

### Configurar Cursor/VSCode

El comando `grafo mcp status` muestra la configuración necesaria:

```json
{
  "mcpServers": {
    "grafo-query-http": {
      "url": "http://localhost:8083/sse",
      "transport": "sse"
    }
  }
}
```

Agregar esta configuración a:
- **Cursor:** `~/.cursor/mcp.json` (Linux/Mac) o `%APPDATA%\Cursor\User\mcp.json` (Windows)
- **VSCode:** Similar ubicación

Reiniciar el IDE.

### Indexar Código C# (Opcional)

Si tienes .NET SDK instalado y quieres indexar código C#:

```bash
# 1. Indexar solución
cd Grafo/Indexer
dotnet run -- --solution "/path/to/solution.sln"

# 2. Almacenar en MongoDB
cd ../IndexerDb
dotnet run --all
```

## 🛠️ Comandos Útiles

### MongoDB
```bash
grafo mongodb start      # Iniciar
grafo mongodb stop       # Detener
grafo mongodb restart    # Reiniciar
grafo mongodb status     # Ver estado
grafo mongodb logs       # Ver logs
grafo mongodb shell      # Abrir mongosh
grafo mongodb clean      # Limpiar (elimina datos)
```

### MCP Server
```bash
grafo mcp build          # Construir imagen
grafo mcp start          # Iniciar
grafo mcp stop           # Detener
grafo mcp restart        # Reiniciar
grafo mcp status         # Ver estado (muestra config)
grafo mcp logs           # Ver logs
grafo mcp test           # Ejecutar tests
grafo mcp shell          # Abrir shell
grafo mcp clean          # Limpiar
```

## 🐛 Troubleshooting

### Docker no está instalado
```bash
# Verificar Docker
docker --version
docker info

# Si no está instalado, descargar Docker Desktop
```

### Puerto 27019 ya en uso
```bash
# Ver qué está usando el puerto
netstat -ano | findstr ":27019"  # Windows
lsof -i :27019                   # Linux/Mac

# Detener el proceso o cambiar puerto en docker-compose.yml
```

### MCP Server no inicia
```bash
# Ver logs para diagnosticar
grafo mcp logs

# Verificar MongoDB está corriendo
grafo mongodb status

# Reiniciar todo
grafo mcp restart
```

### Permisos en Linux/Mac
```bash
# Si hay problemas de permisos con npm link
sudo npm link

# O agregar Node.js al PATH del usuario
```

## 🔄 Actualización

Para actualizar Grafo a la última versión:

```bash
cd Grafo

# Actualizar código
git pull

# Reinstalar dependencias
npm install

# Rebuild servicios Docker
grafo mcp build
grafo mcp restart
```

## 🧹 Desinstalación

```bash
# Detener servicios
grafo mcp stop
grafo mongodb stop

# Limpiar contenedores e imágenes
grafo mcp clean
grafo mongodb clean

# Desinstalar CLI global
npm unlink
```

---

**Documentación Completa:** Ver [README.md](README.md)
**Quick Start:** Ver [QUICKSTART.md](QUICKSTART.md)
**Arquitectura:** Ver [ECOSYSTEM_OVERVIEW.md](ECOSYSTEM_OVERVIEW.md)
