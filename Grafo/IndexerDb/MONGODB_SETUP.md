# MongoDB Setup Guide for IndexerDb

Esta guía explica cómo configurar MongoDB para IndexerDb, incluyendo autenticación y diferentes escenarios de despliegue.

## 🚀 Instalación Rápida (Desarrollo)

### Option 1: MongoDB sin Autenticación (Desarrollo Local)

```bash
# 1. Instalar MongoDB Community Edition
# Descargar desde: https://www.mongodb.com/try/download/community

# 2. Iniciar MongoDB sin autenticación
mongod --dbpath C:\data\db

# 3. Configurar IndexerDb
```

**Configuración en `appsettings.json`:**
```json
{
  "MongoDB": {
    "ConnectionString": "mongodb://localhost:27017",
    "DatabaseName": "GraphDB",
    "CollectionName": "graphs",
    "EnableAuth": false
  },
  "Application": {
    "EnableMongoDB": true,
    "MockDataMode": false
  }
}
```

### Option 2: Usar Servicio Mock (Sin MongoDB)

**Configuración en `appsettings.json`:**
```json
{
  "Application": {
    "EnableMongoDB": false,
    "MockDataMode": true
  }
}
```

## 🔐 Configuración con Autenticación (Producción)

### 1. Crear Usuario de Base de Datos

```javascript
// Conectar a MongoDB
mongo

// Cambiar a base de datos admin
use admin

// Crear usuario administrador
db.createUser({
  user: "admin",
  pwd: "secure_admin_password",
  roles: ["userAdminAnyDatabase", "readWriteAnyDatabase"]
})

// Crear usuario específico para GraphDB
use GraphDB
db.createUser({
  user: "graphdb_user",
  pwd: "secure_graphdb_password", 
  roles: ["readWrite"]
})
```

### 2. Iniciar MongoDB con Autenticación

```bash
# Iniciar MongoDB con autenticación habilitada
mongod --auth --dbpath C:\data\db
```

### 3. Configurar IndexerDb para Autenticación

**Configuración en `appsettings.json`:**
```json
{
  "MongoDB": {
    "ConnectionString": "mongodb://localhost:27017",
    "DatabaseName": "GraphDB",
    "CollectionName": "graphs",
    "Username": "graphdb_user",
    "Password": "secure_graphdb_password",
    "AuthDatabase": "admin",
    "EnableAuth": true
  },
  "Application": {
    "EnableMongoDB": true,
    "MockDataMode": false
  }
}
```

## 🐳 Docker Setup

### MongoDB con Docker Compose

**Crear `docker-compose.mongodb.yml`:**
```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:8.0
    container_name: indexerdb-mongo
    restart: always
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin_password
      MONGO_INITDB_DATABASE: GraphDB
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro

volumes:
  mongodb_data:
```

**Crear `mongo-init.js`:**
```javascript
// Crear base de datos y usuario para GraphDB
db = db.getSiblingDB('GraphDB');
db.createUser({
  user: 'graphdb_user',
  pwd: 'graphdb_password',
  roles: [
    {
      role: 'readWrite',
      db: 'GraphDB'
    }
  ]
});
```

**Ejecutar:**
```bash
docker-compose -f docker-compose.mongodb.yml up -d
```

**Configuración IndexerDb para Docker:**
```json
{
  "MongoDB": {
    "ConnectionString": "mongodb://localhost:27017",
    "DatabaseName": "GraphDB", 
    "Username": "graphdb_user",
    "Password": "graphdb_password",
    "AuthDatabase": "GraphDB",
    "EnableAuth": true
  }
}
```

## ☁️ MongoDB Atlas (Cloud)

### 1. Crear Cluster en MongoDB Atlas
1. Ir a [MongoDB Atlas](https://cloud.mongodb.com)
2. Crear cuenta y nuevo cluster
3. Configurar usuario y contraseña
4. Agregar IP address a whitelist

### 2. Configurar IndexerDb para Atlas

```json
{
  "MongoDB": {
    "ConnectionString": "mongodb+srv://cluster0.xxxxx.mongodb.net",
    "DatabaseName": "GraphDB",
    "Username": "your_atlas_username", 
    "Password": "your_atlas_password",
    "AuthDatabase": "admin",
    "EnableAuth": true
  }
}
```

## 🔧 Configuraciones Avanzadas

### Variables de Entorno

Puedes usar variables de entorno para configuración sensible:

```bash
export MONGODB_USERNAME="graphdb_user"
export MONGODB_PASSWORD="secure_password"
export MONGODB_CONNECTION="mongodb://localhost:27017"
```

### Múltiples Entornos

**appsettings.Development.json:**
```json
{
  "Application": {
    "EnableMongoDB": false,
    "MockDataMode": true
  }
}
```

**appsettings.Production.json:**
```json
{
  "MongoDB": {
    "ConnectionString": "mongodb://prod-server:27017",
    "EnableAuth": true,
    "Username": "prod_user",
    "Password": "prod_password"
  },
  "Application": {
    "EnableMongoDB": true
  }
}
```

## 🚨 Solución de Problemas

### Error: "Command aggregate requires authentication"
- ✅ Verificar que `EnableAuth: true` en configuración
- ✅ Confirmar username/password correctos
- ✅ Verificar que el usuario tiene permisos en la base de datos

### Error: "No connection could be made"
- ✅ Verificar que MongoDB esté ejecutándose
- ✅ Confirmar puerto 27017 disponible
- ✅ Revisar firewall/antivirus

### Fallback Automático
IndexerDb automáticamente usará el servicio mock si:
- MongoDB no está disponible
- Fallan las credenciales
- `EnableMongoDB: false` en configuración

### Verificar Conexión

```javascript
// Conectar y verificar
mongo --username graphdb_user --password --authenticationDatabase admin
use GraphDB
db.projects.count()
```

## 📊 Monitoreo

### Logs de Conexión
IndexerDb mostrará en los logs:
- ✅ Conexión exitosa a MongoDB
- 🔐 Uso de autenticación
- 🔧 Fallback a servicio mock
- ⚠️ Errores de conexión

### Comandos de Verificación

```bash
# Verificar estado del servicio
dotnet run -- --help

# Comprobar conexión en modo interactivo
dotnet run
# En el prompt: count
```

## 📚 Recursos Adicionales

- [MongoDB Documentation](https://docs.mongodb.com/)
- [MongoDB .NET Driver](https://mongodb.github.io/mongo-csharp-driver/)
- [MongoDB Atlas Setup](https://docs.atlas.mongodb.com/getting-started/)
- [Docker MongoDB](https://hub.docker.com/_/mongo)
