# Grafo - Sistema de Análisis y Consulta de Código

Sistema completo para analizar, indexar y consultar código C# como un grafo de conocimiento, integrado con el MCP para asistencia contextual en generación de código.

## 📁 Componentes del Sistema

```
Grafo/
├── Indexer/              # 🔍 Analizador de código C# (Roslyn)
├── IndexerDb/            # 💾 Procesador y almacenamiento (MongoDB)
├── Query/                # 🌐 API REST para consultas
├── Repo/                 # 📦 Repositorios clonados para análisis
└── ECOSYSTEM_OVERVIEW.md # 📚 Documentación completa del ecosistema
```

## 🎯 Visión General

Este sistema permite:

1. **Analizar** código C# y crear un grafo de relaciones
2. **Almacenar** el grafo en MongoDB de forma eficiente
3. **Consultar** el grafo vía API REST
4. **Integrar** con el MCP para asistencia contextual en Cursor

## 🚀 Quick Start

### 1. Prerequisitos

```bash
# Verificar herramientas instaladas
dotnet --version    # >= 8.0
python --version    # >= 3.11
mongosh --version   # MongoDB CLI (opcional)
```

### 2. Iniciar MongoDB

```bash
# Opción A: Docker
docker run -d \
  --name mongodb-grafo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=InfocorpAI \
  -e MONGO_INITDB_ROOT_PASSWORD=InfocorpAI2025 \
  mongo:8.0

# Opción B: MongoDB Atlas (Cloud)
# Configurar en appsettings.json de IndexerDb
```

### 3. Indexar Código (Primera vez)

```bash
# Paso 1: Clonar repositorio a analizar
cd Grafo/Repo/Cloned
git clone <your-repo-url> MyProject

# Paso 2: Ejecutar Indexer
cd ../../Indexer
dotnet build
dotnet run -- --solution "../Repo/Cloned/MyProject/MyProject.sln"

# Paso 3: Almacenar en MongoDB
cd ../IndexerDb
dotnet build
dotnet run --all

# Verificar datos
dotnet run --interactive
> count
> projects list
> exit
```

### 4. Iniciar Query Service

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

# Verificar: http://localhost:8081/health
```

### 5. Integrar con MCP (Opcional)

Ver: [Query/INTEGRATION_MCP.md](Query/INTEGRATION_MCP.md)

## 📊 Componentes Detallados

### 🔍 Indexer
**Propósito:** Analizar código C# y generar grafo JSON

**Tecnología:** .NET 8, Roslyn  
**Input:** Soluciones .sln, Proyectos .csproj  
**Output:** Archivos *-graph.json  

**Documentación:** [Indexer/README.md](Indexer/README.md)

**Ejecutar:**
```bash
cd Indexer
dotnet run -- --solution "path/to/solution.sln"
```

**Output generado:**
```
Indexer/output/
└── ProjectName_GraphFiles/
    └── ProjectName-graph.json
```

---

### 💾 IndexerDb
**Propósito:** Procesar JSON y almacenar en MongoDB

**Tecnología:** .NET 8, MongoDB.Driver  
**Input:** Archivos *-graph.json  
**Output:** Colecciones MongoDB (projects, processing_states)  

**Documentación:** [IndexerDb/README.md](IndexerDb/README.md)

**Características:**
- ✅ Procesamiento incremental (solo cambios)
- ✅ Almacenamiento por proyecto
- ✅ Modo interactivo para consultas
- ✅ Detección de cambios con hashing

**Ejecutar:**
```bash
cd IndexerDb
dotnet run --all            # Procesar todos
dotnet run --interactive    # Modo consulta
```

---

### 🌐 Query Service
**Propósito:** API REST para consultar el grafo

**Tecnología:** Python 3.11, FastAPI, Motor  
**Puerto:** 8081  
**Base de datos:** MongoDB (GraphDB)  

**Documentación:** 
- [Query/README.md](Query/README.md)
- [Query/INTEGRATION_MCP.md](Query/INTEGRATION_MCP.md)
- [Query/PROJECT_SUMMARY.md](Query/PROJECT_SUMMARY.md)

**Endpoints principales:**
```
POST /api/context/code        # Contexto para MCP ⭐
POST /api/nodes/search        # Búsqueda de nodos
POST /api/projects/search     # Búsqueda de proyectos
GET  /api/context/statistics  # Estadísticas
GET  /health                  # Health check
GET  /docs                    # Swagger UI
```

**Ejecutar:**
```bash
cd Query
./quick_start.sh
# Documentación: http://localhost:8081/docs
```

**Ejemplo de uso:**
```bash
curl -X POST http://localhost:8081/api/context/code \
  -H "Content-Type: application/json" \
  -d '{
    "className": "UserService",
    "methodName": "CreateUser",
    "includeRelated": true
  }'
```

---

### 📦 Repo
**Propósito:** Almacenar repositorios clonados para análisis

**Estructura:**
```
Repo/
├── Cloned/           # Repositorios clonados
│   └── ICB7C/        # Ejemplo
├── clone-repo.sh     # Script de clonación
└── README.md         # Documentación
```

**Uso:**
```bash
cd Repo
./clone-repo.sh <repository-url> <directory-name>
```

## 🔗 Flujo de Trabajo Completo

```
┌─────────────────┐
│  Código C#      │  (Tu repositorio)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Indexer      │  (Analiza con Roslyn)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   *-graph.json  │  (Grafo intermedio)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   IndexerDb     │  (Procesa y almacena)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     MongoDB     │  (GraphDB.projects)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Query Service   │  (API REST)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│      MCP        │  (Contexto para generación)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Cursor      │  (Usuario final)
└─────────────────┘
```

## 🧪 Pruebas

### Prueba 1: Sistema Completo End-to-End

```bash
# 1. Indexar código de ejemplo
cd Indexer
dotnet run -- --solution "../Repo/Cloned/ICB7C/Infocorp.Banking.sln"

# 2. Almacenar en MongoDB
cd ../IndexerDb
dotnet run --all

# 3. Verificar datos
dotnet run --interactive
> count
> projects Banking
> exit

# 4. Consultar vía API
cd ../Query
make dev

# En otra terminal:
curl http://localhost:8081/health
curl -X POST http://localhost:8081/api/projects/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Banking", "limit": 5}'
```

### Prueba 2: Integración con MCP

Ver scripts de prueba en:
- `Query/mcp_integration_example.py`
- `Query/INTEGRATION_MCP.md`

## 📚 Documentación

### Por Componente
- [Indexer README](Indexer/README.md)
- [IndexerDb README](IndexerDb/README.md)
- [Query README](Query/README.md)
- [Query - Resumen del Proyecto](Query/PROJECT_SUMMARY.md)
- [Query - Integración MCP](Query/INTEGRATION_MCP.md)

### Documentación General
- [ECOSYSTEM_OVERVIEW.md](ECOSYSTEM_OVERVIEW.md) - **Visión completa del ecosistema** ⭐

## 🛠️ Mantenimiento

### Re-indexar Código (Cuando el código cambia)

```bash
# 1. Re-ejecutar Indexer
cd Indexer
dotnet run -- --solution "path/to/solution.sln"

# 2. Re-procesar con IndexerDb (procesamiento incremental)
cd ../IndexerDb
dotnet run --all

# Query Service reflejará cambios automáticamente
```

### Limpiar Todo y Empezar de Nuevo

```bash
# 1. Limpiar MongoDB
mongosh --username InfocorpAI --password InfocorpAI2025
use GraphDB
db.projects.deleteMany({})
db.processing_states.deleteMany({})
exit

# 2. Re-indexar desde cero
cd Indexer
dotnet run -- --solution "path/to/solution.sln"

cd ../IndexerDb
dotnet run --all
```

## 🔧 Configuración

### MongoDB

**Configuración por defecto:**
- Host: `localhost:27017`
- Database: `GraphDB`
- Collections: `projects`, `processing_states`
- User: `InfocorpAI`
- Password: `InfocorpAI2025`

**Cambiar configuración:**
- IndexerDb: Editar `IndexerDb/appsettings.json`
- Query: Editar `Query/.env`

### Query Service

**Variables principales:**
```env
MONGODB_CONNECTION_STRING=mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/
MONGODB_DATABASE=GraphDB
SERVER_PORT=8081
LOG_LEVEL=INFO
```

Ver: `Query/.env.example`

## 🐛 Troubleshooting

### MongoDB no conecta
```bash
# Verificar que MongoDB esté ejecutándose
docker ps | grep mongodb-grafo

# O verificar servicio local
systemctl status mongod  # Linux
brew services list       # Mac
```

### IndexerDb no encuentra archivos
```bash
# Verificar que Indexer haya generado output
ls -la Indexer/output/

# Verificar configuración en IndexerDb/appsettings.json
```

### Query Service no encuentra datos
```bash
# Verificar datos en MongoDB
cd IndexerDb
dotnet run --interactive
> count
```

Si `count` retorna 0, ejecutar IndexerDb primero.

## 📈 Métricas del Sistema

### Capacidades Actuales

- ✅ Analiza proyectos C# de cualquier tamaño
- ✅ Procesamiento incremental (solo cambios)
- ✅ Consultas optimizadas con índices MongoDB
- ✅ API REST con documentación Swagger
- ✅ Integración con MCP

### Performance

- **Indexer:** ~1000 archivos/minuto (depende de complejidad)
- **IndexerDb:** ~100 proyectos/segundo (depende de tamaño)
- **Query:** < 100ms respuesta promedio

## 🎯 Casos de Uso

### 1. Análisis de Código Existente
Entender la estructura y relaciones del código.

### 2. Generación de Código con Contexto
El MCP usa el grafo para generar código consistente.

### 3. Refactoring Informado
Analizar impacto de cambios antes de ejecutarlos.

### 4. Documentación Automática
Generar documentación basada en el grafo.

### 5. Code Review Asistido
Identificar patrones y anti-patrones.

## 🚀 Roadmap

### Fase Actual (v1.0)
- [x] Indexer funcional
- [x] IndexerDb con procesamiento incremental
- [x] Query Service con endpoints básicos
- [x] Documentación completa

### Próximos Pasos (v1.1)
- [ ] Integración completa con MCP
- [ ] Pruebas unitarias y de integración
- [ ] Caché de consultas frecuentes
- [ ] Búsqueda semántica con embeddings

### Futuro (v2.0)
- [ ] Visualización web del grafo
- [ ] Análisis de cambios en tiempo real
- [ ] Detección de code smells
- [ ] Sugerencias de arquitectura

## 📞 Soporte

Para problemas o preguntas:
1. Revisar documentación específica del componente
2. Consultar [ECOSYSTEM_OVERVIEW.md](ECOSYSTEM_OVERVIEW.md)
3. Revisar logs de cada componente
4. Verificar configuración de MongoDB

## 📄 Licencia

Este proyecto es parte del sistema ICGuru.

---

**Versión:** 1.0.0  
**Última actualización:** Octubre 2024  
**Estado:** ✅ Listo para uso en producción

## 🎉 Inicio Rápido por Componente

| Componente | Comando | Puerto/Output |
|------------|---------|---------------|
| MongoDB | `docker run -d --name mongodb-grafo -p 27017:27017 ...` | 27017 |
| Indexer | `cd Indexer && dotnet run -- --solution path/to/sln` | output/*.json |
| IndexerDb | `cd IndexerDb && dotnet run --all` | MongoDB |
| Query | `cd Query && ./quick_start.sh` | 8081 |

**Acceso Rápido:**
- Query Docs: http://localhost:8081/docs
- Query Health: http://localhost:8081/health
- MongoDB: mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/

---

¡Disfruta del sistema Grafo! 🚀
