# Ecosistema Grafo - Visión General

Este documento proporciona una visión completa de cómo todos los componentes del sistema Grafo trabajan juntos.

## 🌐 Arquitectura Completa

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CURSOR/VSCode (IDE)                             │
│                    Usuario Final Interactuando                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTP/SSE (http://localhost:8083/sse)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Server                                   │
│              (Model Context Protocol - Puerto 8083)                 │
│  • Servidor HTTP/SSE para múltiples clientes                        │
│  • Expone herramientas de consulta de código                        │
│  • Ejecuta consultas al Query Service                               │
└───────────┬─────────────────────────────────────────────────────────┘
            │
            │ HTTP REST (interno en grafo-network)
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Query Service                                 │
│                    (API REST - Puerto 8081)                         │
│  • Expone endpoints para consultar el grafo                         │
│  • Provee contexto de código                                        │
│  • Búsquedas optimizadas                                            │
└───────────┬─────────────────────────────────────────────────────────┘
            │
            │ Motor (Async MongoDB Driver)
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MongoDB                                     │
│                (GraphDB Database - Puerto 27019)                    │
│  • Colección: projects                                              │
│  • Colección: processing_states                                     │
│  • Almacena grafo completo del código                               │
└───────────┬─────────────────────────────────────────────────────────┘
            │
            │ Escritura/Lectura
            ▲
┌─────────────────────────────────────────────────────────────────────┐
│                        IndexerDb                                    │
│                    (.NET 8 Console App)                             │
│  • Procesa archivos de grafo JSON                                   │
│  • Almacena en MongoDB por proyecto                                 │
│  • Detección incremental de cambios                                 │
└───────────┬─────────────────────────────────────────────────────────┘
            │
            │ Lee JSON
            ▲
┌─────────────────────────────────────────────────────────────────────┐
│                         Indexer                                     │
│                  (.NET 8 - Roslyn Based)                            │
│  • Analiza código fuente C#                                         │
│  • Genera grafo JSON (nodos + aristas)                              │
│  • Output: *-graph.json                                             │
└───────────┬─────────────────────────────────────────────────────────┘
            │
            │ Analiza
            ▲
┌─────────────────────────────────────────────────────────────────────┐
│                      Código Fuente C#                               │
│                     (Repositorio Clonado)                           │
│  • Proyectos .csproj                                                │
│  • Soluciones .sln                                                  │
│  • Código fuente .cs                                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Red Docker:** Todos los servicios (MongoDB, Query Service, MCP Server) ejecutan en la misma red `grafo-network` para comunicación eficiente.

## 🔄 Flujo de Datos Completo

### Fase 1: Indexación (Offline)

```
Código C# (.cs, .csproj, .sln)
    ↓
[Indexer] Analiza con Roslyn
    ↓
Grafo JSON (*-graph.json)
    {
      "nodes": [...],
      "edges": [...]
    }
    ↓
[IndexerDb] Procesa y almacena
    ↓
MongoDB (GraphDB.projects)
    Proyectos individuales con nodos/aristas
```

### Fase 2: Consulta (Online/Tiempo Real)

```
Usuario en Cursor: "Crea un servicio de autenticación"
    ↓
[MCP Server] (puerto 8083) Recibe consulta vía HTTP/SSE
    ↓
[MCP Server] Interpreta y decide usar herramienta search_code
    ↓
HTTP POST → [Query Service] (puerto 8081) /api/nodes/search
    ↓
[Query Service] Consulta MongoDB (puerto 27019)
    ↓
MongoDB retorna proyectos, nodos, aristas relevantes
    ↓
[Query Service] Formatea respuesta + sugerencias
    ↓
[MCP Server] Recibe contexto y genera respuesta
    ↓
Cursor muestra al usuario código generado con contexto
```

## 📊 Componentes Detallados

### 1. Indexer (Roslyn-based)
**Ubicación:** `/Grafo/Indexer/`  
**Tecnología:** .NET 8, Roslyn  
**Función:** Analizar código C# y generar grafo

**Input:**
- Código fuente C#
- Proyectos .csproj
- Soluciones .sln

**Output:**
```json
{
  "metadata": {
    "source": "Infocorp.Banking.sln",
    "timestamp": "2024-10-14T..."
  },
  "nodes": [
    {
      "Id": "class:UserService",
      "Name": "UserService",
      "Type": "Class",
      "Namespace": "Banking.Core"
    }
  ],
  "edges": [
    {
      "Source": "class:UserService",
      "Target": "interface:IUserService",
      "Relationship": "Implements"
    }
  ]
}
```

**Ejecutar:**
```bash
cd Grafo/Indexer
dotnet run -- --solution "path/to/solution.sln"
```

### 2. IndexerDb (MongoDB Processor)
**Ubicación:** `/Grafo/IndexerDb/`  
**Tecnología:** .NET 8, MongoDB.Driver  
**Función:** Procesar JSON y almacenar en MongoDB

**Características:**
- Procesamiento incremental (solo cambios)
- Almacenamiento por proyecto
- Detección de cambios con hashing
- Modo interactivo para consultas

**Ejecutar:**
```bash
cd Grafo/IndexerDb
dotnet run --interactive
```

**Datos almacenados:**
```json
{
  "_id": ObjectId("..."),
  "ProjectId": "project:Banking.Core",
  "ProjectName": "Banking.Core",
  "Layer": "Core",
  "NodeCount": 450,
  "EdgeCount": 892,
  "Nodes": [...],
  "Edges": [...],
  "ContentHash": "abc123...",
  "LastProcessed": "2024-10-14T..."
}
```

### 3. Query Service (REST API)
**Ubicación:** `/Grafo/Query/`
**Tecnología:** Python 3.11, FastAPI, Motor
**Función:** Exponer API para consultar el grafo

**Puerto:** 8081
**Documentación:** http://localhost:8081/docs

**Endpoints principales:**
- `POST /api/context/code` - Contexto para MCP
- `POST /api/nodes/search` - Búsqueda de nodos
- `POST /api/projects/search` - Búsqueda de proyectos
- `GET /health` - Health check

**Ejecutar:**
```bash
# Usando CLI de Grafo
grafo query build
grafo query start

# O directamente
cd Grafo/Query
python -m uvicorn src.server:app --host 0.0.0.0 --port 8081 --reload
```

### 4. MCP Server (Model Context Protocol)
**Ubicación:** `/Grafo/Query/` (integrado con Query)
**Tecnología:** Python 3.11, FastAPI, SSE, MCP SDK
**Función:** Servidor MCP sobre HTTP/SSE para múltiples clientes

**Puerto:** 8083
**Conexión:** Cursor/VSCode vía HTTP/SSE (`http://localhost:8083/sse`)

**Herramientas disponibles:**
- `search_code()` - Búsqueda de elementos de código
- `get_code_context()` - Contexto detallado con relaciones
- `list_projects()` - Lista proyectos disponibles
- `get_project_structure()` - Estructura de proyecto
- `find_implementations()` - Implementaciones/herencias
- `get_statistics()` - Estadísticas del grafo

**Ejecutar:**
```bash
# Usando CLI de Grafo (recomendado)
grafo mcp build
grafo mcp start

# El CLI mostrará la configuración JSON para Cursor
```

**Configurar en Cursor:**
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

## 🚀 Setup Completo del Ecosistema

### Prerequisitos
- ✅ Docker Desktop (para MongoDB y servicios)
- ✅ .NET 8 SDK (para Indexer/IndexerDb)
- ✅ Node.js 18+ (para CLI de Grafo)

### Paso 0: Instalar CLI de Grafo
```bash
cd Grafo
npm install
npm link

# Verificar instalación
grafo --version
```

### Paso 1: Iniciar MongoDB
```bash
# Usando CLI de Grafo (recomendado)
grafo mongodb start

# Verificar
grafo mongodb status

# El CLI usa puerto 27019 y red grafo-network
```

### Paso 2: Indexer + IndexerDb (Indexación inicial)
```bash
# 1. Clonar repositorio a analizar
cd Grafo/Repo/Cloned
git clone <repository-url> ICB7C

# 2. Ejecutar Indexer
cd ../../Indexer
dotnet build
dotnet run -- --solution "../Repo/Cloned/ICB7C/Infocorp.Banking.sln"

# 3. Ejecutar IndexerDb para almacenar
cd ../IndexerDb
dotnet build
dotnet run --all

# Verificar datos
dotnet run --interactive
> count
> projects list
```

### Paso 3: Iniciar MCP Server
```bash
# Construir imagen Docker del MCP Server
grafo mcp build

# Iniciar MCP Server (inicia MongoDB automáticamente si no está corriendo)
grafo mcp start

# El CLI mostrará la configuración para Cursor
# Copiar el JSON y agregarlo a ~/.cursor/mcp.json

# Verificar
grafo mcp status
```

### Paso 4: Configurar Cursor/VSCode
```bash
# El comando `grafo mcp status` muestra la configuración:
{
  "mcpServers": {
    "grafo-query-http": {
      "url": "http://localhost:8083/sse",
      "transport": "sse"
    }
  }
}

# Agregar esta configuración a:
# - Cursor: ~/.cursor/mcp.json
# - Windows Cursor: %APPDATA%\Cursor\User\mcp.json

# Reiniciar Cursor
```

## 🧪 Prueba End-to-End

### Escenario: Crear código con contexto del grafo

**1. Usuario en Cursor:**
```
"Crea un nuevo servicio de Productos similar al servicio de Usuarios"
```

**2. MCP Server ejecuta:**
```python
# La herramienta search_code busca servicios similares
search_code(query="UserService", node_type="Class", project="Banking.Core")
```

**3. MCP Server consulta al Query Service:**
```http
POST http://localhost:8081/api/nodes/search
{
  "query": "UserService",
  "nodeType": "Class",
  "limit": 10
}
```

**4. MongoDB retorna:**
```json
{
  "found": true,
  "mainElement": {
    "Name": "UserService",
    "Type": "Class",
    "Namespace": "Banking.Core.Services"
  },
  "relatedElements": [
    {"Name": "IUserRepository", "Type": "Interface"},
    {"Name": "CreateUser", "Type": "Method"},
    {"Name": "GetUser", "Type": "Method"}
  ],
  "suggestions": [
    "Este servicio implementa IUserRepository para acceso a datos",
    "Métodos siguen patrón CRUD estándar"
  ]
}
```

**5. MCP usa contexto:**
```csharp
// Genera código siguiendo el patrón encontrado
public class ProductService : IProductService
{
    private readonly IProductRepository _repository;
    
    public ProductService(IProductRepository repository)
    {
        _repository = repository;
    }
    
    // Métodos similares a UserService...
}
```

**6. Usuario recibe:**
Código generado que sigue los patrones arquitectónicos existentes en el proyecto.

## 📈 Métricas y Monitoreo

### MCP Server
```bash
# Ver estado del MCP Server
grafo mcp status

# Ver logs en tiempo real
grafo mcp logs

# Ejecutar tests
grafo mcp test
```

### Query Service
```bash
# Estadísticas del grafo
curl http://localhost:8081/api/context/statistics

# Health check
curl http://localhost:8081/health
```

### MongoDB
```bash
# Usando CLI de Grafo
grafo mongodb shell

# Manualmente con mongosh (MongoDB en puerto 27019)
mongosh "mongodb://localhost:27019/"

# Comandos útiles en mongosh:
use GraphDB
db.projects.countDocuments()
db.projects.find().limit(1).pretty()
```

### IndexerDb
```bash
cd Grafo/IndexerDb
dotnet run --interactive
> count
> layers
```

## 🔧 Mantenimiento

### Actualizar el Grafo (Re-indexar)
```bash
# 1. Re-ejecutar Indexer (si el código cambió)
cd Grafo/Indexer
dotnet run -- --solution "path/to/solution.sln"

# 2. Re-procesar con IndexerDb
cd ../IndexerDb
dotnet run --all

# Query Service reflejará cambios automáticamente
```

### Limpiar y Reiniciar
```bash
# Limpiar MongoDB (elimina TODOS los datos)
grafo mongodb clean

# O manualmente
grafo mongodb shell
# En mongosh:
use GraphDB
db.projects.deleteMany({})
db.processing_states.deleteMany({})
exit

# Re-indexar desde cero
# ... ejecutar Indexer + IndexerDb
```

## 📚 Documentación por Componente

- **README Principal:** `/Grafo/README.md` - Guía completa del usuario
- **Quick Start:** `/Grafo/QUICKSTART.md` - Setup en 5 minutos
- **Indexer:** `/Grafo/Indexer/README.md`
- **IndexerDb:** `/Grafo/IndexerDb/README.md`
- **Query Service:** `/Grafo/Query/README.md`

## 🐛 Troubleshooting Común

### Problema: MCP Server no inicia
**Causa:** MongoDB no está ejecutándose o Docker no está corriendo
**Solución:**
```bash
# Verificar Docker
docker --version
docker info

# Iniciar MongoDB
grafo mongodb start

# Iniciar MCP Server
grafo mcp start
```

### Problema: Cursor no puede conectar a MCP Server
**Causa:** MCP Server no está ejecutándose o configuración incorrecta
**Solución:**
```bash
# Verificar estado
grafo mcp status

# Ver logs
grafo mcp logs

# Reiniciar Cursor completamente
```

### Problema: MongoDB connection refused
**Causa:** MongoDB no está ejecutándose en puerto 27019
**Solución:**
```bash
# Ver estado de MongoDB
grafo mongodb status

# Iniciar MongoDB
grafo mongodb start

# Ver logs
grafo mongodb logs
```

### Problema: Query Service no encuentra datos
**Causa:** IndexerDb no ha procesado el código
**Solución:**
```bash
# Ejecutar Indexer primero
cd Grafo/Indexer
dotnet run -- --solution "path/to/solution.sln"

# Luego IndexerDb
cd ../IndexerDb
dotnet run --all
```

### Problema: Indexer falla al analizar código
**Causa:** Código C# no compila o tiene errores
**Solución:** Asegurar que el código compile antes de indexar

## 🎯 Casos de Uso

### 1. Generar Código Nuevo
**Objetivo:** Crear código siguiendo patrones existentes
**Componentes:** Cursor → MCP Server → Query Service → MongoDB
**Beneficio:** Código consistente con arquitectura
**Ejemplo:** "Crea un servicio de Productos similar a UserService"

### 2. Modificar Código Existente
**Objetivo:** Entender contexto antes de modificar
**Componentes:** MCP Server → Query Service (contexto + relaciones)
**Beneficio:** Cambios informados, menos errores
**Ejemplo:** "Modifica UserService para agregar validación de email"

### 3. Análisis de Impacto
**Objetivo:** Entender qué afecta un cambio
**Componentes:** Query Service (relaciones + dependencias)
**Beneficio:** Cambios seguros
**Ejemplo:** "¿Qué clases se romperán si cambio IUserRepository?"

### 4. Exploración de Arquitectura
**Objetivo:** Entender la estructura del sistema
**Componentes:** MCP Server herramientas de exploración
**Beneficio:** Onboarding más rápido, mejor comprensión
**Ejemplo:** "Dame la estructura del proyecto Banking.Core"

## 🔮 Futuro del Ecosistema

### Próximas Características
- [ ] Búsqueda semántica con embeddings
- [ ] Análisis de cambios en tiempo real
- [ ] Visualización web del grafo
- [ ] Detección automática de code smells
- [ ] Sugerencias de arquitectura

### Integraciones Futuras
- [ ] GitHub Actions (CI/CD)
- [ ] Azure DevOps
- [ ] SonarQube
- [ ] Slack notifications

---

**Última actualización:** Octubre 2024  
**Versión del Ecosistema:** 1.0.0  
**Estado:** ✅ Funcional y listo para uso

