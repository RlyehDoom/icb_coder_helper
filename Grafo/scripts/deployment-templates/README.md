# Grafo Production Deployment Package

Este paquete contiene todo lo necesario para desplegar Grafo Query Service y MCP Server en producción usando imágenes de Docker Hub.

## 📦 Contenido del Paquete

```
grafo-production-deployment/
├── deploy-from-dockerhub.sh    # Script principal de deployment
├── Certs/
│   └── prod/
│       └── client.pem          # Certificado TLS para MongoDB
├── README.md                   # Esta documentación
└── DEPLOYMENT_GUIDE.md         # Guía detallada de deployment
```

## 🚀 Quick Start

### 1. Transferir al Servidor

```bash
# Descomprimir el paquete
tar -xzf grafo-production-deployment-*.tar.gz
cd grafo-production-deployment
```

### 2. Verificar Requisitos

El servidor debe tener:
- Docker instalado (`docker --version`)
- Docker Compose instalado (`docker-compose --version`)
- Acceso a internet (para descargar imágenes de Docker Hub)
- Acceso a MongoDB productivo (207.244.249.22:28101)

### 3. Ejecutar Deployment

```bash
# Dar permisos de ejecución
chmod +x deploy-from-dockerhub.sh

# Ejecutar deployment
./deploy-from-dockerhub.sh
```

El script automáticamente:
1. ✓ Verifica requisitos (Docker, Docker Compose)
2. ✓ Valida el certificado TLS
3. ✓ Descarga las imágenes desde Docker Hub
4. ✓ Crea archivos de configuración
5. ✓ Detiene servicios anteriores (si existen)
6. ✓ Inicia los servicios
7. ✓ Verifica que estén funcionando

### 4. Verificar Deployment

Una vez completado el deployment:

```bash
# Verificar servicios
curl http://localhost:8081/health    # Query Service
curl http://localhost:8083/health    # MCP Server

# Ver logs
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production logs -f
```

## 🔧 Opciones Avanzadas

### Deployment sin Pull (usar imágenes locales)

```bash
./deploy-from-dockerhub.sh --skip-pull
```

### Deployment sin verificar certificado

```bash
./deploy-from-dockerhub.sh --skip-cert-check
```

## 📡 Servicios Desplegados

| Servicio | Puerto | URL | Descripción |
|----------|--------|-----|-------------|
| Query Service | 8081 | http://servidor:8081 | REST API |
| Query Docs | 8081 | http://servidor:8081/docs | Swagger UI |
| MCP Server | 8083 | http://servidor:8083/sse | SSE Endpoint |
| MCP Health | 8083 | http://servidor:8083/health | Health Check |

## 🛠️ Comandos Útiles

### Ver Logs

```bash
# Todos los servicios
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production logs -f

# Solo Query Service
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production logs -f query-service

# Solo MCP Server
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production logs -f mcp-server
```

### Reiniciar Servicios

```bash
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production restart
```

### Detener Servicios

```bash
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production down
```

### Ver Estado

```bash
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production ps
```

### Actualizar Imágenes

```bash
# Descargar nuevas versiones
docker pull rlyehdoom/grafo-query:latest
docker pull rlyehdoom/grafo-mcp:latest

# Reiniciar servicios con nuevas imágenes
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production up -d
```

## 🔐 Seguridad

### Certificado TLS

El certificado `client.pem` es **privado** y **NO debe compartirse públicamente**.
- Está incluido en este paquete porque es necesario para la conexión TLS a MongoDB
- Asegúrate de que solo usuarios autorizados tengan acceso a este paquete

### Credenciales MongoDB

Las credenciales de MongoDB están embebidas en el script de deployment.
En el archivo `.env.production` generado automáticamente.

**IMPORTANTE:** No commitees estos archivos a repositorios públicos.

## 📞 Soporte

Para problemas con el deployment:

1. **Revisar logs:**
   ```bash
   docker-compose -f docker-compose.dockerhub.yml --env-file .env.production logs
   ```

2. **Verificar conectividad a MongoDB:**
   ```bash
   telnet 207.244.249.22 28101
   ```

3. **Verificar que las imágenes existen:**
   ```bash
   docker images | grep grafo
   ```

4. **Verificar servicios corriendo:**
   ```bash
   docker ps | grep grafo
   ```

## 📚 Documentación Adicional

Ver `DEPLOYMENT_GUIDE.md` para instrucciones detalladas y troubleshooting avanzado.
