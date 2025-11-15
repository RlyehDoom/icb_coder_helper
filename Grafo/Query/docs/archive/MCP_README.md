# MCP Server - Grafo Query Service

Este directorio contiene un servidor MCP (Model Context Protocol) que expone las funcionalidades del Query Service como herramientas que pueden ser consumidas por IDEs como Cursor o VSCode.

## 🎯 ¿Qué es esto?

El **MCP Server** permite que Cursor/VSCode consulte el grafo de código C# directamente desde el IDE, proporcionando contexto inteligente para:

- 🔍 Buscar clases, métodos, interfaces existentes
- 📊 Obtener contexto de código con dependencias y relaciones
- 🏗️ Entender la estructura de proyectos
- 🔗 Encontrar implementaciones y herencias
- 📈 Analizar estadísticas del grafo

## 📦 Arquitectura

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│ Cursor/     │   MCP   │  MCP Server      │  Async  │ MongoDB      │
│ VSCode      │◄───────►│  (stdio)         │◄───────►│ (GraphDB)    │
└─────────────┘         └──────────────────┘         └──────────────┘
                               ▲
                               │
                               │ Uses
                               ▼
                        ┌──────────────────┐
                        │ GraphQueryService│
                        │ (Existing Logic) │
                        └──────────────────┘
```

## 🚀 Instalación

Puedes ejecutar el MCP Server de dos formas: **Local** o **Docker**.

### Opción A: Instalación Local

#### 1. Instalar Dependencias

```bash
cd Grafo/Query

# Activar entorno virtual
source venv/bin/activate  # Linux/Mac
# o
venv\Scripts\activate     # Windows

# Instalar dependencias (incluye mcp)
pip install -r requirements.txt
```

### 2. Verificar MongoDB

Asegúrate de que MongoDB esté ejecutándose y que el Query Service tenga datos:

```bash
# Verificar MongoDB
mongosh "mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/"

# En mongosh:
use GraphDB
db.projects.countDocuments()  # Debe retornar > 0
```

Si no hay datos, ejecuta el pipeline de indexación:

```bash
# 1. Indexar código
cd ../Indexer
dotnet run -- --solution "<path-to-solution.sln>"

# 2. Almacenar en MongoDB
cd ../IndexerDb
dotnet run --all
```

#### 3. Probar el Servidor MCP

```bash
cd Grafo/Query
python start_mcp.py
```

El servidor debe iniciar y mostrar:
```
🚀 Iniciando MCP Server para Grafo Query Service...
✅ Conectado a MongoDB
✅ GraphQueryService inicializado
✅ Herramientas MCP inicializadas
✅ MCP Server listo
🌐 Iniciando servidor MCP en stdio...
```

---

### Opción B: Instalación con Docker 🐳

**Ventajas:**
- ✅ Sin necesidad de instalar Python o dependencias
- ✅ Entorno aislado y reproducible
- ✅ Health checks automáticos
- ✅ Fácil actualización

#### 1. Build y Start

```bash
cd Grafo/Query

# Build de la imagen
./docker-mcp.sh build

# Iniciar el servidor
./docker-mcp.sh start
```

#### 2. Verificar Estado

```bash
./docker-mcp.sh status
```

Deberías ver:
```
✓ Contenedor está CORRIENDO
grafo-mcp-server    Up 2 minutes (healthy)
✓ Health: healthy
```

#### 3. Ver Logs

```bash
./docker-mcp.sh logs
```

#### 4. Ejecutar Tests

```bash
./docker-mcp.sh test
```

**📖 Documentación completa de Docker:** Ver [MCP_DOCKER.md](MCP_DOCKER.md)

**Comandos útiles:**
```bash
./docker-mcp.sh build      # Construir imagen
./docker-mcp.sh start      # Iniciar contenedor
./docker-mcp.sh stop       # Detener contenedor
./docker-mcp.sh restart    # Reiniciar
./docker-mcp.sh logs       # Ver logs
./docker-mcp.sh shell      # Abrir shell en contenedor
./docker-mcp.sh clean      # Limpiar todo
```

---

## 🔧 Configuración en Cursor

### Para Instalación Local

Edita el archivo de configuración de Cursor:

**Windows:** `%APPDATA%\Cursor\User\globalStorage\cursor-settings.json`
**Mac/Linux:** `~/.cursor/User/globalStorage/cursor-settings.json`

Agrega esta configuración:

```json
{
  "mcpServers": {
    "grafo-query": {
      "command": "C:/GITHUB/icb_coder_helper/Grafo/Query/venv/Scripts/python.exe",
      "args": ["start_mcp.py"],
      "cwd": "C:/GITHUB/icb_coder_helper/Grafo/Query",
      "env": {
        "PYTHONPATH": "C:/GITHUB/icb_coder_helper/Grafo/Query"
      }
    }
  }
}
```

**Importante:** Ajusta las rutas según tu instalación.

**Archivo de referencia:** Usa `mcp_config_venv.json` como plantilla.

---

### Para Instalación Docker

Si ejecutas el MCP Server en Docker, usa esta configuración:

```json
{
  "mcpServers": {
    "grafo-query-docker": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "grafo-mcp-server",
        "python",
        "start_mcp.py"
      ]
    }
  }
}
```

**Archivo de referencia:** Usa `mcp_config_docker.json` como plantilla.

**Nota:** El contenedor debe estar ejecutándose antes de usar Cursor.

### Opción 2: Configuración por Proyecto

Crea un archivo `.cursor/mcp.json` en la raíz de tu proyecto:

```json
{
  "mcpServers": {
    "grafo-query": {
      "command": "python",
      "args": ["C:/GITHUB/icb_coder_helper/Grafo/Query/start_mcp.py"],
      "env": {
        "PYTHONPATH": "C:/GITHUB/icb_coder_helper/Grafo/Query"
      }
    }
  }
}
```

### Archivo de Configuración Incluido

Puedes usar los archivos de configuración incluidos como referencia:

- `mcp_config.json` - Para usar Python del sistema
- `mcp_config_venv.json` - Para usar Python del venv (recomendado)

Copia el contenido y ajusta las rutas según tu instalación.

## 🔧 Configuración en VSCode

Para VSCode, instala la extensión MCP y configura de manera similar:

1. Instala la extensión **Model Context Protocol** desde el marketplace
2. Abre la configuración de VSCode (`Ctrl+,` o `Cmd+,`)
3. Busca "MCP Servers"
4. Agrega la configuración del servidor

O edita directamente `settings.json`:

```json
{
  "mcp.servers": {
    "grafo-query": {
      "command": "python",
      "args": ["C:/GITHUB/icb_coder_helper/Grafo/Query/start_mcp.py"],
      "cwd": "C:/GITHUB/icb_coder_helper/Grafo/Query"
    }
  }
}
```

## 🛠️ Herramientas Disponibles

El MCP Server expone 6 herramientas:

### 1. `search_code`

Busca elementos de código en el grafo.

**Parámetros:**
- `query` (requerido): Término de búsqueda
- `node_type` (opcional): Tipo de nodo (Class, Interface, Method, etc.)
- `project` (opcional): Filtrar por proyecto
- `limit` (opcional): Máximo de resultados (default: 20)

**Ejemplo en Cursor:**
```
"Busca la clase UserService"
```

### 2. `get_code_context`

Obtiene contexto detallado de un elemento con sus relaciones.

**Parámetros:**
- `className` (requerido): Nombre de la clase
- `methodName` (opcional): Nombre del método
- `namespace` (opcional): Namespace completo
- `project` (opcional): Proyecto específico
- `includeRelated` (opcional): Incluir nodos relacionados (default: true)
- `maxDepth` (opcional): Profundidad de relaciones (default: 2)

**Ejemplo en Cursor:**
```
"Dame el contexto completo de la clase AuthenticationService"
```

### 3. `list_projects`

Lista los proyectos disponibles en el grafo.

**Parámetros:**
- `query` (opcional): Filtro por nombre
- `limit` (opcional): Máximo de proyectos (default: 50)

**Ejemplo en Cursor:**
```
"Qué proyectos están disponibles?"
```

### 4. `get_project_structure`

Obtiene la estructura completa de un proyecto.

**Parámetros:**
- `project_id` (requerido): ID o nombre del proyecto
- `node_type` (opcional): Filtrar por tipo de nodo

**Ejemplo en Cursor:**
```
"Muéstrame la estructura del proyecto Banking"
```

### 5. `find_implementations`

Encuentra implementaciones de una interfaz o herencias.

**Parámetros:**
- `interface_or_class` (requerido): Nombre de la interfaz o clase base
- `namespace` (opcional): Namespace

**Ejemplo en Cursor:**
```
"Qué clases implementan IUserRepository?"
```

### 6. `get_statistics`

Obtiene estadísticas generales del grafo.

**Ejemplo en Cursor:**
```
"Cuántos proyectos y clases hay indexados?"
```

## 💡 Uso en Cursor

Una vez configurado, puedes usar el MCP directamente desde el chat de Cursor:

### Ejemplo 1: Buscar antes de crear

```
Usuario: "Necesito crear un servicio de autenticación"

Claude (usando MCP):
1. Primero busco si ya existe...
   [Usa search_code con query="AuthenticationService"]
2. Encontré AuthenticationService en el proyecto Framework.Security
   [Usa get_code_context para ver implementación]
3. Te recomiendo extender esta clase existente en lugar de crear una nueva...
```

### Ejemplo 2: Entender dependencias

```
Usuario: "Quiero modificar el UserController, qué debo tener en cuenta?"

Claude (usando MCP):
1. Obteniendo contexto del UserController...
   [Usa get_code_context]
2. Encontré que depende de:
   - IUserService (interfaz)
   - UserRepository (datos)
   - ValidationService (validaciones)
3. Si modificas el UserController, asegúrate de...
```

### Ejemplo 3: Explorar arquitectura

```
Usuario: "Explícame la arquitectura del proyecto Banking"

Claude (usando MCP):
1. Listando proyectos disponibles...
   [Usa list_projects]
2. Obteniendo estructura del proyecto Banking...
   [Usa get_project_structure]
3. El proyecto Banking sigue una arquitectura en capas:
   - Controllers: 15 controladores API
   - Services: 23 servicios de negocio
   - Repositories: 12 repositorios de datos
   ...
```

## 🐛 Troubleshooting

### El MCP no se conecta en Cursor

1. **Verificar logs:** Cursor muestra logs en la consola de desarrollador (`Ctrl+Shift+I`)
2. **Verificar rutas:** Asegúrate de que las rutas en la configuración sean absolutas y correctas
3. **Verificar Python:** El comando `python` debe apuntar a Python 3.11+
4. **Verificar venv:** Si usas venv, usa la ruta completa al ejecutable de Python del venv

### Error "MCP Tools not initialized"

El servidor MCP no pudo conectarse a MongoDB. Verifica:

```bash
# Verificar MongoDB está corriendo
docker ps | grep mongodb-grafo

# Verificar configuración en .env
cat Grafo/Query/.env

# Variables clave:
# MONGODB_CONNECTION_STRING=mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/
# MONGODB_DATABASE=GraphDB
```

### Error "Graph service not initialized"

MongoDB está corriendo pero no tiene datos. Ejecuta el pipeline de indexación:

```bash
cd Grafo/Indexer
dotnet run -- --solution "<path-to-solution.sln>"

cd ../IndexerDb
dotnet run --all
```

### El servidor se cierra inmediatamente

Verifica los logs del servidor MCP:

```bash
cd Grafo/Query
python start_mcp.py 2>&1 | tee mcp_debug.log
```

Revisa `mcp_debug.log` para ver el error específico.

### Cursor no muestra las herramientas

1. Reinicia Cursor completamente
2. Verifica que el servidor MCP esté en la configuración correcta
3. Abre el panel de MCP en Cursor (debería mostrar "grafo-query" conectado)

## 📊 Logs y Debugging

### Ver logs del servidor MCP

El servidor registra toda su actividad. Para debugging:

```bash
cd Grafo/Query
python start_mcp.py 2>&1 | tee mcp.log
```

Los logs mostrarán:
- ✅ Conexión exitosa a MongoDB
- 📋 Herramientas listadas
- 🔧 Ejecución de herramientas
- ❌ Errores y excepciones

### Nivel de logging

Modifica el nivel de logging en `src/mcp_server.py`:

```python
logging.basicConfig(
    level=logging.DEBUG,  # Cambiar a DEBUG para más detalle
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

## 🔄 Actualización de Datos

Cuando el código C# cambia, necesitas re-indexar:

```bash
# 1. Re-indexar
cd Grafo/Indexer
dotnet run -- --solution "<path-to-solution.sln>"

# 2. Re-procesar (incremental)
cd ../IndexerDb
dotnet run --all

# 3. Reiniciar MCP Server (Cursor lo hace automáticamente)
```

El MCP Server reflejará los cambios inmediatamente después de re-procesar.

## 📝 Desarrollo

### Agregar nuevas herramientas

1. Edita `src/mcp_tools.py`
2. Agrega un nuevo `Tool` en `get_tools()`
3. Implementa el método `_tu_nueva_herramienta()`
4. Agrega el case en `execute_tool()`
5. Reinicia el servidor MCP

### Ejemplo: Agregar herramienta para buscar por atributo

```python
# En get_tools()
Tool(
    name="find_by_attribute",
    description="Busca clases con un atributo específico",
    inputSchema={
        "type": "object",
        "properties": {
            "attribute": {"type": "string", "description": "Nombre del atributo"}
        },
        "required": ["attribute"]
    }
)

# Implementar método
async def _find_by_attribute(self, args: Dict[str, Any]) -> str:
    # Tu implementación aquí
    pass
```

## 🔗 Referencias

- **MCP Protocol:** https://modelcontextprotocol.io/
- **Cursor MCP Docs:** https://docs.cursor.com/advanced/mcp
- **Query Service Docs:** Ver README.md en este directorio
- **Ecosystem Overview:** Ver ../ECOSYSTEM_OVERVIEW.md

## 📄 Licencia

Este proyecto es parte del sistema Grafo/ICGuru.

---

**Version:** 1.0.0
**Última actualización:** Noviembre 2024
**Estado:** ✅ Listo para uso
