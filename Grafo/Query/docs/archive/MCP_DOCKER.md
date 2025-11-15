# MCP Server - Docker Deployment

Guía completa para ejecutar el Grafo MCP Server en Docker.

## 🎯 Ventajas de usar Docker

- ✅ **Aislamiento:** Entorno consistente y reproducible
- ✅ **Portabilidad:** Funciona igual en todos los sistemas
- ✅ **Sin dependencias locales:** No necesita Python ni dependencias instaladas
- ✅ **Fácil actualización:** Rebuild y restart automáticos
- ✅ **Health checks:** Monitoreo automático del servicio

## 📦 Prerequisitos

- Docker 20.10+
- Docker Compose 1.29+
- MongoDB ejecutándose (local o Docker)
- Cursor o VSCode instalado

## 🚀 Quick Start (2 minutos)

### 1. Build de la Imagen

```bash
cd Grafo/Query

# Opción A: Usando el script helper
./docker-mcp.sh build

# Opción B: Usando docker directamente
docker build -f Dockerfile.mcp -t grafo-mcp-server:latest .
```

### 2. Iniciar el Servidor

```bash
# Opción A: Usando el script helper (recomendado)
./docker-mcp.sh start

# Opción B: Usando docker-compose
docker-compose -f docker-compose.mcp.yml up -d
```

### 3. Verificar Estado

```bash
./docker-mcp.sh status
```

Deberías ver:
```
✓ Contenedor está CORRIENDO
grafo-mcp-server    Up 2 minutes (healthy)    grafo-mcp-server:latest
✓ Health: healthy
```

### 4. Configurar Cursor

Edita tu configuración de Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "grafo-query-docker": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "grafo-mcp-server",
        "python",
        "start_mcp.py"
      ]
    }
  }
}
```

O copia el archivo de configuración incluido:
```bash
# Copiar configuración Docker
cat mcp_config_docker.json
```

### 5. Reinicia Cursor y ¡listo! 🎉

## 🛠️ Script Helper: docker-mcp.sh

El script `docker-mcp.sh` facilita todas las operaciones Docker:

### Comandos Disponibles

```bash
./docker-mcp.sh build      # Construir imagen
./docker-mcp.sh start      # Iniciar contenedor
./docker-mcp.sh stop       # Detener contenedor
./docker-mcp.sh restart    # Reiniciar contenedor
./docker-mcp.sh logs       # Ver logs (Ctrl+C para salir)
./docker-mcp.sh status     # Ver estado
./docker-mcp.sh shell      # Abrir shell en contenedor
./docker-mcp.sh test       # Ejecutar test_mcp.py
./docker-mcp.sh exec CMD   # Ejecutar comando personalizado
./docker-mcp.sh clean      # Limpiar contenedores e imágenes
./docker-mcp.sh help       # Mostrar ayuda
```

### Ejemplos de Uso

```bash
# Ver logs en tiempo real
./docker-mcp.sh logs

# Ejecutar tests dentro del contenedor
./docker-mcp.sh test

# Abrir shell para debugging
./docker-mcp.sh shell

# Ejecutar comando personalizado
./docker-mcp.sh exec python -c "import mcp; print(mcp.__version__)"
```

## ⚙️ Configuración

### Variables de Entorno

El archivo `docker-compose.mcp.yml` usa estas variables:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `MONGODB_CONNECTION_STRING` | Conexión a MongoDB | `mongodb://InfocorpAI:InfocorpAI2025@host.docker.internal:27017/` |
| `MONGODB_DATABASE` | Base de datos | `GraphDB` |
| `MONGODB_PROJECTS_COLLECTION` | Colección | `projects` |
| `LOG_LEVEL` | Nivel de logging | `INFO` |

### Conectar a MongoDB

#### MongoDB en el Host (Opción por defecto)

Usa `host.docker.internal`:

```yaml
environment:
  - MONGODB_CONNECTION_STRING=mongodb://InfocorpAI:InfocorpAI2025@host.docker.internal:27017/
```

#### MongoDB en Docker

Si MongoDB también está en Docker:

1. Crea una red compartida:
   ```bash
   docker network create grafo-network
   ```

2. Conecta ambos contenedores a la red:
   ```yaml
   # En docker-compose.mcp.yml
   services:
     mcp-server:
       networks:
         - grafo-network

   networks:
     grafo-network:
       external: true
   ```

3. Usa el nombre del servicio:
   ```yaml
   environment:
     - MONGODB_CONNECTION_STRING=mongodb://InfocorpAI:InfocorpAI2025@mongodb:27017/
   ```

### Personalizar Configuración

Crea un archivo `.env` en el directorio `Query/`:

```bash
# Copiar plantilla
cp .env.docker .env

# Editar según tus necesidades
nano .env
```

Docker Compose usará automáticamente las variables del archivo `.env`.

## 🧪 Testing

### Test Automático

```bash
./docker-mcp.sh test
```

Esto ejecuta `test_mcp.py` dentro del contenedor y muestra:
```
🧪 Iniciando pruebas del MCP Server...
✅ Conectado a MongoDB
✅ GraphQueryService inicializado
✅ Herramientas MCP inicializadas
...
```

### Test Manual

```bash
# Abrir shell en contenedor
./docker-mcp.sh shell

# Dentro del contenedor:
python test_mcp.py
python test_mcp.py --interactive
exit
```

### Ver Logs

```bash
# Logs en tiempo real
./docker-mcp.sh logs

# Últimas 50 líneas
docker logs --tail 50 grafo-mcp-server

# Buscar errores
docker logs grafo-mcp-server 2>&1 | grep ERROR
```

## 🔍 Debugging

### Health Check

El contenedor tiene health checks automáticos cada 30 segundos:

```bash
# Ver estado de salud
docker inspect --format='{{.State.Health.Status}}' grafo-mcp-server

# Ver últimos health checks
docker inspect --format='{{json .State.Health}}' grafo-mcp-server | python -m json.tool
```

Estados posibles:
- `starting` - Iniciando (primeros 40 segundos)
- `healthy` - Funcionando correctamente
- `unhealthy` - Problemas de conexión

### Problemas Comunes

#### 1. "Connection refused to MongoDB"

**Síntoma:**
```
❌ Error durante la inicialización: Connection refused
```

**Soluciones:**

a) **MongoDB en el host:** Verifica que MongoDB esté corriendo
```bash
# En el host
mongosh "mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/"
```

b) **Firewall:** Asegúrate de que MongoDB acepte conexiones desde Docker
```bash
# Linux: Agregar regla de firewall
sudo ufw allow from 172.17.0.0/16 to any port 27017

# Windows: Configurar firewall de Windows
```

c) **Usar host.docker.internal:** Verifica la configuración en `docker-compose.mcp.yml`

#### 2. "Container exits immediately"

**Síntoma:**
```
./docker-mcp.sh status
⚠ Contenedor NO está corriendo
```

**Solución:**

Ver logs para identificar el error:
```bash
docker logs grafo-mcp-server

# O revisar logs del último contenedor
docker ps -a
docker logs <container_id>
```

#### 3. "Cursor can't connect to MCP"

**Síntoma:**
Cursor muestra error "MCP server not responding"

**Soluciones:**

a) **Verificar contenedor:**
```bash
./docker-mcp.sh status
# Debe mostrar "CORRIENDO" y "healthy"
```

b) **Verificar configuración de Cursor:**
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

c) **Reiniciar Cursor completamente**

d) **Ver logs de Cursor:** `Ctrl+Shift+I` → Console

#### 4. "Permission denied"

**Síntoma:**
```
Error: permission denied while trying to connect
```

**Solución:**

Agregar tu usuario al grupo docker:
```bash
# Linux
sudo usermod -aG docker $USER
newgrp docker

# Reiniciar sesión
```

## 📊 Monitoreo

### Ver Recursos

```bash
# Uso de CPU y memoria
docker stats grafo-mcp-server

# Información del contenedor
docker inspect grafo-mcp-server | less
```

### Logs Persistentes

Para guardar logs:

```bash
# Redirigir a archivo
./docker-mcp.sh logs > mcp-docker.log

# O usar docker logs
docker logs -f grafo-mcp-server 2>&1 | tee mcp-docker.log
```

## 🔄 Actualización

Cuando el código cambia:

```bash
# 1. Rebuild imagen
./docker-mcp.sh build

# 2. Reiniciar contenedor (usa nueva imagen)
./docker-mcp.sh restart

# O hacer todo en un paso
./docker-mcp.sh build && ./docker-mcp.sh restart
```

## 🧹 Limpieza

### Remover Contenedor

```bash
./docker-mcp.sh stop
docker rm grafo-mcp-server
```

### Remover Imagen

```bash
docker rmi grafo-mcp-server:latest
```

### Limpieza Completa

```bash
# Usa el comando clean (interactivo)
./docker-mcp.sh clean

# O manual
docker-compose -f docker-compose.mcp.yml down
docker rmi grafo-mcp-server:latest
```

## 🔐 Seguridad

### Usuario No-Root

El Dockerfile crea un usuario `mcpuser` (UID 1000) para ejecutar el servidor:

```dockerfile
RUN useradd -m -u 1000 mcpuser && chown -R mcpuser:mcpuser /app
USER mcpuser
```

### Secrets

Para credenciales sensibles, usa Docker Secrets en lugar de variables de entorno:

```bash
# Crear secret
echo "mongodb://user:pass@host:27017/" | docker secret create mongo_conn -

# Usar en docker-compose.yml
secrets:
  mongo_conn:
    external: true
```

## 🚀 Producción

### Docker Compose para Producción

Crea `docker-compose.mcp.prod.yml`:

```yaml
version: '3.8'

services:
  mcp-server:
    image: grafo-mcp-server:1.0.0
    container_name: grafo-mcp-server-prod
    restart: always

    environment:
      - MONGODB_CONNECTION_STRING=${MONGODB_CONNECTION_STRING}
      - LOG_LEVEL=WARNING

    healthcheck:
      test: ["CMD", "python", "healthcheck.py"]
      interval: 30s
      timeout: 10s
      retries: 3

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Iniciar en Producción

```bash
docker-compose -f docker-compose.mcp.prod.yml up -d
```

## 📚 Referencias

- **Docker Documentation:** https://docs.docker.com/
- **Docker Compose:** https://docs.docker.com/compose/
- **MCP Protocol:** https://modelcontextprotocol.io/
- **MCP README:** [MCP_README.md](MCP_README.md)
- **Quick Start:** [MCP_QUICKSTART.md](MCP_QUICKSTART.md)

## 🆘 Soporte

Si tienes problemas:

1. Ver logs: `./docker-mcp.sh logs`
2. Verificar estado: `./docker-mcp.sh status`
3. Ejecutar tests: `./docker-mcp.sh test`
4. Revisar configuración de MongoDB
5. Consultar documentación completa

---

**Versión:** 1.0.0
**Última actualización:** Noviembre 2024
**Estado:** ✅ Listo para uso
