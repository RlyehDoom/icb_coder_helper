# Deployment Notes - MongoDB Connection Fix

## Issue Resolved

**Problem**: Docker containers (Query Service and MCP Server) were timing out when trying to connect to MongoDB.

**Root Cause**: The deployment was attempting to connect to MongoDB using the external IP address `207.244.249.22:28101`, but MongoDB is actually running in a Docker container on the **same host** machine.

**Solution**: Updated the deployment configuration to use `host.docker.internal:28101` for accessing the MongoDB container from other containers on the same host.

## Changes Made

### 1. Automatic MongoDB Container Detection

The deployment script now **automatically detects** if MongoDB is running in a Docker container on the same host:

**Detection Process:**
```bash
# 1. Find container listening on port 28101
mongo_container=$(docker ps --filter "publish=28101" --format "{{.Names}}")

# 2. Get the network that container is using
mongo_network=$(docker inspect $mongo_container --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

# 3. Connect Query/MCP containers to that same network
```

### 2. Dynamic Connection Strategy

**Scenario A: MongoDB Container Found** (Recommended)
```bash
# Connection details:
MONGODB_HOST="<container-name>"  # e.g., "mongodb-prod"
MONGODB_PORT="27017"              # Internal MongoDB port
MONGODB_CONNECTION_STRING="mongodb://user:pass@<container-name>:27017/GraphDB?..."

# Docker Compose:
services:
  query-service:
    networks:
      - mongodb-network  # Shared with MongoDB container
    environment:
      - MONGODB_CONNECTION_STRING=mongodb://...@mongodb-prod:27017/...
```

**Benefits:**
- ✓ Direct container-to-container communication (fastest, most reliable)
- ✓ No IP address needed
- ✓ Uses internal Docker networking
- ✓ No firewall or gateway issues

**Scenario B: MongoDB Container Not Found** (Fallback)
```bash
# Connection details:
MONGODB_HOST="172.17.0.1"         # Docker gateway IP (auto-detected)
MONGODB_PORT="28101"              # Host-exposed port
MONGODB_CONNECTION_STRING="mongodb://user:pass@172.17.0.1:28101/GraphDB?..."

# Docker Compose:
services:
  query-service:
    networks:
      - grafo-network  # Separate network
    environment:
      - MONGODB_CONNECTION_STRING=mongodb://...@172.17.0.1:28101/...
```

### 3. Docker Compose Generated Dynamically

The script generates **different docker-compose.yml** files depending on detection:

**With MongoDB Container:**
```yaml
networks:
  mongodb-network:
    external: true      # Uses existing network
    name: mongodb-network
```

**Without MongoDB Container:**
```yaml
networks:
  grafo-network:
    driver: bridge      # Creates new network
    name: grafo-network-prod-dh
```

## Technical Details

### Container-to-Container Communication

The script uses the **best practice** for container communication: **shared Docker networks**.

**Why this approach?**

1. **Direct Communication**: Containers on the same network can communicate directly using container names as hostnames
2. **No Port Mapping**: Uses internal MongoDB port (27017) instead of host-exposed port (28101)
3. **No Gateway Issues**: Bypasses firewall, routing, and gateway configuration
4. **Better Performance**: No translation through host networking stack

### Connection Methods Comparison

| Method | Pros | Cons | Used When |
|--------|------|------|-----------|
| **Container Name** (Recommended) | ✓ Direct communication<br>✓ Uses internal ports<br>✓ No IP needed<br>✓ Most reliable | Requires shared network | MongoDB is in container |
| **Gateway IP** (Fallback) | ✓ Works without shared network | ✗ Requires port mapping<br>✗ May have firewall issues<br>✗ Slower | MongoDB not detected |
| **External IP** (Never) | - | ✗ Routing issues<br>✗ Firewall issues<br>✗ Unreliable | ❌ Not used |

### Port Mapping Details

**MongoDB Container Setup:**
```bash
# MongoDB container exposes internal port 27017 to host port 28101
docker run -p 28101:27017 --name mongodb-prod --network mongodb-network mongo
```

**Query/MCP Containers Connection:**

**Option A: Same Network** (What the script uses when MongoDB is detected)
```yaml
# Query Service connects directly via container name
services:
  query-service:
    networks:
      - mongodb-network
    environment:
      - MONGODB_CONNECTION_STRING=mongodb://...@mongodb-prod:27017/...
```
✅ Uses port **27017** (internal MongoDB port)
✅ No host networking involved

**Option B: Different Network** (Fallback)
```yaml
# Query Service connects via gateway IP
services:
  query-service:
    networks:
      - grafo-network
    environment:
      - MONGODB_CONNECTION_STRING=mongodb://...@172.17.0.1:28101/...
```
⚠️ Uses port **28101** (host-exposed port)
⚠️ Requires gateway routing

## Deployment Instructions

### 1. Transfer Package to Server

```bash
# On your local machine
scp grafo-prod-YYYYMMDD-HHMMSS.tar.gz sonata@207.244.249.22:~/ftp/
```

### 2. On Ubuntu Server

```bash
# Create deployment directory
mkdir -p $HOME/grafo/deployment

# Copy from FTP
cp $HOME/ftp/grafo-prod-*.tar.gz $HOME/grafo/deployment/

# Navigate and extract
cd $HOME/grafo/deployment
tar -xzf grafo-prod-*.tar.gz

# Enter directory
cd grafo-prod-*/
```

### 3. Run Deployment

```bash
# Make script executable (should already be, but just in case)
chmod +x deploy-from-dockerhub.sh

# Run deployment
./deploy-from-dockerhub.sh
```

The script will:
1. ✓ Verify Docker and Docker Compose are installed
2. ✓ Detect `docker compose` (V2) or `docker-compose` (V1)
3. ✓ Validate TLS certificate
4. ✓ Pull images from Docker Hub
5. ✓ Create `.env.production` with correct MongoDB connection
6. ✓ Create `docker-compose.dockerhub.yml` with `extra_hosts`
7. ✓ Stop and remove any existing services/containers/networks
8. ✓ Start new services
9. ✓ Verify health checks

### 4. Verify Deployment

```bash
# Check service health
curl http://localhost:8081/health    # Query Service
curl http://localhost:9083/health    # MCP Server

# View logs
docker compose -f docker-compose.dockerhub.yml --env-file .env.production logs -f

# Check container status
docker compose -f docker-compose.dockerhub.yml --env-file .env.production ps
```

## Expected Output

### Successful Detection (Recommended Path)

When MongoDB container is detected, you'll see:

```
╔══════════════════════════════════════════════════════╗
║         GRAFO Production Deployment                   ║
╚══════════════════════════════════════════════════════╝

🔍 Detectando configuración de MongoDB...
  ✓ MongoDB container detectado: mongodb-prod
  ✓ Red detectada: mongodb-network
  ℹ Se conectará directamente al contenedor (puerto interno 27017)

📦 Deployment de Grafo Production usando Docker Hub

Imágenes:
  - Query Service: rlyehdoom/grafo-query:latest
  - MCP Server: rlyehdoom/grafo-mcp:latest

MongoDB:
  - Host: mongodb-prod:27017
  - Modo: Conexión directa a contenedor (red: mongodb-network)
  - Database: GraphDB

...

╔════════════════════════════════════════════════════════╗
║                                                        ║
║  ✓ Deployment completado exitosamente                 ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

📡 Servicios disponibles:
  • Query Service (REST API): http://localhost:8081
  • Query Service Docs: http://localhost:8081/docs
  • MCP Server (SSE): http://localhost:9083/sse
  • MCP Server Health: http://localhost:9083/health

⚠️  Nota: Los servicios se conectan a MongoDB productivo en mongodb-prod:27017
```

### Fallback Mode (MongoDB Not Detected)

If MongoDB container is not detected, you'll see:

```
🔍 Detectando configuración de MongoDB...
  ⚠ MongoDB container no detectado automáticamente
  ℹ Usando conexión por host: 172.17.0.1:28101

MongoDB:
  - Host: 172.17.0.1:28101
  - Modo: Conexión por host gateway
  - Database: GraphDB
```

## Troubleshooting

### MongoDB Connection Still Fails

1. **Verify MongoDB container is running:**
   ```bash
   docker ps | grep mongo
   ```

2. **Check MongoDB port is exposed:**
   ```bash
   netstat -ln | grep 28101
   ```

3. **Test MongoDB connection from host:**
   ```bash
   mongosh "mongodb://user:pass@localhost:28101/GraphDB?authSource=admin&tls=true&tlsAllowInvalidCertificates=true"
   ```

4. **Check container networks:**
   ```bash
   docker network ls
   docker network inspect grafo-network-prod-dh
   ```

### Services Not Starting

1. **View detailed logs:**
   ```bash
   docker compose -f docker-compose.dockerhub.yml --env-file .env.production logs
   ```

2. **Check specific service:**
   ```bash
   docker compose -f docker-compose.dockerhub.yml --env-file .env.production logs query-service
   docker compose -f docker-compose.dockerhub.yml --env-file .env.production logs mcp-server
   ```

### Docker Compose Command Not Found

The script auto-detects the correct command, but if you need to run manually:

```bash
# Try V2 first (modern)
docker compose version

# If that fails, try V1
docker-compose version
```

## Files in This Package

```
grafo-prod-YYYYMMDD-HHMMSS/
├── deploy-from-dockerhub.sh    # Main deployment script with MongoDB fix
├── Certs/
│   └── prod/
│       └── client.pem          # MongoDB TLS certificate
└── README.txt                  # Quick start guide
```

## Security Notes

- The TLS certificate `client.pem` is **private** and should be kept secure
- MongoDB credentials are embedded in the connection string
- The `.env.production` file is auto-generated and contains sensitive data
- Never commit these files to public repositories

## Container Cleanup Process

Before starting new services, the deployment script performs a thorough cleanup to prevent conflicts:

### Step 1: Docker Compose Down
```bash
# Attempt to stop services using docker-compose (if they exist)
docker compose -f docker-compose.dockerhub.yml --env-file .env.production down 2>/dev/null || true
docker compose -f docker-compose.prod.yml --env-file .env.prod down 2>/dev/null || true
```

### Step 2: Remove Specific Containers
The script checks for and removes containers by exact name:
- `grafo-query-service-prod-dh`
- `grafo-mcp-server-prod-dh`

```bash
# For each container:
if docker ps -a --format '{{.Names}}' | grep -q "^container-name$"; then
  docker stop container-name 2>/dev/null || true
  docker rm container-name 2>/dev/null || true
fi
```

This ensures that even if containers were created manually or are orphaned, they will be cleaned up.

### Step 3: Remove Network
The script removes the Docker network `grafo-network-prod-dh` **only if** it has no other containers connected:

```bash
# Check if network exists
if docker network ls --format '{{.Name}}' | grep -q "^grafo-network-prod-dh$"; then
  # Verify no containers are connected
  if [ network is empty ]; then
    docker network rm grafo-network-prod-dh
  fi
fi
```

### Why This Matters

**Problem**: Docker containers with duplicate names cause deployment failures:
```
Error response from daemon: Conflict. The container name "/grafo-query-service-prod-dh"
is already in use by container "abc123". You have to remove (or rename) that container
to be able to reuse that name.
```

**Solution**: The script proactively removes any existing containers with the same names before attempting to create new ones. This allows for:
- ✓ Idempotent deployments (can run multiple times safely)
- ✓ Clean upgrades (removes old versions before installing new)
- ✓ Recovery from failed deployments (cleans up partial state)

## Version History

### Latest - v3.0 (20251118-215231)
🎯 **Major Update: Automatic MongoDB Container Detection**

- ✅ **Auto-detects MongoDB container** running on port 28101
- ✅ **Connects to MongoDB's Docker network** for direct communication
- ✅ **Uses container name + port 27017** (internal) instead of IP + 28101
- ✅ **Generates docker-compose dynamically** based on detection
- ✅ **Fallback to gateway IP** if MongoDB container not found
- ✅ **No more connection timeouts** with proper network configuration
- ✅ Container cleanup to prevent name conflicts
- ✅ Network cleanup with safety check
- ✅ Auto-detect Docker Compose V2/V1
- ✅ Ubuntu-specific deployment paths

**Breaking Change:** The script now requires MongoDB to be in a Docker container for optimal performance. If MongoDB is not detected, it falls back to gateway IP (may have connectivity issues).

### v2.0 (Previous)
- Gateway IP detection for MongoDB connection
- Removed `extra_hosts` configuration (didn't work reliably on Linux)
- Added container and network cleanup

### v1.0 (Initial)
- Docker Hub image deployment
- TLS certificate support
- Production environment configuration
- Basic MongoDB connection (external IP)
