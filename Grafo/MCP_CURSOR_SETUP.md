# Configuración de Grafo MCP en Cursor y VS Code

**Versión MCP:** HTTP/SSE (Model Context Protocol sobre Server-Sent Events)
**Última actualización:** 2025-01-21

---

## 📋 Tabla de Contenidos

1. [¿Qué es MCP?](#qué-es-mcp)
2. [Arquitectura Actual (HTTP/SSE)](#arquitectura-actual-httpsse)
3. [Prerequisitos](#prerequisitos)
4. [Configuración en Cursor](#configuración-en-cursor)
5. [Configuración en VS Code](#configuración-en-vs-code)
6. [Herramientas Disponibles](#herramientas-disponibles)
7. [Ejemplos de Uso](#ejemplos-de-uso)
8. [Troubleshooting](#troubleshooting)

---

## ¿Qué es MCP?

**Model Context Protocol (MCP)** es un protocolo estándar que permite a los LLMs (como Claude) acceder a fuentes de datos externas de manera estructurada y segura.

**Grafo MCP Server** expone 6 herramientas para que Claude pueda consultar el grafo de código C# directamente desde Cursor/VS Code:

- 🔍 `search_code` - Buscar elementos de código
- 📖 `get_code_context` - Obtener contexto detallado con relaciones
- 📋 `list_projects` - Listar proyectos disponibles
- 🏗️ `get_project_structure` - Obtener estructura de proyecto
- 🔗 `find_implementations` - Encontrar implementaciones/herencia
- 📊 `get_statistics` - Estadísticas del grafo

---

## Arquitectura Actual (HTTP/SSE)

### Versión Actual: HTTP/SSE ✅

Grafo usa **HTTP con Server-Sent Events (SSE)** en lugar del antiguo protocolo stdio.

```
┌─────────────────┐
│  Cursor/VS Code │
└────────┬────────┘
         │ HTTP/SSE
         │ http://localhost:8083/sse
         ▼
┌─────────────────┐
│   MCP Server    │  Puerto 8083 (externo) → 8082 (interno)
│   (FastAPI)     │  Contenedor Docker: grafo-mcp-server
└────────┬────────┘
         │ MongoDB Driver
         │ localhost:27019
         ▼
┌─────────────────┐
│    MongoDB      │  Puerto 27019
│   (Docker)      │  Contenedor: grafo-mongodb
└─────────────────┘
```

**Ventajas de HTTP/SSE:**
- ✅ Múltiples clientes simultáneos (varios Cursor abiertos)
- ✅ Conexiones stateless (no se cuelga)
- ✅ Más fácil de debuggear (logs HTTP estándar)
- ✅ Health checks y monitoreo
- ✅ Compatible con proxies/firewalls

### ❌ Versión Antigua (NO USAR)

La versión stdio (con `docker exec`) está **obsoleta** y archivada en `Query/docs/archive/`.

---

## Prerequisitos

### 1. Iniciar Servicios

Antes de configurar Cursor/VS Code, asegúrate de que los servicios estén corriendo:

```bash
# Terminal 1: MongoDB
grafo mongodb start

# Terminal 2: MCP Server
grafo mcp build
grafo mcp start
```

### 2. Verificar que MCP Server está corriendo

```bash
# Ver estado
grafo mcp status

# Verificar endpoint
curl http://localhost:8083/health

# Respuesta esperada:
# {"status":"healthy","service":"grafo-mcp-server","version":"1.0.0"}
```

### 3. Verificar que MongoDB tiene datos

```bash
# Abrir shell de MongoDB
grafo mongodb shell

# Dentro de mongosh:
use GraphDB
db.projects.countDocuments()
# Debe retornar > 0
```

---

## Configuración en Cursor

### Paso 1: Ubicar el Archivo de Configuración

**macOS/Linux:**
```bash
~/.cursor/mcp.json
```

**Windows:**
```
%APPDATA%\Cursor\User\mcp.json
```

Si el archivo no existe, créalo.

### Paso 2: Agregar Configuración de Grafo

**CONFIGURACIÓN RECOMENDADA (con versión específica):**

Edita `mcp.json` y agrega especificando la **versión del grafo** que deseas consultar:

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

**💡 ¿Por qué especificar la versión?**
- ✅ **Control explícito** sobre qué versión del código estás consultando
- ✅ **Múltiples versiones** simultáneas (prod, dev, staging, etc.)
- ✅ **Independiente** de la configuración del servidor
- ✅ **Cambio rápido** de versión (editar mcp.json, reiniciar Cursor)

**Ejemplo: Múltiples versiones simultáneas**

```json
{
  "mcpServers": {
    "grafo-prod": {
      "url": "http://localhost:8083/sse?version=7.10.3",
      "transport": "sse"
    },
    "grafo-dev": {
      "url": "http://localhost:8083/sse?version=7.11.0-beta",
      "transport": "sse"
    }
  }
}
```

En Cursor podrás elegir entre "grafo-prod" y "grafo-dev" según necesites.

**Alternativa sin versión (no recomendado para producción):**

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

Sin `?version=`, se consultan todas las versiones o la versión por defecto del servidor.

**Explicación de los campos:**

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `"grafo-7.10.3"` | Nombre del servidor | Identificador único (puedes cambiarlo) |
| `"url"` | `"http://localhost:8083/sse?version=7.10.3"` | Endpoint SSE + versión del grafo |
| `"transport"` | `"sse"` | Tipo de transporte (Server-Sent Events) |
| `?version=7.10.3` | Query parameter | Versión del grafo a consultar |

### Paso 3: Reiniciar Cursor

**⚠️ IMPORTANTE:** Debes reiniciar Cursor **completamente** para que cargue la configuración:

1. Cierra todas las ventanas de Cursor
2. Sal completamente de la aplicación (Cmd+Q en Mac, Alt+F4 en Windows)
3. Abre Cursor nuevamente

### Paso 4: Verificar Conexión

1. Abre Cursor
2. Abre el panel de Claude (icono en la barra lateral)
3. En la parte inferior, deberías ver:
   ```
   🔌 MCP: grafo-query-http (conectado)
   ```

Si ves "conectado", todo está funcionando correctamente.

---

## Configuración en VS Code

### Prerequisitos Adicionales

VS Code requiere una extensión para soportar MCP:

```bash
# Buscar e instalar la extensión:
# "Model Context Protocol" o "MCP Client"
```

**Nota:** El soporte MCP en VS Code puede variar según la extensión. Cursor tiene soporte nativo más maduro.

### Configuración

Similar a Cursor, pero el archivo de configuración puede estar en:

```bash
# macOS/Linux
~/.vscode/mcp.json

# Windows
%APPDATA%\Code\User\mcp.json
```

**CONFIGURACIÓN RECOMENDADA (con versión específica):**

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

**Alternativa sin versión:**

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

Consulta la sección [Filtrar por Versión del Grafo](#filtrar-por-versión-del-grafo) para más detalles sobre cómo especificar versiones.

---

## Herramientas Disponibles

Una vez conectado, Claude tendrá acceso a estas herramientas:

### 1. **search_code** 🔍

Busca elementos de código (clases, métodos, interfaces) por nombre.

**Ejemplo:**
```
Usuario: "Busca todas las clases que contengan 'Payment' en su nombre"

Claude usa: search_code(query="Payment", limit=10)
```

### 2. **get_code_context** 📖

Obtiene contexto detallado de un elemento de código incluyendo:
- Definición completa
- Clases base e interfaces
- Implementaciones
- Dependencias
- Llamadas a métodos

**Ejemplo:**
```
Usuario: "Muéstrame el contexto completo de la clase PaymentProcessor"

Claude usa: get_code_context(
  class_name="PaymentProcessor",
  include_inheritance=true,
  include_implementations=true,
  max_depth=2
)
```

### 3. **list_projects** 📋

Lista todos los proyectos indexados en el grafo.

**Ejemplo:**
```
Usuario: "¿Qué proyectos están disponibles?"

Claude usa: list_projects()
```

### 4. **get_project_structure** 🏗️

Muestra la estructura de un proyecto específico.

**Ejemplo:**
```
Usuario: "Muéstrame la estructura del proyecto Banking.Core"

Claude usa: get_project_structure(project_name="Banking.Core")
```

### 5. **find_implementations** 🔗

Encuentra todas las implementaciones de una interfaz o clases derivadas.

**Ejemplo:**
```
Usuario: "¿Qué clases implementan IPaymentService?"

Claude usa: find_implementations(
  interface_name="IPaymentService",
  include_transitive=false
)
```

### 6. **get_statistics** 📊

Obtiene estadísticas generales del grafo de código.

**Ejemplo:**
```
Usuario: "Dame estadísticas del código indexado"

Claude usa: get_statistics()
```

---

## Ejemplos de Uso

### Ejemplo 1: Explorar Arquitectura

```
👤 Usuario: "¿Cuál es la arquitectura general del proyecto Banking?"

🤖 Claude:
Déjame explorar la arquitectura...
[Usa list_projects() y get_project_structure()]

El proyecto Banking está organizado en capas:
- Banking.Api (Capa de presentación)
- Banking.Core (Lógica de negocio)
- Banking.Data (Acceso a datos)
- Banking.Domain (Modelos de dominio)
```

### Ejemplo 2: Entender una Clase

```
👤 Usuario: "Explícame cómo funciona la clase TransactionProcessor"

🤖 Claude:
Voy a buscar información sobre TransactionProcessor...
[Usa search_code(query="TransactionProcessor")]
[Usa get_code_context(class_name="TransactionProcessor", max_depth=2)]

La clase TransactionProcessor:
1. Implementa ITransactionService
2. Tiene dependencias de:
   - IAccountRepository
   - IValidationService
3. Métodos principales:
   - ProcessTransaction()
   - ValidateTransaction()
```

### Ejemplo 3: Encontrar Implementaciones

```
👤 Usuario: "¿Qué servicios implementan IRepository?"

🤖 Claude:
Buscando implementaciones de IRepository...
[Usa find_implementations(interface_name="IRepository")]

Encontré 5 implementaciones:
1. AccountRepository (Banking.Data)
2. TransactionRepository (Banking.Data)
3. UserRepository (Banking.Data)
4. AuditRepository (Banking.Data)
5. CacheRepository (Banking.Infrastructure)
```

### Ejemplo 4: Análisis de Dependencias

```
👤 Usuario: "¿Qué clases dependen de PaymentGateway?"

🤖 Claude:
Analizando dependencias...
[Usa get_code_context(class_name="PaymentGateway", include_callers=true)]

PaymentGateway es usado por:
1. PaymentService (llama ProcessPayment)
2. RefundService (llama RefundPayment)
3. SubscriptionManager (llama RecurringPayment)
```

---

## Troubleshooting

### ❌ "MCP: grafo-query-http (desconectado)"

**Causas posibles:**

1. **MCP Server no está corriendo**
   ```bash
   grafo mcp status
   # Si no está corriendo:
   grafo mcp start
   ```

2. **Puerto 8083 bloqueado**
   ```bash
   # Windows
   netstat -ano | findstr ":8083"

   # macOS/Linux
   lsof -i :8083
   ```

3. **Firewall bloqueando**
   ```bash
   # Verificar acceso
   curl http://localhost:8083/health
   ```

4. **Configuración incorrecta en mcp.json**
   - Verifica que la URL sea exactamente: `http://localhost:8083/sse`
   - Verifica que el transport sea: `"sse"`
   - Asegúrate de que el JSON sea válido (sin comas extra)

### ❌ Claude dice "No tools available"

**Solución:**

1. Reinicia Cursor completamente (cierra y vuelve a abrir)
2. Verifica que el archivo `mcp.json` esté en la ubicación correcta
3. Verifica que el JSON sea válido:
   ```bash
   # macOS/Linux
   cat ~/.cursor/mcp.json | python -m json.tool

   # Windows PowerShell
   Get-Content "$env:APPDATA\Cursor\User\mcp.json" | ConvertFrom-Json
   ```

### ❌ "Connection timeout"

**Causas:**

1. **MCP Server tardando en responder**
   ```bash
   # Ver logs del MCP Server
   grafo mcp logs
   ```

2. **MongoDB no responde**
   ```bash
   # Verificar MongoDB
   grafo mongodb status
   curl http://localhost:27019/
   ```

3. **Red lenta o problemas de localhost**
   ```bash
   # Verificar que localhost resuelve correctamente
   ping localhost
   ```

### ❌ "No data found" / Resultados vacíos

**Causas:**

1. **MongoDB no tiene datos indexados**
   ```bash
   # Abrir MongoDB shell
   grafo mongodb shell

   # Dentro de mongosh:
   use GraphDB
   db.projects.countDocuments()
   ```

2. **Datos no indexados correctamente**
   ```bash
   # Re-indexar el código
   cd Grafo/Indexer
   dotnet run -- --solution "path/to/solution.sln"

   # Procesar en MongoDB
   cd ../IndexerDb
   dotnet run --all
   ```

### ❌ Cursor no encuentra el archivo mcp.json

**Ubicaciones correctas:**

```bash
# macOS
~/.cursor/mcp.json

# Linux
~/.cursor/mcp.json

# Windows
%APPDATA%\Cursor\User\mcp.json
# (Típicamente: C:\Users\TuUsuario\AppData\Roaming\Cursor\User\mcp.json)
```

**Crear directorio si no existe:**

```bash
# macOS/Linux
mkdir -p ~/.cursor

# Windows PowerShell
New-Item -ItemType Directory -Force -Path "$env:APPDATA\Cursor\User"
```

### 🔧 Verificación Completa

Si nada funciona, ejecuta esta verificación paso a paso:

```bash
# 1. MongoDB
grafo mongodb status
curl http://localhost:27019/

# 2. MCP Server
grafo mcp status
curl http://localhost:8083/health

# 3. Datos en MongoDB
grafo mongodb shell
# > use GraphDB
# > db.projects.countDocuments()
# > exit

# 4. Logs del MCP Server
grafo mcp logs

# 5. Reiniciar todo
grafo mcp stop
grafo mongodb stop
grafo mongodb start
grafo mcp start

# 6. Reiniciar Cursor completamente
```

---

## Configuración Avanzada

### Filtrar por Versión del Grafo

Grafo soporta **versionado del grafo de código**. Cada vez que se procesa un conjunto de proyectos con IndexerDb, se puede especificar una versión (e.g., "1.0.0", "7.10.2", "7.10.3") que quedará registrada en la base de datos.

**¿Para qué sirve el versionado?**
- Mantener múltiples versiones del código en la misma base de datos
- Consultar una versión específica del grafo (e.g., código de producción vs desarrollo)
- Comparar cambios entre versiones
- Aislar diferentes releases del código
- Múltiples desarrolladores consultan versiones diferentes del mismo servidor

#### Opción 1: Especificar Versión en la URL (RECOMENDADO)

La forma más flexible de filtrar por versión es especificarla directamente en la URL de conexión en tu `mcp.json`:

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

**Ventajas:**
- ✅ Cada desarrollador puede consultar una versión diferente
- ✅ No requiere reiniciar el MCP Server
- ✅ Puedes tener múltiples conexiones a diferentes versiones simultáneamente

**Ejemplo: Múltiples Versiones Simultáneas**

```json
{
  "mcpServers": {
    "grafo-prod": {
      "url": "http://localhost:8083/sse?version=7.10.3",
      "transport": "sse"
    },
    "grafo-dev": {
      "url": "http://localhost:8083/sse?version=7.11.0-beta",
      "transport": "sse"
    },
    "grafo-all-versions": {
      "url": "http://localhost:8083/sse",
      "transport": "sse"
    }
  }
}
```

En Cursor, podrás elegir entre "grafo-prod", "grafo-dev" o "grafo-all-versions" según necesites.

#### Opción 2: Versión por Defecto del Servidor

Alternativamente, puedes configurar una versión por defecto en el servidor que se usará cuando el cliente no especifique una:

**1. Editar `.env` del Query Service:**

```bash
# Grafo/Query/.env
GRAFO_DEFAULT_VERSION=7.10.3
```

**2. Reiniciar el MCP Server:**

```bash
grafo mcp restart
```

**3. Conectar sin query parameter:**

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

Esta configuración usará la versión 7.10.3 por defecto.

**Nota:** Si un cliente especifica `?version=X.X.X` en la URL, esa versión tiene prioridad sobre `GRAFO_DEFAULT_VERSION`.

#### Configuración en Docker (Producción)

**Con docker-compose.prod.localhost.yml:**

```yaml
mcp-server:
  environment:
    - GRAFO_DEFAULT_VERSION=7.10.3
    # ... otras variables
```

**Con docker-compose.prod.yml (DockerHub):**

Agregar al `.env.prod`:
```bash
GRAFO_DEFAULT_VERSION=7.10.3
```

Los clientes aún pueden sobreescribir esto usando `?version=` en la URL.

#### Versionar el Grafo al Procesar

Al procesar código con IndexerDb, la versión se extrae automáticamente del metadata del grafo JSON generado por el Indexer.

**Para especificar la versión manualmente en el Indexer**, editar el código fuente en `Grafo/Indexer/src/` para incluir el campo "Version" en el JSON de salida.

Ejemplo de estructura con versión:
```json
{
  "metadata": {
    "version": "7.10.3",
    "generatedAt": "2025-01-21T10:30:00Z"
  },
  "projects": [...]
}
```

#### Consultar Sin Filtro de Versión

Para consultar **todas las versiones** del grafo sin filtrar:

```json
{
  "mcpServers": {
    "grafo-all": {
      "url": "http://localhost:8083/sse",
      "transport": "sse"
    }
  }
}
```

Y en el servidor, dejar `GRAFO_DEFAULT_VERSION` vacío o sin configurar.

---

### Múltiples Instancias de Grafo

Si tienes múltiples instancias de Grafo en diferentes puertos:

```json
{
  "mcpServers": {
    "grafo-dev": {
      "url": "http://localhost:8083/sse",
      "transport": "sse"
    },
    "grafo-staging": {
      "url": "http://localhost:9083/sse",
      "transport": "sse"
    },
    "grafo-prod": {
      "url": "https://grafo.tu-empresa.com/api/grafo/mcp/sse",
      "transport": "sse"
    }
  }
}
```

### Con Autenticación (Futuro)

Cuando se implemente autenticación:

```json
{
  "mcpServers": {
    "grafo-query-http": {
      "url": "http://localhost:8083/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Detrás de Nginx/Proxy

Si Grafo está detrás de un proxy:

```json
{
  "mcpServers": {
    "grafo-query-http": {
      "url": "https://tu-dominio.com/api/grafo/mcp/sse",
      "transport": "sse"
    }
  }
}
```

**Configuración de Nginx requerida:**

```nginx
location /api/grafo/mcp/ {
    rewrite ^/api/grafo/mcp/(.*)$ /$1 break;
    proxy_pass http://localhost:8082;

    # Headers para SSE
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    chunked_transfer_encoding on;
}
```

---

## Logs y Depuración

### Ver Logs del MCP Server

```bash
# Logs en tiempo real
grafo mcp logs

# Solo errores
grafo mcp logs | grep -i error

# Logs de Cursor (macOS)
tail -f ~/Library/Application\ Support/Cursor/logs/main.log

# Logs de Cursor (Windows)
Get-Content "$env:APPDATA\Cursor\logs\main.log" -Wait
```

### Habilitar Debug en MCP Server

Editar `Grafo/Query/.env`:

```bash
LOG_LEVEL=DEBUG
```

Reiniciar:

```bash
grafo mcp restart
```

---

## Comparación: Antes (stdio) vs Ahora (HTTP/SSE)

| Aspecto | stdio (Obsoleto) ❌ | HTTP/SSE (Actual) ✅ |
|---------|---------------------|----------------------|
| **Configuración** | Compleja (`docker exec`) | Simple (`url` + `transport`) |
| **Múltiples clientes** | No (bloqueante) | Sí (stateless) |
| **Debugging** | Difícil | Fácil (logs HTTP) |
| **Health checks** | No | Sí (`/health`) |
| **Monitoreo** | No | Sí (métricas HTTP) |
| **Firewall friendly** | No | Sí |
| **Proxy support** | No | Sí |
| **Reconnection** | Manual | Automática |

---

## Referencias

- **Documentación MCP:** https://modelcontextprotocol.io/
- **Cursor MCP Guide:** https://docs.cursor.com/context/model-context-protocol
- **Grafo QUICKSTART:** `Grafo/QUICKSTART.md`
- **Grafo README:** `Grafo/README.md`
- **MCP Server Code:** `Grafo/Query/src/mcp_server_http.py`

---

## Soporte

### Issues
https://github.com/tu-repo/grafo/issues

### Logs Importantes

- MCP Server: `grafo mcp logs`
- MongoDB: `grafo mongodb logs`
- Cursor: `~/Library/Application Support/Cursor/logs/main.log` (macOS)
- Cursor: `%APPDATA%\Cursor\logs\main.log` (Windows)

---

**Última actualización:** 2025-01-21
**Versión Grafo:** 1.0.0
**Protocolo MCP:** HTTP/SSE
