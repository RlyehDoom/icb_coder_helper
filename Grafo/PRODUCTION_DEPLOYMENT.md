# Deployment en Producción

Guía para desplegar Grafo Query Service + MCP Server en ambiente productivo con MongoDB remoto y TLS.

## 🎯 Dos Métodos de Deployment

### Método 1: Docker Hub (Recomendado para Producción)

Usa imágenes pre-construidas publicadas en Docker Hub. **Más rápido y confiable.**

- ✅ No requiere construir imágenes en el servidor
- ✅ Deployment más rápido
- ✅ Mismo build en todos los ambientes
- ✅ Fácil de versionar y hacer rollback

**Ver:** [Deployment desde Docker Hub](#deployment-desde-docker-hub-recomendado)

### Método 2: Build Local

Construye las imágenes directamente en el servidor desde el código fuente.

- ⚠️ Requiere código fuente en el servidor
- ⚠️ Tiempo de build considerable
- ✅ Útil para desarrollo y pruebas

**Ver:** [Deployment con Build Local](#deployment-con-build-local)

---

# Deployment desde Docker Hub (Recomendado)

## 📦 Paso 1: Empaquetar para Deployment

En tu máquina de desarrollo:

```bash
cd Grafo

# Ejecutar script de empaquetado
./scripts/package-for-deployment.sh
```

Este script crea un archivo `.tar.gz` con:
- ✅ Script de deployment automatizado
- ✅ Certificado TLS (Certs/prod/client.pem)
- ✅ Documentación completa
- ✅ Configuraciones necesarias

**Salida:**
```
✓ Paquete creado: grafo-production-deployment-20240118-143022.tar.gz (2.3M)
```

## 📤 Paso 2: Transferir al Servidor

```bash
# Transferir el paquete vía SCP
scp grafo-production-deployment-*.tar.gz usuario@servidor-produccion:/home/usuario/

# O vía SFTP
sftp usuario@servidor-produccion
put grafo-production-deployment-*.tar.gz
```

## 🚀 Paso 3: Ejecutar Deployment en el Servidor

```bash
# Conectarse al servidor
ssh usuario@servidor-produccion

# Descomprimir el paquete
tar -xzf grafo-production-deployment-*.tar.gz
cd grafo-production-deployment

# Ejecutar deployment
chmod +x deploy-from-dockerhub.sh
./deploy-from-dockerhub.sh
```

El script automáticamente:
1. ✅ Verifica requisitos (Docker, Docker Compose)
2. ✅ Valida el certificado TLS
3. ✅ Descarga las imágenes desde Docker Hub
4. ✅ Crea archivos de configuración (.env.production, docker-compose)
5. ✅ Detiene servicios anteriores
6. ✅ Inicia los nuevos servicios
7. ✅ Verifica que estén funcionando

## ✅ Paso 4: Verificar Deployment

```bash
# Health checks
curl http://localhost:8081/health    # Query Service
curl http://localhost:9083/health    # MCP Server

# Ver logs
docker-compose -f docker-compose.dockerhub.yml --env-file .env.production logs -f
```

---

# Deployment con Build Local

## 📋 Requisitos Previos

1. **Docker y Docker Compose** instalados
2. **Certificado TLS** para MongoDB en `Certs/prod/client.pem`
3. **Acceso a MongoDB** productivo (207.244.249.22:28101)
4. **Permisos** para crear volúmenes Docker

## 🔐 Configuración de Seguridad

### Certificado MongoDB

El certificado TLS debe estar ubicado en:
```
Grafo/Certs/prod/client.pem
```

**IMPORTANTE:** Este certificado NO debe ser commiteado al repositorio. Está excluido en `.gitignore`.

### Migración del Certificado

Si tienes el certificado en la ubicación anterior (`Query/certs/prod/client.pem`), puedes migrarlo fácilmente:

**Linux/Mac:**
```bash
cd Grafo
chmod +x scripts/migrate-cert.sh
./scripts/migrate-cert.sh
```

**Windows:**
```powershell
cd Grafo
.\scripts\migrate-cert.ps1
```

O cópialo manualmente:
```bash
# Linux/Mac
mkdir -p Certs/prod
cp Query/certs/prod/client.pem Certs/prod/client.pem

# Windows
mkdir Certs\prod -Force
copy Query\certs\prod\client.pem Certs\prod\client.pem
```

### Variables de Entorno

El archivo `.env.prod` contiene las credenciales y configuración productiva:

```bash
# MongoDB - PRODUCCIÓN (optimized connection string)
MONGODB_CONNECTION_STRING=mongodb://sonata:qwertY.!1982@207.244.249.22:28101/GraphDB?authSource=admin&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true
MONGODB_DATABASE=GraphDB
MONGODB_TLS_CERT_FILE=/app/certs/client.pem

# Puertos
SERVER_PORT=8081  # Query Service
MCP_PORT=9083     # MCP Server (externo)

# Logging
LOG_LEVEL=INFO
ENVIRONMENT=production
```

**IMPORTANTE:** `.env.prod` NO debe ser commiteado. Está excluido en `.gitignore`.

**Nota sobre la Connection String:**
- `authSource=admin` - Especifica la base de datos de autenticación
- `tls=true` - Habilita TLS/SSL
- `tlsAllowInvalidCertificates=true` - Acepta certificados auto-firmados
- `tlsAllowInvalidHostnames=true` - Permite mismatch de hostname
- `/GraphDB` - Especifica la base de datos en el URI path

## 🚀 Deployment

### Linux/Mac

```bash
cd Grafo
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

### Windows (PowerShell)

```powershell
cd Grafo
.\scripts\deploy-prod.ps1
```

### Windows (Sin confirmaciones interactivas)

```powershell
.\scripts\deploy-prod.ps1 -SkipConfirmation
```

## 💾 IndexerDb en Producción

IndexerDb es el componente que procesa los archivos JSON del Indexer y los almacena en MongoDB. Ahora puede conectarse directamente al MongoDB productivo usando el CLI de Grafo.

### Configuración

El archivo `IndexerDb/appsettings.Production.json` contiene la configuración productiva:

```json
{
  "MongoDB": {
    "ConnectionString": "mongodb://sonata:qwertY.!1982@207.244.249.22:28101/GraphDB?authSource=admin&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true",
    "DatabaseName": "GraphDB",
    "CollectionName": "projects",
    "TlsCertificateFile": "../Certs/prod/client.pem",
    "TlsInsecure": true
  }
}
```

**IMPORTANTE:**
- Este archivo contiene credenciales y NO debe ser commiteado. Está excluido en `.gitignore`.
- El certificado TLS debe existir en `Grafo/Certs/prod/client.pem` (path relativo desde `IndexerDb/`)
- IndexerDb se ejecuta localmente y necesita acceso directo al certificado en el filesystem
- La connection string está optimizada con `authSource=admin` y parámetros TLS específicos

### Ejecutar en Modo Producción con CLI

El CLI de Grafo provee comandos integrados para ejecutar IndexerDb en producción:

```bash
cd Grafo

# Procesar todos los archivos en PRODUCCIÓN
grafo indexerdb run --all --production

# Modo interactivo con selección de ambiente
grafo indexerdb run

# Procesar archivo específico en producción
grafo indexerdb run --file "../Indexer/output/ICB7C_GraphFiles/Banking-graph.json" --production

# Modo query interactivo en producción
grafo indexerdb run --interactive --production

# Ver estado del sistema
grafo indexerdb status
```

### Flujo de Trabajo Típico

```bash
# 1. Ejecutar Indexer (genera JSON)
cd Grafo
grafo indexer analyze --solution "path/to/solution.sln"

# 2. Procesar e insertar en MongoDB PRODUCTIVO
grafo indexerdb run --all --production

# 3. Verificar datos en producción
grafo indexerdb run --interactive --production
> count
> projects list
> exit
```

### Advertencias de Seguridad

Al ejecutar en modo producción verás:
```
⚠️  Conectándose a MongoDB PRODUCTIVO (207.244.249.22:28101)
```

Esto te recuerda que estás modificando datos en producción. Confirma que realmente deseas hacer esto antes de continuar.

### Modos de Ejecución

| Modo | Comando | Descripción |
|------|---------|-------------|
| **Interactivo (selección)** | `./run-production.sh` | Muestra lista de archivos para seleccionar |
| **Procesar todos** | `./run-production.sh --all` | Procesa todos los archivos automáticamente |
| **Archivo específico** | `./run-production.sh --file <path>` | Procesa un archivo específico |
| **Query only** | `./run-production.sh --interactive` | Solo modo consulta, sin procesar archivos |
| **Todo + Query** | `./run-production.sh --all --interactive` | Procesa todo y luego entra en modo consulta |

## 📦 ¿Qué hace el script?

El script de deployment ejecuta los siguientes pasos automáticamente:

1. **Verificaciones Previas**
   - Docker instalado
   - Docker Compose instalado
   - Certificado `client.pem` existe
   - Archivos `.env.prod` y `docker-compose.prod.yml` existen

2. **Preparar Volumen de Certificados**
   - Crea volumen Docker `mongodb-certs`
   - Copia `client.pem` al volumen
   - Configura permisos correctos (644)

3. **Detener Servicios Existentes**
   - Detiene servicios de desarrollo (si existen)
   - Detiene servicios productivos previos (si existen)

4. **Construir Imágenes**
   - Construye imagen de Query Service
   - Construye imagen de MCP Server

5. **Iniciar Servicios**
   - Levanta servicios con `docker-compose.prod.yml`
   - Modo detached (`-d`)

6. **Verificar Health**
   - Espera 10 segundos
   - Verifica Query Service (puerto 8081)
   - Verifica MCP Server (puerto 9083)

7. **Mostrar Estado**
   - Muestra contenedores activos
   - Muestra endpoints disponibles

## 🔍 Verificación Post-Deployment

### Health Checks

```bash
# Query Service
curl http://localhost:8081/health

# MCP Server
curl http://localhost:9083/health
```

### Ver Logs

```bash
# Ver logs de todos los servicios
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f

# Ver logs de un servicio específico
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f query-service
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f mcp-server
```

### Ver Estado

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

## 📡 Endpoints Productivos

| Servicio | Endpoint | Puerto |
|----------|----------|--------|
| Query Service (REST API) | http://localhost:8081 | 8081 |
| Query Service Health | http://localhost:8081/health | 8081 |
| Query Service Docs | http://localhost:8081/docs | 8081 |
| MCP Server (SSE) | http://localhost:9083/sse | 9083 |
| MCP Server Health | http://localhost:9083/health | 9083 |

## 🛠️ Comandos Útiles

### Reiniciar Servicios

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart
```

### Detener Servicios

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

### Ver Estadísticas de Recursos

```bash
docker stats grafo-query-service-prod grafo-mcp-server-prod
```

### Ejecutar Comandos en Contenedor

```bash
# Query Service
docker exec -it grafo-query-service-prod /bin/sh

# MCP Server
docker exec -it grafo-mcp-server-prod /bin/bash
```

## 🔧 Troubleshooting

### Error: Certificado no encontrado

**Problema:** `Certificado no encontrado: Certs/prod/client.pem`

**Solución:** Asegúrate de que el certificado esté en la ubicación correcta:
```bash
ls -la Grafo/Certs/prod/client.pem
```

### Error: Conexión a MongoDB falla

**Problema:** MCP Server no puede conectar a MongoDB

**Solución:**
1. Verifica que el servidor MongoDB esté accesible:
   ```bash
   telnet 207.244.249.22 28101
   ```

2. Verifica las credenciales en `.env.prod`

3. Verifica que el certificado esté correctamente montado:
   ```bash
   docker run --rm -v mongodb-certs:/certs:ro alpine ls -la /certs/
   ```

### Error: Puerto ya en uso

**Problema:** `Error starting userland proxy: listen tcp 0.0.0.0:8081: bind: address already in use`

**Solución:**
1. Detén servicios de desarrollo:
   ```bash
   docker compose -f docker-compose.yml down
   ```

2. Verifica procesos usando los puertos:
   ```bash
   # Linux/Mac
   lsof -i :8081
   lsof -i :9083

   # Windows
   netstat -ano | findstr :8081
   netstat -ano | findstr :9083
   ```

### Logs muestran errores de TLS

**Problema:** `SSL/TLS handshake failed` en logs

**Solución:**
1. Verifica que `MONGODB_TLS_INSECURE=true` esté en `.env.prod`
2. Verifica que el certificado sea válido:
   ```bash
   openssl x509 -in Certs/prod/client.pem -text -noout
   ```

### Recrear volumen de certificados

Si necesitas recrear el volumen:

```bash
# 1. Detener servicios
docker compose -f docker-compose.prod.yml --env-file .env.prod down

# 2. Eliminar volumen
docker volume rm mongodb-certs

# 3. Re-ejecutar script de deployment
./scripts/deploy-prod.sh  # o .ps1 en Windows
```

### IndexerDb: Error de certificado TLS

**Problema:** `TLS certificate file not found: ../Certs/prod/client.pem` al ejecutar IndexerDb en producción

**Solución:**

1. Verifica que el certificado existe:
   ```bash
   # Desde el directorio raíz de Grafo
   ls -la Certs/prod/client.pem
   ```

2. Verifica el path relativo desde IndexerDb:
   ```bash
   cd IndexerDb
   ls -la ../Certs/prod/client.pem
   ```

3. Si el certificado no existe, cópialo desde la fuente original:
   ```bash
   mkdir -p Certs/prod
   cp <source>/client.pem Certs/prod/client.pem
   ```

4. Verifica la configuración en `appsettings.Production.json`:
   ```json
   {
     "MongoDB": {
       "TlsCertificateFile": "../Certs/prod/client.pem"
     }
   }
   ```

**Nota:** IndexerDb se ejecuta localmente (NO en Docker), por lo que necesita acceso directo al archivo `.pem` en el filesystem.

### IndexerDb: Error de conexión MongoDB con TLS

**Problema:** `MongoConnectionException` o `SSL/TLS handshake failed` al usar IndexerDb

**Solución:**

1. Verifica que el certificado sea válido:
   ```bash
   openssl x509 -in Certs/prod/client.pem -text -noout
   ```

2. Verifica que `TlsInsecure: true` esté en `appsettings.Production.json` si usas certificados autofirmados

3. Prueba la conexión desde tu máquina local:
   ```bash
   # Linux/Mac
   openssl s_client -connect 207.244.249.22:28101 -cert Certs/prod/client.pem

   # O con mongosh
   mongosh "mongodb://sonata:qwertY.!1982@207.244.249.22:28101/?tls=true" \
     --tlsCertificateKeyFile Certs/prod/client.pem
   ```

## 🔄 Actualización de Código

Para actualizar el código en producción:

1. Hacer cambios en el código fuente
2. Re-ejecutar script de deployment:
   ```bash
   ./scripts/deploy-prod.sh
   ```

El script automáticamente:
- Reconstruye las imágenes
- Re-despliega los contenedores
- Preserva el volumen de certificados

## 🔐 Seguridad

### Archivos que NO deben commitearse:

- `.env.prod` - Contiene credenciales
- `Certs/prod/*` - Certificados TLS
- Cualquier archivo `.pem`, `.key`

### Verificar que estén excluidos:

```bash
git status
# No deberías ver .env.prod ni archivos .pem
```

### Si accidentalmente commiteaste secretos:

1. **NO hagas push**
2. Usa `git reset` o `git rebase` para eliminar el commit
3. Si ya hiciste push, considera rotar las credenciales

## 📊 Monitoreo

### Verificar uso de recursos

```bash
# CPU y Memoria
docker stats --no-stream grafo-query-service-prod grafo-mcp-server-prod

# Espacio en disco
docker system df
```

### Verificar conexiones MongoDB

```bash
# Ver logs de conexión
docker compose -f docker-compose.prod.yml --env-file .env.prod logs query-service | grep -i mongo
docker compose -f docker-compose.prod.yml --env-file .env.prod logs mcp-server | grep -i mongo
```

## 🔄 Rollback

Si necesitas volver a una versión anterior:

1. Hacer checkout del commit anterior
2. Re-ejecutar deployment:
   ```bash
   git checkout <commit-hash>
   ./scripts/deploy-prod.sh
   ```

## 🆘 Soporte

Para problemas con el deployment:

1. **Revisar logs completos:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod logs
   ```

2. **Verificar configuración:**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod config
   ```

3. **Verificar red Docker:**
   ```bash
   docker network inspect grafo-network-prod
   ```

4. **Verificar volumen:**
   ```bash
   docker volume inspect mongodb-certs
   ```
