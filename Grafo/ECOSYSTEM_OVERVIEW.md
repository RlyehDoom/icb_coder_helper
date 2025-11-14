# Ecosistema Grafo - Visión General

Este documento proporciona una visión completa de cómo todos los componentes del sistema Grafo trabajan juntos.

## 🌐 Arquitectura Completa

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CURSOR (IDE)                                │
│                    Usuario Final Interactuando                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ Consultas naturales
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            MCP                                      │
│                  (Model Context Protocol)                           │
│  • Recibe consultas del usuario                                     │
│  • Ejecuta herramientas                                             │
│  • Genera respuestas con LLM                                        │
└───────────┬─────────────────────────────────────────────────────────┘
            │
            │ HTTP REST
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
│                    (GraphDB Database)                               │
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
[MCP] Interpreta y decide usar herramienta de grafo
    ↓
[MCP Tool] get_code_context_from_graph("AuthService")
    ↓
HTTP POST → [Query Service] /api/context/code
    ↓
[Query Service] Consulta MongoDB
    ↓
MongoDB retorna proyectos, nodos, aristas relevantes
    ↓
[Query Service] Formatea respuesta + sugerencias
    ↓
[MCP] Recibe contexto y genera respuesta
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
cd Grafo/Query
make dev
```

### 4. MCP (Model Context Protocol)
**Ubicación:** `/MCP/`  
**Tecnología:** Python, FastMCP  
**Función:** Intermediario entre Cursor y servicios

**Puerto:** 8080  
**Conexión:** Cursor vía MCP protocol

**Herramientas que usarán Query:**
- `get_code_context_from_graph()` - Contexto de código
- `search_similar_code_in_graph()` - Búsqueda de patrones
- `get_graph_statistics()` - Estadísticas

**Integrar:** Ver `/Grafo/Query/INTEGRATION_MCP.md`

## 🚀 Setup Completo del Ecosistema

### Prerequisitos
- ✅ .NET 8 SDK
- ✅ Python 3.11+
- ✅ MongoDB 8.0+
- ✅ Node.js (para MCP Inspector opcional)

### Paso 1: MongoDB
```bash
# Iniciar MongoDB
docker run -d \
  --name mongodb-grafo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=InfocorpAI \
  -e MONGO_INITDB_ROOT_PASSWORD=InfocorpAI2025 \
  mongo:8.0

# O usar MongoDB Atlas (Cloud)
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

### Paso 3: Query Service
```bash
cd Grafo/Query

# Opción A: Script automático (Recomendado)
chmod +x quick_start.sh
./quick_start.sh

# Opción B: Manual
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Editar .env si es necesario
python -m uvicorn src.server:app --host 0.0.0.0 --port 8081 --reload

# Verificar
curl http://localhost:8081/health
```

### Paso 4: MCP (Integración)
```bash
cd MCP

# 1. Agregar dependencia
echo "requests>=2.31.0" >> requirements.txt
pip install requests

# 2. Crear herramienta de grafo
# Ver: Grafo/Query/INTEGRATION_MCP.md

# 3. Ejecutar MCP
make run

# Verificar en Cursor
# El MCP debería tener acceso a herramientas de grafo
```

## 🧪 Prueba End-to-End

### Escenario: Crear código con contexto del grafo

**1. Usuario en Cursor:**
```
"Crea un nuevo servicio de Productos similar al servicio de Usuarios"
```

**2. MCP ejecuta:**
```python
# Buscar servicio de usuarios existente
context = get_code_context_from_graph(
    class_name="UserService",
    namespace="Banking.Core"
)
```

**3. Query Service consulta:**
```http
POST http://localhost:8081/api/context/code
{
  "className": "UserService",
  "namespace": "Banking.Core",
  "includeRelated": true
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

### Query Service
```bash
# Estadísticas del grafo
curl http://localhost:8081/api/context/statistics
```

### MongoDB
```bash
# Usar MongoDB Compass
mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/

# O CLI
mongosh --username InfocorpAI --password InfocorpAI2025
use GraphDB
db.projects.count()
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
# Limpiar MongoDB
mongosh --username InfocorpAI --password InfocorpAI2025
use GraphDB
db.projects.deleteMany({})
db.processing_states.deleteMany({})

# Re-indexar desde cero
# ... ejecutar Indexer + IndexerDb
```

## 📚 Documentación por Componente

- **Indexer:** `/Grafo/Indexer/README.md`
- **IndexerDb:** `/Grafo/IndexerDb/README.md`
- **Query Service:** `/Grafo/Query/README.md`
- **Integración MCP:** `/Grafo/Query/INTEGRATION_MCP.md`
- **MCP:** `/MCP/README.md`

## 🐛 Troubleshooting Común

### Problema: Query Service no encuentra datos
**Causa:** IndexerDb no ha procesado el código  
**Solución:** Ejecutar Indexer + IndexerDb primero

### Problema: MCP no puede conectar a Query Service
**Causa:** Query Service no está ejecutándose  
**Solución:** 
```bash
cd Grafo/Query
./quick_start.sh
```

### Problema: MongoDB connection refused
**Causa:** MongoDB no está ejecutándose  
**Solución:**
```bash
docker start mongodb-grafo
# O iniciar MongoDB localmente
```

### Problema: Indexer falla al analizar código
**Causa:** Código C# no compila o tiene errores  
**Solución:** Asegurar que el código compile antes de indexar

## 🎯 Casos de Uso

### 1. Generar Código Nuevo
**Objetivo:** Crear código siguiendo patrones existentes  
**Componentes:** MCP + Query Service  
**Beneficio:** Código consistente con arquitectura

### 2. Modificar Código Existente
**Objetivo:** Entender contexto antes de modificar  
**Componentes:** Query Service (contexto + relaciones)  
**Beneficio:** Cambios informados, menos errores

### 3. Análisis de Impacto
**Objetivo:** Entender qué afecta un cambio  
**Componentes:** Query Service (relaciones + dependencias)  
**Beneficio:** Cambios seguros

### 4. Refactoring Informado
**Objetivo:** Refactorizar con conocimiento del sistema  
**Componentes:** Todo el ecosistema  
**Beneficio:** Refactoring consistente

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

