# IndexerDb - Graph Data Processor with Semantic Model Support

IndexerDb es una aplicación .NET 8 que procesa archivos de grafo JSON generados por el **RoslynIndexer con Semantic Model** y los almacena en una base de datos MongoDB de forma **incremental por proyecto**, permitiendo consultas eficientes y actualizaciones optimizadas.

## 🔬 Soporte de Semantic Model

IndexerDB está completamente integrado con el **Roslyn Semantic Model** del RoslynIndexer, capturando y almacenando:

- ✅ **Herencias (Inherits)**: Relaciones de clases derivadas → clases base
- ✅ **Implementaciones (Implements)**: Clases concretas → interfaces
- ✅ **Llamadas (Calls)**: Invocaciones de métodos con información semántica
- ✅ **Usos (Uses)**: Referencias a tipos en el código
- ✅ **Namespaces Completos**: Todos los nodos contienen su namespace completo
- ✅ **Metadata Semántica**: IsAbstract, IsStatic, IsSealed, Accessibility

## 🚀 Características Principales

### ✨ **Procesamiento Incremental por Proyecto**
- **Detección de Cambios**: Solo procesa proyectos que han cambiado desde la última ejecución
- **Hash de Contenido**: Utiliza hashes SHA-256 para detectar cambios precisos en cada proyecto
- **Timestamps**: Rastrea cuándo se procesó cada proyecto por última vez
- **Optimización**: Evita reprocesar proyectos sin cambios, mejorando significativamente la performance

### 📊 **Logging Detallado**
- **Progreso en Tiempo Real**: Muestra el progreso detallado paso a paso
- **Estadísticas por Proyecto**: Información específica de cada proyecto procesado
- **Resumen Final**: Estadísticas consolidadas al final del procesamiento
- **Indicadores Visuales**: Usa emojis y colores para mejorar la legibilidad

### 🎯 **Modo Interactivo Mejorado**
- **Consultas por Proyecto**: Busca y analiza proyectos individuales
- **Análisis por Capas**: Agrupa proyectos por capas arquitectónicas
- **Navegación de Grafo**: Explora nodos y aristas por proyecto
- **Búsqueda Inteligente**: Búsqueda de texto en nombres de proyectos

### ⚡ **Funcionalidades Avanzadas**
- **Selección Interactiva**: Elige qué archivos procesar
- **Argumentos de Línea de Comandos**: Procesamiento automatizado
- **Almacenamiento Dual**: MongoDB optimizado para consultas rápidas
- **Configuración Flexible**: Configuración mediante `appsettings.json`

## Prerequisitos

- .NET 8.0 SDK
- **MongoDB 8.0 o superior** (opcional - incluye servicio mock para desarrollo)
- Archivos de grafo generados por el componente Indexer

### 🔧 Opciones de Base de Datos

| Opción | Descripción | Uso Recomendado |
|--------|-------------|-----------------|
| **MongoDB Real** | Base de datos persistente completa | Producción, datos importantes |
| **Servicio Mock** | Almacenamiento en memoria (no persistente) | Desarrollo, testing, demos |
| **Fallback Automático** | Cambia a mock si MongoDB falla | Resiliencia automática |

## ⚙️ Configuración

### 🚀 Configuración Rápida (Desarrollo)

Para empezar rápidamente **sin MongoDB**:

```json
{
  "Application": {
    "EnableMongoDB": false,
    "MockDataMode": true
  }
}
```

### 📚 Configuración Completa

**Para desarrollo con MongoDB local:**

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
  },
  "InputSettings": {
    "InputDirectory": "../Indexer/output",
    "GraphFilePattern": "*GraphFiles",
    "GraphFileExtension": "-graph.json"
  }
}
```

**Para producción con autenticación:**

```json
{
  "MongoDB": {
    "ConnectionString": "mongodb://localhost:27017",
    "DatabaseName": "GraphDB",
    "CollectionName": "graphs",
    "Username": "graphdb_user",
    "Password": "secure_password",
    "AuthDatabase": "admin",
    "EnableAuth": true
  },
  "Application": {
    "EnableMongoDB": true,
    "MockDataMode": false
  }
}
```

### 🔧 Configuraciones por Entorno

La aplicación soporta múltiples archivos de configuración:

- `appsettings.json` - Configuración base
- `appsettings.Development.json` - Desarrollo (usa servicio mock por defecto)
- `appsettings.Production.json` - Producción (con autenticación)

### 📖 Guía Detallada de MongoDB

Para configuración completa de MongoDB, incluyendo Docker, autenticación y troubleshooting, consulta: **[MONGODB_SETUP.md](MONGODB_SETUP.md)**

## Instalación y Ejecución

1. **Navegar al directorio del proyecto**:
   ```bash
   cd Grafo/IndexerDb
   ```

2. **Restaurar dependencias**:
   ```bash
   dotnet restore
   ```

3. **Compilar el proyecto**:
   ```bash
   dotnet build
   ```

4. **Ejecutar la aplicación**:
   ```bash
   dotnet run
   ```

## Uso

La aplicación soporta cuatro modos principales:

### 1. Modo de Consulta Interactiva (Solo Consultas)

```bash
dotnet run -- --interactive
# o forma corta
dotnet run -- -i
```

Comportamiento:
- ✅ **NO procesa archivos** (modo query-only)
- ✅ **Va directo al modo de consulta** de la base de datos existente
- ✅ Ideal para explorar datos ya cargados sin reprocesar
- ✅ Uso recomendado para análisis rápidos

### 2. Modo de Selección Interactiva (Por Defecto)

```bash
dotnet run
```

Comportamiento:
1. Busca archivos `-graph.json` en las carpetas `*GraphFiles`
2. Muestra una lista numerada de archivos encontrados
3. Permite seleccionar cuáles procesar (números separados por comas, 'all', o 'none')
4. Procesa los archivos seleccionados
5. Sale del programa (sin entrar al modo de consulta)

### 3. Archivo Específico

```bash
dotnet run -- --file "ruta/completa/al/archivo-graph.json"
# o
dotnet run -- -f "../Indexer/output/ICB7C_GraphFiles/Infocorp.Banking-graph.json"
```

Comportamiento:
- Procesa únicamente el archivo especificado
- Valida que el archivo existe antes de procesarlo
- Sale del programa

### 4. Procesamiento Automático de Todos los Archivos

```bash
dotnet run -- --all
# o también funciona
dotnet run -- --no-select
```

Comportamiento:
- Busca y procesa TODOS los archivos encontrados automáticamente
- No muestra selección de archivos
- Sale del programa

### 💡 Combinar Procesamiento con Consultas

Puedes combinar `--interactive` con otros modos para procesar **y luego** consultar:

```bash
# Procesar archivo específico y entrar a modo consulta
dotnet run -- --file "archivo.json" --interactive

# Procesar todos los archivos y entrar a modo consulta
dotnet run -- --all --interactive
```

### 5. Ver Ayuda

```bash
dotnet run -- --help
# o  
dotnet run -- -h
```

### Opciones de Línea de Comandos

| Opción | Forma Corta | Descripción |
|--------|-------------|-------------|
| `--file <path>` | `-f <path>` | Procesa un archivo específico por su ruta completa |
| `--no-interactive` | | Procesa todos los archivos encontrados sin preguntar |
| `--help` | `-h` | Muestra información de uso |

### Ejemplos de Uso

```bash
# Modo por defecto - selección interactiva
IndexerDb

# Procesar archivo específico con ruta relativa
IndexerDb --file "../Indexer/output/ICB7C_GraphFiles/Banking-graph.json"

# Procesar archivo específico con ruta absoluta
IndexerDb --file "C:\GIT\Guru\Grafo\Indexer\output\ICB7C_GraphFiles\Infocorp.Banking-graph.json"

# Procesar todos los archivos automáticamente
IndexerDb --no-interactive

# Ver ayuda
IndexerDb --help
```

### Selección Interactiva de Archivos

Cuando se ejecuta en modo por defecto, la aplicación muestra:

```
Found 3 graph files:
==================================================
 1. Infocorp.Banking-graph.json (in ICB7C_GraphFiles)
 2. OtherProject-graph.json (in PROJ2_GraphFiles)  
 3. TestProject-graph.json (in TEST_GraphFiles)
==================================================
Select files to process:
  - Enter numbers separated by commas (e.g., 1,3,5)
  - Enter 'all' to process all files
  - Enter 'none' or leave empty to skip processing

Selection: 1,3
```

### 🎯 Modo de Consulta Interactiva Mejorado

Accede al modo interactivo de dos formas:
1. **Directo**: `dotnet run -- --interactive` (no procesa archivos, solo consulta)
2. **Después del procesamiento**: Usa `--interactive` con otros flags para procesar y luego consultar

El modo interactivo tiene soporte completo para consultas de Semantic Model:

#### Comandos de Proyectos:
```
IndexerDB> help                        # Muestra ayuda completa
IndexerDB> count                       # Total de proyectos
IndexerDB> projects list               # Lista todos los proyectos
IndexerDB> projects <nombre>           # Busca proyectos por nombre
IndexerDB> layers                      # Proyectos por capa arquitectónica
IndexerDB> search <término>            # Búsqueda de proyectos
IndexerDB> nodes <project-id>          # Nodos de un proyecto específico
IndexerDB> edges <project-id>          # Aristas de un proyecto específico
IndexerDB> clear                       # Elimina todos los proyectos
IndexerDB> exit                        # Sale de la aplicación
```

#### 🔬 Comandos de Semantic Model:
```
IndexerDB> semantic                    # Estadísticas del Semantic Model
IndexerDB> stats                       # Alias para semantic
IndexerDB> inherits [limit]            # Relaciones de herencia (default: 10)
IndexerDB> implements [limit]          # Implementaciones de interfaces (default: 10)
IndexerDB> calls [limit]               # Llamadas a métodos (default: 10)
IndexerDB> uses [limit]                # Uso de tipos (default: 10)
```

#### Ejemplos de Consultas Semánticas:
```bash
# Ver estadísticas completas del Semantic Model
IndexerDB> semantic

📊 Semantic Model Statistics:
════════════════════════════════════════════════════════════
  Total Nodes:                      42,156
  Total Edges:                      89,342

  🔹 Inherits (Herencia):            6,013
  🔹 Implements (Interfaces):          271
  🔹 Calls (Llamadas):               7,191
  🔹 Uses (Uso de tipos):            3,312
────────────────────────────────────────────────────────────
  Total Semantic Edges:             16,787

  Classes with Namespace:           10,623
  Interfaces with Namespace:           335
════════════════════════════════════════════════════════════

# Ver 20 relaciones de herencia
IndexerDB> inherits 20

# Ver 15 implementaciones de interfaces
IndexerDB> implements 15

# Ver 30 llamadas a métodos
IndexerDB> calls 30
```

### 📊 Ejemplo de Logging Detallado

```
=== Starting Incremental Processing ===
File: Infocorp.Banking-graph.json
Path: C:\GIT\Guru\Grafo\Indexer\output\ICB7C_GraphFiles\Infocorp.Banking-graph.json

📋 Step 1/6: Calculating file hash...
✅ File hash: abc123def456...

📋 Step 2/6: Checking for previous processing state...
🔄 File has changed or is new. Processing...

📋 Step 3/6: Parsing JSON document...
✅ Parsed document with 42,156 nodes and 89,342 edges

📋 Step 4/6: Extracting individual projects...
✅ Extracted 85 projects

📋 Step 5/6: Processing projects incrementally...
[1/85] Processing project: BackOffice.BusinessComponents
   🔄 Project NEW - Nodes: 156, Edges: 342
   ✅ New project saved successfully

[2/85] Processing project: Core.Domain
   ⏩ Project unchanged. Skipping...

[3/85] Processing project: API.Controllers
   🔄 Project UPDATED - Nodes: 89, Edges: 178
   ✅ Updated project saved successfully

=== Processing Complete ===
⏱️  Total time: 02:34.567
📊 Summary:
   - Total projects: 85
   - New projects: 23
   - Updated projects: 15
   - Skipped projects: 47

=== FINAL SUMMARY ===
📊 Overall Results:
   - Files processed: 1
   - Total projects: 85
   - New projects: 23
   - Updated projects: 15
   - Skipped projects: 47
   - Total projects in database: 1,247
```

### Ejemplos de Consultas

```bash
# Buscar nodos que contengan "Service" en el nombre
GraphDB> search node Service

# Buscar todos los nodos de tipo "Class"
GraphDB> search type Class

# Obtener todas las aristas conectadas a un nodo específico
GraphDB> search edges solution:root

# Ver estadísticas
GraphDB> count
GraphDB> list

## Casos de Uso Prácticos

### Flujo de Trabajo Típico

1. **Primera Ejecución - Explorar Archivos Disponibles**:
   ```bash
   dotnet run
   # Selecciona 'none' para ver qué archivos están disponibles sin procesarlos
   ```

2. **Procesar Archivos Seleccionados**:
   ```bash
   dotnet run
   # Selecciona los números de los archivos que quieres procesar: 1,3,5
   ```

3. **Actualizar un Archivo Específico**:
   ```bash
   dotnet run --file "../Indexer/output/ICB7C_GraphFiles/Updated-graph.json"
   ```

4. **Procesamiento en Lote para CI/CD**:
   ```bash
   dotnet run --no-interactive  # Procesa todos automáticamente
   ```

### Integración con Scripts de Automatización

```bash
# Script de PowerShell para procesar automáticamente
cd C:\GIT\Guru\Grafo\IndexerDb
dotnet run -- --no-interactive

# Script para procesar un archivo específico generado recientemente
$latestFile = Get-ChildItem "../Indexer/output/*GraphFiles/*-graph.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
dotnet run -- --file $latestFile.FullName
```

## 🔄 Funcionamiento del Procesamiento Incremental

### Detección de Cambios por Proyecto

1. **Hash de Archivo**: Calcula SHA-256 del archivo completo para detección rápida de cambios
2. **Extracción de Proyectos**: Separa el grafo monolítico en proyectos individuales
3. **Hash por Proyecto**: Calcula hash específico para cada proyecto basado en:
   - Nombre del proyecto
   - Cantidad de nodos y aristas
   - IDs y propiedades de nodos
   - Relaciones entre aristas
4. **Comparación**: Compara hashes actuales vs. almacenados en la base de datos
5. **Procesamiento Selectivo**: Solo actualiza proyectos que han cambiado

### Estados de Procesamiento

- **🆕 NEW**: Proyecto encontrado por primera vez
- **🔄 UPDATED**: Proyecto existente con cambios detectados
- **⏩ SKIPPED**: Proyecto sin cambios desde la última ejecución
- **❌ FAILED**: Error durante el procesamiento del proyecto

### Persistencia de Estado

```json
{
  "sourceFile": "Infocorp.Banking-graph.json",
  "fileHash": "abc123...",
  "lastProcessed": "2025-10-14T19:30:00Z",
  "totalProjects": 85,
  "projectStates": {
    "project:BackOffice.BusinessComponents": {
      "contentHash": "def456...",
      "lastProcessed": "2025-10-14T19:30:00Z",
      "nodeCount": 156,
      "edgeCount": 342,
      "status": "New"
    }
  }
}
```

### Beneficios del Procesamiento Incremental

- ⚡ **Performance**: Reduce tiempo de procesamiento en 70-90% en ejecuciones subsecuentes
- 💾 **Optimización de Recursos**: Evita carga innecesaria de CPU y memoria
- 🔍 **Trazabilidad**: Historial completo de cambios por proyecto
- 🚀 **Escalabilidad**: Maneja proyectos grandes eficientemente
- 🔒 **Consistencia**: Garantiza que solo se procesen cambios reales

## Estructura de Datos

### GraphDocument (Documento Principal)
- **Metadata**: Información sobre cuándo y dónde se generó el grafo
- **Nodes**: Lista de nodos del grafo con propiedades como ID, nombre, tipo, etc.
- **Edges**: Lista de aristas que conectan los nodos con relaciones
- **ImportedAt**: Timestamp de cuándo se importó a la base de datos
- **SourceFile**: Nombre del archivo fuente
- **SourceDirectory**: Directorio del archivo fuente

### Capacidades de Consulta

La aplicación permite consultas eficientes sobre:
- Búsqueda de nodos por nombre (case-insensitive, substring matching)
- Filtrado de nodos por tipo
- Navegación de aristas desde/hacia nodos específicos
- Metadatos de origen y tiempo de importación

## Arquitectura

```
IndexerDb/
├── Models/           # Modelos de datos (GraphDocument, GraphNode, GraphEdge, etc.)
├── Services/         # Servicios de negocio
│   ├── IFileProcessorService.cs      # Interfaz para procesamiento de archivos
│   ├── FileProcessorService.cs       # Implementación del procesador de archivos
│   ├── IGraphDatabaseService.cs      # Interfaz para operaciones de base de datos
│   └── GraphDatabaseService.cs       # Implementación del servicio de MongoDB
├── Program.cs        # Punto de entrada principal
├── appsettings.json  # Configuración de la aplicación
└── README.md         # Este archivo
```

## Dependencias

- **MongoDB.Driver**: Cliente oficial de MongoDB para .NET
- **Newtonsoft.Json**: Procesamiento de JSON
- **Microsoft.Extensions.Hosting**: Inyección de dependencias y configuración
- **Microsoft.Extensions.Logging**: Sistema de logging

## Desarrollo y Extensiones

Para extender la funcionalidad:

1. **Agregar nuevas consultas**: Implementar métodos adicionales en `IGraphDatabaseService`
2. **Diferentes formatos de entrada**: Extender `IFileProcessorService` para otros formatos
3. **APIs REST**: Agregar controladores web para acceso remoto
4. **Visualización**: Integrar con bibliotecas de visualización de grafos

## Solución de Problemas

### Error de Conexión a MongoDB
- Verifica que MongoDB esté ejecutándose
- Confirma que la cadena de conexión en `appsettings.json` sea correcta

### Archivos No Encontrados
- Verifica que el directorio de entrada exista
- Confirma que los patrones de archivo sean correctos
- Asegúrate de que existan archivos `-graph.json` en carpetas `*GraphFiles`

### Problemas de Memoria
- Para archivos de grafo muy grandes, considera procesarlos en lotes
- Ajusta la configuración de MongoDB para manejar documentos grandes
