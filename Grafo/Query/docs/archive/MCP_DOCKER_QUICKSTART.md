# MCP Docker - Quick Start (3 minutos)

Guía ultra-rápida para ejecutar el MCP Server en Docker.

## ⚡ Quick Start

```bash
cd Grafo/Query

# 1. Build
./docker-mcp.sh build

# 2. Start
./docker-mcp.sh start

# 3. Status
./docker-mcp.sh status
```

## 📝 Configurar Cursor

Edita `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "grafo-query-docker": {
      "command": "docker",
      "args": ["exec", "-i", "grafo-mcp-server", "python", "start_mcp.py"]
    }
  }
}
```

O copia la configuración incluida:

```bash
cat mcp_config_docker.json
```

## ✅ Verificar

```bash
# Ver que esté corriendo
./docker-mcp.sh status

# Ver logs
./docker-mcp.sh logs

# Ejecutar test
./docker-mcp.sh test
```

## 🎯 Comandos Esenciales

```bash
./docker-mcp.sh start      # Iniciar
./docker-mcp.sh stop       # Detener
./docker-mcp.sh restart    # Reiniciar
./docker-mcp.sh logs       # Ver logs
./docker-mcp.sh test       # Ejecutar tests
```

## 🐛 Troubleshooting Rápido

### Container no inicia

```bash
# Ver logs
docker logs grafo-mcp-server

# Verificar MongoDB
mongosh "mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/"
```

### Cursor no conecta

1. Verificar contenedor: `./docker-mcp.sh status`
2. Debe mostrar "CORRIENDO" y "healthy"
3. Reiniciar Cursor

### MongoDB connection error

En `docker-compose.mcp.yml`, verifica:
```yaml
MONGODB_CONNECTION_STRING=mongodb://InfocorpAI:InfocorpAI2025@host.docker.internal:27017/
```

Nota: Usar `host.docker.internal` en lugar de `localhost`

## 🔄 Actualizar

```bash
./docker-mcp.sh build && ./docker-mcp.sh restart
```

## 🧹 Limpiar

```bash
./docker-mcp.sh clean
```

## 📚 Documentación Completa

- **Docker Detallado:** [MCP_DOCKER.md](MCP_DOCKER.md)
- **MCP Completo:** [MCP_README.md](MCP_README.md)
- **Quick Start Local:** [MCP_QUICKSTART.md](MCP_QUICKSTART.md)

---

**Tiempo:** ~3 minutos
**Dificultad:** ⭐ (Muy Fácil)
