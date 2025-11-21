# Grafo - C# Code Graph Analysis System

**Grafo** es un sistema completo para indexar, almacenar y consultar grafos de código C# usando MongoDB y un servidor MCP (Model Context Protocol) para integración con IDEs como Cursor y VSCode.

## 🚀 Quick Start (5 minutos)

### Requisitos Previos
- **Docker Desktop** instalado y corriendo
- **Node.js** 18+ (para CLI)
- **.NET 8.0** SDK (para indexar código C#)

---

## 📦 Instalación

### 1. Clonar el repositorio
```bash
git clone <tu-repo-url>
cd Grafo
```

### 2. Instalar CLI Global
```bash
npm install
npm link
```

Esto hace disponible el comando `grafo` globalmente en tu sistema.

---

## 🎯 Uso del Sistema

Grafo funciona en 3 pasos simples:

### Paso 1: Iniciar MongoDB

```bash
grafo mongodb start
```

Esto:
- ✅ Descarga e inicia MongoDB 8.0 en Docker
- ✅ Puerto: **27019**
- ✅ Base de datos: **GraphDB**
- ✅ Sin autenticación (modo desarrollo)

Verificar:
```bash
grafo mongodb status
```

### Paso 2: Indexar tu Código C#

```bash
cd Indexer
dotnet run -- --solution "C:/ruta/a/tu/solution.sln"
```

Esto genera archivos JSON con el grafo de código en `Indexer/output/`.

### Paso 3: Almacenar en MongoDB

```bash
cd IndexerDb
dotnet run --all
```

Esto carga todos los grafos indexados en MongoDB.

---

## 🔍 Consultar el Grafo

Tienes 2 opciones para consultar el grafo:

### Opción A: Query Service (REST API)

```bash
grafo query build
grafo query start
```

Accede a:
- **API**: http://localhost:8081
- **Docs**: http://localhost:8081/docs
- **Health**: http://localhost:8081/health

### Opción B: MCP Server (para Cursor/VSCode)

```bash
grafo mcp build
grafo mcp start
```

Esto inicia el servidor MCP en **http://localhost:8083** usando HTTP/SSE.

#### Configurar Cursor/VSCode

**Agrega esto a `~/.cursor/mcp.json`** (o `%APPDATA%\Cursor\User\mcp.json` en Windows):

**RECOMENDADO - Con versión específica:**

```json
{
  "mcpServers": {
    "grafo-7.10.3": {
      "url": "http://localhost:8083/sse?version=7.10.3",
      "transport": "sse"
    }
  }
}
```

**Alternativa - Sin versión específica:**

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

💡 **Tip:** Especificar la versión en la URL (`?version=7.10.3`) te da control explícito sobre qué versión del código consultas. Ver [MCP_CURSOR_SETUP.md](MCP_CURSOR_SETUP.md) para más detalles.

Reinicia Cursor y ya puedes consultar tu código desde el chat.

---

## 📋 Comandos Disponibles

### MongoDB
```bash
grafo mongodb start      # Iniciar MongoDB
grafo mongodb stop       # Detener MongoDB
grafo mongodb status     # Ver estado
grafo mongodb logs       # Ver logs
grafo mongodb shell      # Abrir mongosh
grafo mongodb clean      # Limpiar todo (⚠️ elimina datos)
```

### Query Service
```bash
grafo query build        # Construir imagen Docker
grafo query start        # Iniciar servicio
grafo query stop         # Detener servicio
grafo query status       # Ver estado
grafo query logs         # Ver logs
```

### MCP Server
```bash
grafo mcp build          # Construir imagen Docker
grafo mcp start          # Iniciar servidor MCP
grafo mcp stop           # Detener servidor
grafo mcp status         # Ver estado (muestra config de Cursor)
grafo mcp logs           # Ver logs
```

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│  Código C# (.sln)                                   │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│  Indexer (.NET)                                     │
│  Analiza código y genera grafos JSON                │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│  IndexerDb (.NET)                                   │
│  Carga grafos en MongoDB                            │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│  MongoDB (Docker)                                   │
│  Puerto: 27019                                      │
│  Base de datos: GraphDB                             │
└──────────┬──────────────┬───────────────────────────┘
           │              │
           ▼              ▼
  ┌────────────────┐  ┌────────────────┐
  │ Query Service  │  │  MCP Server    │
  │ REST API       │  │  HTTP/SSE      │
  │ :8081          │  │  :8083         │
  └────────────────┘  └────────┬───────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │  Cursor/VSCode  │
                      │  (Múltiples     │
                      │   clientes)     │
                      └─────────────────┘
```

---

## 🌐 Endpoints del Sistema

| Servicio | Puerto | Endpoints |
|----------|--------|-----------|
| **MongoDB** | 27019 | `mongodb://localhost:27019/` |
| **Query Service** | 8081 | http://localhost:8081<br>http://localhost:8081/docs<br>http://localhost:8081/health |
| **MCP Server** | 8083 | http://localhost:8083/sse<br>http://localhost:8083/health<br>http://localhost:8083/ |

---

## 🔧 Stack Tecnológico

- **Backend Indexer**: .NET 8.0, Roslyn
- **Base de Datos**: MongoDB 8.0
- **Query Service**: Python 3.11, FastAPI, Motor
- **MCP Server**: Python 3.11, FastAPI, SSE
- **CLI**: Node.js, Commander.js
- **Contenedores**: Docker & Docker Compose

---

## 🐛 Troubleshooting

### MongoDB no inicia
```bash
# Verificar Docker
docker --version
docker info

# Ver logs
grafo mongodb logs

# Reiniciar
grafo mongodb stop
grafo mongodb start
```

### Puerto 27019 en uso
Si tienes otra instancia de MongoDB:
```bash
# Ver qué usa el puerto
netstat -ano | findstr ":27019"

# Detener el servicio
docker ps
docker stop <container-id>
```

### MCP Server no conecta desde Cursor

1. Verificar que está corriendo:
```bash
grafo mcp status
```

2. Verificar endpoint:
```bash
curl http://localhost:8083/health
```

3. Verificar configuración en `~/.cursor/mcp.json`

4. Reiniciar Cursor completamente

---

## 📚 Documentación Adicional

- **Indexer**: Ver `Indexer/README.md` para detalles de indexación
- **IndexerDb**: Ver `IndexerDb/README.md` para esquema MongoDB
- **Query Service**: Ver `Query/README.md` para API REST
- **Ecosystem**: Ver `ECOSYSTEM_OVERVIEW.md` para arquitectura completa

---

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'Agregar nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

---

## 📝 Licencia

MIT License - Ver LICENSE para más detalles

---

## 💡 Tips

### Iniciar todo de una vez
```bash
# Terminal 1: MongoDB
grafo mongodb start

# Terminal 2: MCP Server
grafo mcp start

# Verificar todo
grafo mongodb status
grafo mcp status
```

### Ver logs en tiempo real
```bash
# Terminal 1
grafo mongodb logs

# Terminal 2
grafo mcp logs
```

### Limpiar y empezar de nuevo
```bash
# Limpiar servicios (preserva MongoDB)
grafo mcp stop
grafo query stop

# Limpiar MongoDB (⚠️ ELIMINA DATOS)
grafo mongodb clean

# Rebuild todo
grafo mongodb start
grafo mcp build
grafo mcp start
```

---

**¿Problemas?** Abre un issue en GitHub

**¿Preguntas?** Consulta la documentación en `ECOSYSTEM_OVERVIEW.md`
