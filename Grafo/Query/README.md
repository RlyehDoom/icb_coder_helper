# Grafo Query Service

API REST para consultar el grafo de código C# almacenado en MongoDB. Este servicio está diseñado para ser consumido por el MCP (Model Context Protocol) cuando necesita información contextual del código para asistir en la generación y modificación de código.

## 🎯 Propósito

Este servicio actúa como intermediario entre:
- **MCP**: Necesita contexto de código para generar/modificar código
- **MongoDB**: Base de datos del grafo procesada por IndexerDb

## 🏗️ Arquitectura

```
┌─────────────┐         ┌─────────────────┐         ┌──────────────┐
│    MCP      │ ─────>  │  Query Service  │ ─────>  │   MongoDB    │
│  (Client)   │  HTTP   │   (FastAPI)     │         │  (GraphDB)   │
└─────────────┘         └─────────────────┘         └──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  IndexerDb   │
                        │ (Procesador) │
                        └──────────────┘
```

## 🎮 Descripción

El Query Service es una **REST API** construida con FastAPI que expone endpoints para consultar el grafo de código C#.

**Puerto:** 8081

**Inicio:**
```bash
python -m uvicorn src.server:app --host 0.0.0.0 --port 8081 --reload
```

**Uso:** Consultas HTTP desde cualquier cliente (MCP Server, aplicaciones web, scripts, etc.)

---

## 📋 Características

### Endpoints Principales (REST API)

#### 1. Proyectos
- `GET /api/projects/` - Lista todos los proyectos
- `POST /api/projects/search` - Búsqueda de proyectos
- `GET /api/projects/{project_id}` - Obtener proyecto específico
- `GET /api/projects/layers/statistics` - Estadísticas por capa

#### 2. Nodos
- `POST /api/nodes/search` - Búsqueda de nodos (clases, métodos, etc.)
- `GET /api/nodes/{node_id}` - Obtener nodo específico
- `GET /api/nodes/project/{project_id}` - Nodos de un proyecto

#### 3. Aristas (Relaciones)
- `GET /api/edges/project/{project_id}` - Aristas de un proyecto
- `POST /api/edges/related` - Obtener nodos relacionados

#### 4. Contexto (Especializado para MCP)
- `POST /api/context/code` - **Endpoint principal para el MCP**
- `GET /api/context/statistics` - Estadísticas del grafo (incluye métricas de Semantic Model)

#### 5. Semantic Model 🔬
- `GET /api/semantic/stats` - **Estadísticas completas del Semantic Model**
- `GET /api/semantic/inherits` - Relaciones de herencia (Inherits)
- `GET /api/semantic/implements` - Implementaciones de interfaces (Implements)
- `GET /api/semantic/calls` - Llamadas a métodos (Calls)
- `GET /api/semantic/uses` - Usos de tipos (Uses)
- `POST /api/semantic/hierarchy` - Jerarquía de herencia de una clase
- `POST /api/semantic/implementations` - Todas las implementaciones de una interfaz

### Endpoint Especializado para MCP

El endpoint `/api/context/code` está diseñado específicamente para el MCP:

```json
POST /api/context/code
{
  "className": "UserService",
  "methodName": "CreateUser",
  "namespace": "Banking.Core",
  "projectName": "Banking.Core",
  "includeRelated": true,
  "maxRelated": 10
}
```

**Respuesta:**
```json
{
  "found": true,
  "mainElement": {
    "Id": "method:UserService.CreateUser",
    "Name": "CreateUser",
    "Type": "Method",
    "Project": "Banking.Core",
    "Namespace": "Banking.Core.Services"
  },
  "relatedElements": [...],
  "edges": [...],
  "projectInfo": {...},
  "suggestions": [
    "Este método tiene 15 dependencias. Considera refactorizar...",
    "Namespace actual: Banking.Core.Services. Mantén consistencia..."
  ]
}
```

---

### 🔬 Endpoints de Semantic Model

El servicio Query ahora incluye soporte completo para consultas del **Semantic Model** generado por RoslynIndexer:

#### Estadísticas Semánticas
```bash
GET /api/semantic/stats
```

**Respuesta:**
```json
{
  "relationships": {
    "Inherits": 6013,
    "Implements": 271,
    "Calls": 7191,
    "Uses": 3312,
    "Contains": 42156,
    "Other": 0
  },
  "totalSemanticEdges": 16787,
  "totalEdges": 89342,
  "nodes": {
    "classesWithNamespace": 10623,
    "totalClasses": 10623,
    "interfacesWithNamespace": 335,
    "totalInterfaces": 335
  }
}
```

#### Relaciones de Herencia
```bash
GET /api/semantic/inherits?limit=10
```

**Respuesta:**
```json
{
  "relationshipType": "Inherits",
  "count": 10,
  "relationships": [
    {
      "source": "class:UserService",
      "target": "class:BaseService",
      "relationship": "Inherits",
      "projectId": "Banking.Core",
      "projectName": "Banking.Core"
    }
  ]
}
```

#### Jerarquía de Herencia
```bash
POST /api/semantic/hierarchy
{
  "classId": "class:UserService",
  "maxDepth": 5
}
```

**Respuesta:**
```json
{
  "found": true,
  "class": {
    "id": "class:UserService",
    "name": "UserService",
    "fullName": "Banking.Core.Services.UserService",
    "namespace": "Banking.Core.Services",
    "isAbstract": false,
    "isSealed": false
  },
  "ancestors": [
    {
      "id": "class:BaseService",
      "name": "BaseService",
      "fullName": "Banking.Common.BaseService",
      "namespace": "Banking.Common",
      "depth": 1
    }
  ],
  "descendants": [
    {
      "id": "class:AdminUserService",
      "name": "AdminUserService",
      "fullName": "Banking.Admin.Services.AdminUserService",
      "namespace": "Banking.Admin.Services"
    }
  ],
  "hierarchyDepth": 1
}
```

#### Implementaciones de Interfaz
```bash
POST /api/semantic/implementations
{
  "interfaceId": "interface:IUserRepository"
}
```

**Respuesta:**
```json
{
  "found": true,
  "interface": {
    "id": "interface:IUserRepository",
    "name": "IUserRepository",
    "fullName": "Banking.Core.Interfaces.IUserRepository",
    "namespace": "Banking.Core.Interfaces"
  },
  "implementations": [
    {
      "id": "class:UserRepository",
      "name": "UserRepository",
      "fullName": "Banking.Infrastructure.Repositories.UserRepository",
      "namespace": "Banking.Infrastructure.Repositories",
      "projectId": "Banking.Infrastructure",
      "isAbstract": false
    }
  ],
  "implementationCount": 1
}
```

## 🚀 Instalación y Ejecución

### Prerequisitos

- Python 3.11+
- MongoDB con la base de datos GraphDB (configurada por IndexerDb)
- Acceso a la colección `projects`

### Instalación Local

1. **Usar script de inicio rápido (Recomendado):**
   ```bash
   cd Grafo/Query
   chmod +x quick_start.sh
   ./quick_start.sh
   ```

2. **Instalación manual:**
   ```bash
   cd Grafo/Query
   
   # Crear entorno virtual
   python3 -m venv venv
   source venv/bin/activate
   
   # Instalar dependencias
   pip install -r requirements.txt
   
   # Configurar variables de entorno
   cp .env.example .env
   # Editar .env con tus configuraciones
   
   # Ejecutar servidor
   python -m uvicorn src.server:app --host 0.0.0.0 --port 8081 --reload
   ```

3. **Acceder a la documentación:**
   - Swagger UI: http://localhost:8081/docs
   - ReDoc: http://localhost:8081/redoc

### Ejecución con Docker

1. **Construir imagen:**
   ```bash
   docker build -t grafo-query-service:latest .
   ```

2. **Ejecutar con Docker Compose:**
   ```bash
   docker-compose up -d
   ```

3. **Detener:**
   ```bash
   docker-compose down
   ```

### Uso del Script makefile.sh

El proyecto incluye un script `makefile.sh` compatible con Linux, macOS y Windows (Git Bash/WSL):

```bash
# Ver comandos disponibles
./makefile.sh help

# Instalación
./makefile.sh install

# Desarrollo
./makefile.sh dev

# Docker
./makefile.sh docker-build
./makefile.sh docker-run
./makefile.sh docker-stop
./makefile.sh docker-logs

# Utilidad
./makefile.sh clean
./makefile.sh test
./makefile.sh lint
```

**Nota:** El script detecta automáticamente si usar `python` o `python3` según tu sistema operativo.

## ⚙️ Configuración

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `MONGODB_CONNECTION_STRING` | Cadena de conexión a MongoDB | `mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/` |
| `MONGODB_DATABASE` | Nombre de la base de datos | `GraphDB` |
| `MONGODB_PROJECTS_COLLECTION` | Colección de proyectos | `projects` |
| `SERVER_HOST` | Host del servidor | `0.0.0.0` |
| `SERVER_PORT` | Puerto del servidor | `8081` |
| `LOG_LEVEL` | Nivel de logging | `INFO` |
| `CORS_ORIGINS` | Orígenes permitidos para CORS | `*` |

### Configuración Compatible con IndexerDb

El servicio Query está configurado para usar la misma base de datos que IndexerDb:

```json
// appsettings.json de IndexerDb
{
  "MongoDB": {
    "ConnectionString": "mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/",
    "DatabaseName": "GraphDB"
  }
}
```

## 🔗 Integración con MCP Server

El **MCP Server** (puerto 8083) consume este Query Service para exponer herramientas de consulta de código a IDEs como Cursor/VSCode.

**Arquitectura:**
```
Cursor/VSCode  →  MCP Server (8083, HTTP/SSE)  →  Query Service (8081)  →  MongoDB
```

El MCP Server está configurado para conectarse al Query Service usando `http://mongodb:27019/` cuando ambos están en la misma red Docker (`grafo-network`).

## 📊 Casos de Uso

### 1. MCP Generando Código Nuevo

**Escenario:** El usuario pide "Crea un nuevo servicio de autenticación"

**MCP consulta:**
```python
# MCP busca servicios similares existentes
context = get_code_context(
    class_name="AuthService",
    namespace="Banking.Core"
)
```

**Query Service responde:**
- Encuentra servicios similares
- Muestra sus dependencias
- Sugiere patrones comunes

### 2. MCP Modificando Código

**Escenario:** El usuario pide "Agrega logging al método CreateUser"

**MCP consulta:**
```python
context = get_code_context(
    class_name="UserService",
    method_name="CreateUser"
)
```

**Query Service responde:**
- Encuentra el método específico
- Muestra sus dependencias
- Sugiere dónde agregar logging

### 3. Análisis de Impacto

**Escenario:** El usuario pregunta "¿Qué usa la clase UserRepository?"

**MCP consulta relacionados:**
```python
# Obtener nodos relacionados
related = get_related_nodes(
    node_id="class:UserRepository",
    direction="outgoing",
    relationship_type="Uses"
)
```

## 🧪 Testing

### Health Check

```bash
curl http://localhost:8081/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "service": "Grafo Query Service",
  "version": "1.0.0",
  "mongodb": "connected"
}
```

### Búsqueda de Proyectos

```bash
curl -X POST http://localhost:8081/api/projects/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Banking", "limit": 10}'
```

### Búsqueda de Nodos

```bash
curl -X POST http://localhost:8081/api/nodes/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "UserService",
    "nodeType": "Class",
    "limit": 5
  }'
```

### Contexto de Código (MCP)

```bash
curl -X POST http://localhost:8081/api/context/code \
  -H "Content-Type: application/json" \
  -d '{
    "className": "UserService",
    "methodName": "CreateUser",
    "includeRelated": true,
    "maxRelated": 10
  }'
```

## 🔧 Desarrollo

### Estructura del Proyecto

```
Grafo/Query/
├── src/
│   ├── __init__.py
│   ├── server.py              # Servidor FastAPI principal
│   ├── config.py              # Configuración
│   ├── models.py              # Modelos Pydantic
│   ├── services/
│   │   ├── __init__.py
│   │   ├── mongodb_service.py # Conexión a MongoDB
│   │   └── graph_service.py   # Lógica de consultas
│   └── routes/
│       ├── __init__.py
│       ├── projects.py        # Endpoints de proyectos
│       ├── nodes.py           # Endpoints de nodos
│       ├── edges.py           # Endpoints de aristas
│       └── context.py         # Endpoints para MCP
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── .env.example
└── README.md
```

### Agregar Nuevos Endpoints

1. Crear archivo en `src/routes/`
2. Definir router con `APIRouter`
3. Registrar en `src/server.py`

### Agregar Nuevas Consultas

1. Agregar método en `GraphQueryService`
2. Crear endpoint en el router apropiado
3. Documentar en README

## 🐛 Troubleshooting

### Error de Conexión a MongoDB

```
Error: Connection refused to MongoDB
```

**Solución:**
- Verificar que MongoDB esté ejecutándose
- Verificar `MONGODB_CONNECTION_STRING` en `.env`
- Verificar credenciales

### Puerto 8081 en Uso

```
Error: Address already in use
```

**Solución:**
```bash
# Cambiar puerto en .env
SERVER_PORT=8082
```

### Colección Vacía

```
Response: {"totalProjects": 0}
```

**Solución:**
- Ejecutar IndexerDb primero para procesar el grafo
- Verificar que la colección `projects` exista en MongoDB

## 📚 Referencias

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Motor (MongoDB Async Driver)](https://motor.readthedocs.io/)
- [Pydantic](https://docs.pydantic.dev/)
- [IndexerDb README](../IndexerDb/README.md)

## 🔄 Roadmap

- [ ] Implementar caché de consultas frecuentes
- [ ] Agregar autenticación con API keys
- [ ] Implementar rate limiting
- [ ] Agregar métricas y monitoring
- [ ] Implementar pruebas unitarias y de integración
- [ ] Agregar soporte para GraphQL
- [ ] Optimizar consultas complejas con índices MongoDB

## 📝 Licencia

Este proyecto es parte del sistema Grafo de ICGuru.

---

**Versión:** 1.0.0  
**Última actualización:** Octubre 2024

