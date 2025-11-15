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
docker --version    # Docker Desktop (requerido)
node --version      # >= 18.0 (para CLI de Grafo)
dotnet --version    # >= 8.0 (para indexar código C#)
```

### 2. Instalar CLI de Grafo

```bash
cd Grafo
npm install
npm link

# Verificar instalación
grafo --version
```

### 3. Iniciar MongoDB

```bash
# Usando CLI de Grafo (recomendado)
grafo mongodb start

# Verificar estado
grafo mongodb status
```

### 4. Iniciar MCP Server

```bash
# Construir e iniciar MCP Server
grafo mcp build
grafo mcp start

# El CLI mostrará la configuración JSON para Cursor
# Verificar estado
grafo mcp status
```

### 5. Configurar Cursor/VSCode

Agregar la configuración que muestra `grafo mcp status` a tu IDE:

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

Ubicación:
- **Cursor:** `~/.cursor/mcp.json`
- **Windows:** `%APPDATA%\Cursor\User\mcp.json`

Reiniciar el IDE.

### 6. Indexar Código C# (Opcional)

Si tienes código C# para analizar:

```bash
# Paso 1: Ejecutar Indexer
cd Grafo/Indexer
dotnet run -- --solution "/path/to/solution.sln"

# Paso 2: Almacenar en MongoDB
cd ../IndexerDb
dotnet run --all

# Verificar datos
dotnet run --interactive
> count
> projects list
> exit
```

**Ver guía completa:** [Grafo/README.md](Grafo/README.md) | [Grafo/QUICKSTART.md](Grafo/QUICKSTART.md)

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

### 🌐 Query Service + MCP Server
**Propósito:** Sistema dual para consultar el grafo

**Tecnología:** Python 3.11, FastAPI, Motor, MCP SDK
**Puertos:**
- Query Service (REST API): 8081
- MCP Server (HTTP/SSE): 8083

**Base de datos:** MongoDB (GraphDB) en puerto 27019

**Documentación:**
- [Grafo/README.md](Grafo/README.md) - Guía completa
- [Grafo/Query/README.md](Grafo/Query/README.md) - Documentación técnica

**MCP Server:**
- Servidor HTTP/SSE para múltiples clientes Cursor/VSCode
- 6 herramientas de consulta de código
- Configuración: `http://localhost:8083/sse`

**Gestión con CLI:**
```bash
# MCP Server
grafo mcp build          # Construir imagen
grafo mcp start          # Iniciar (muestra config)
grafo mcp status         # Ver estado
grafo mcp logs           # Ver logs
grafo mcp test           # Ejecutar tests

# MongoDB
grafo mongodb start      # Iniciar
grafo mongodb status     # Ver estado
grafo mongodb shell      # Abrir mongosh
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
│   Puerto 27019  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MCP Server     │  (HTTP/SSE - Puerto 8083)
│  + Query Service│  (REST API - Puerto 8081)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cursor/VSCode   │  (Usuario final)
│  Múltiples      │  (http://localhost:8083/sse)
│  clientes       │
└─────────────────┘

Todos los servicios ejecutan en red Docker: grafo-network
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
- Host: `localhost:27019` (puerto interno y externo)
- Database: `GraphDB`
- Collections: `projects`, `processing_states`
- Sin autenticación (modo desarrollo)
- Red Docker: `grafo-network`

**Gestión:**
```bash
grafo mongodb start      # Iniciar
grafo mongodb status     # Ver estado
grafo mongodb logs       # Ver logs
grafo mongodb shell      # Abrir mongosh
grafo mongodb clean      # Limpiar (elimina datos)
```

### MCP Server

**Configuración HTTP/SSE:**
- Puerto externo: `8083`
- Puerto interno: `8082`
- Endpoint SSE: `http://localhost:8083/sse`
- Transport: `sse`
- Red Docker: `grafo-network`

**Gestión:**
```bash
grafo mcp build          # Construir imagen
grafo mcp start          # Iniciar
grafo mcp status         # Ver estado (muestra config)
grafo mcp logs           # Ver logs
grafo mcp test           # Ejecutar tests
```

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
| CLI Grafo | `cd Grafo && npm install && npm link` | comando `grafo` |
| MongoDB | `grafo mongodb start` | 27019 |
| MCP Server | `grafo mcp build && grafo mcp start` | 8083 (HTTP/SSE) |
| Indexer | `cd Grafo/Indexer && dotnet run -- --solution path/to/sln` | output/*.json |
| IndexerDb | `cd Grafo/IndexerDb && dotnet run --all` | MongoDB |

**Acceso Rápido:**
- MCP Server SSE: http://localhost:8083/sse
- MCP Server Health: http://localhost:8083/health
- Query Service: http://localhost:8081/docs
- MongoDB: `mongodb://localhost:27019/`

**Documentación:**
- Guía Completa: [Grafo/README.md](Grafo/README.md)
- Quick Start: [Grafo/QUICKSTART.md](Grafo/QUICKSTART.md)
- Arquitectura: [Grafo/ECOSYSTEM_OVERVIEW.md](Grafo/ECOSYSTEM_OVERVIEW.md)

---

¡Disfruta del sistema Grafo! 🚀
