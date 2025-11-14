# Guía de Uso del Semantic Model en Query Service

Esta guía explica cómo utilizar los nuevos endpoints de Semantic Model implementados en el Query Service.

## 🚀 Inicio Rápido

### 1. Iniciar el Servicio

```bash
cd Grafo/Query
python -m uvicorn src.server:app --reload --host 0.0.0.0 --port 8000
```

O usando el script de inicio rápido:
```bash
./quick_start.sh
```

### 2. Verificar que el Servicio está Funcionando

```bash
curl http://localhost:8000/health
```

### 3. Acceder a la Documentación Interactiva

Navega a: `http://localhost:8000/docs`

## 📊 Endpoints de Semantic Model

### 1. Estadísticas Completas del Semantic Model

Obtiene un resumen completo de todas las relaciones semánticas en la base de datos.

```bash
curl http://localhost:8000/api/semantic/stats
```

**Respuesta de Ejemplo:**
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

### 2. Relaciones de Herencia (Inherits)

Lista las relaciones donde una clase hereda de otra.

```bash
curl "http://localhost:8000/api/semantic/inherits?limit=10"
```

**Parámetros:**
- `limit` (opcional): Número máximo de resultados (default: 100, max: 500)

### 3. Implementaciones de Interfaces (Implements)

Lista las relaciones donde una clase implementa una interfaz.

```bash
curl "http://localhost:8000/api/semantic/implements?limit=10"
```

### 4. Llamadas a Métodos (Calls)

Lista las relaciones donde un método llama a otro método.

```bash
curl "http://localhost:8000/api/semantic/calls?limit=50"
```

### 5. Uso de Tipos (Uses)

Lista las relaciones donde un elemento usa un tipo (como parámetro, variable, etc.).

```bash
curl "http://localhost:8000/api/semantic/uses?limit=50"
```

### 6. Jerarquía de Herencia de una Clase

Obtiene la jerarquía completa (ancestros y descendientes) de una clase específica.

```bash
curl -X POST http://localhost:8000/api/semantic/hierarchy \
  -H "Content-Type: application/json" \
  -d '{
    "classId": "class:YourClassName",
    "maxDepth": 5
  }'
```

**Respuesta de Ejemplo:**
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

### 7. Implementaciones de una Interfaz

Obtiene todas las clases que implementan una interfaz específica.

```bash
curl -X POST http://localhost:8000/api/semantic/implementations \
  -H "Content-Type: application/json" \
  -d '{
    "interfaceId": "interface:IUserRepository"
  }'
```

**Respuesta de Ejemplo:**
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

## 🔍 Integración con Estadísticas Generales

El endpoint de estadísticas generales ahora incluye automáticamente métricas del Semantic Model:

```bash
curl http://localhost:8000/api/context/statistics
```

**Respuesta Incluye:**
```json
{
  "totalProjects": 78,
  "totalNodes": 42156,
  "totalEdges": 89342,
  "avgNodesPerProject": 540.46,
  "avgEdgesPerProject": 1145.41,
  "projectsByLayer": { ... },
  "semantic": {
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
}
```

## 💡 Casos de Uso Comunes

### Encontrar Todas las Clases que Heredan de una Base

1. Buscar la clase base:
```bash
curl "http://localhost:8000/api/nodes/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "BaseService",
    "nodeType": "Class",
    "limit": 1
  }'
```

2. Obtener su jerarquía:
```bash
curl -X POST http://localhost:8000/api/semantic/hierarchy \
  -H "Content-Type: application/json" \
  -d '{
    "classId": "class:BaseService",
    "maxDepth": 10
  }'
```

### Analizar Implementaciones de un Patrón Repository

1. Buscar una interfaz de repositorio:
```bash
curl "http://localhost:8000/api/nodes/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "IRepository",
    "nodeType": "Interface",
    "limit": 10
  }'
```

2. Ver sus implementaciones:
```bash
curl -X POST http://localhost:8000/api/semantic/implementations \
  -H "Content-Type: application/json" \
  -d '{
    "interfaceId": "interface:IRepository"
  }'
```

### Analizar Dependencias de Métodos

Obtener todas las llamadas a métodos para analizar el flujo de ejecución:

```bash
curl "http://localhost:8000/api/semantic/calls?limit=200"
```

## 🧪 Testing con Python

```python
import requests

BASE_URL = "http://localhost:8000/api"

# Obtener estadísticas
response = requests.get(f"{BASE_URL}/semantic/stats")
stats = response.json()
print(f"Total Semantic Edges: {stats['totalSemanticEdges']}")

# Buscar herencias
response = requests.get(f"{BASE_URL}/semantic/inherits", params={"limit": 10})
inherits = response.json()
print(f"Found {inherits['count']} inheritance relationships")

# Obtener jerarquía de una clase
response = requests.post(
    f"{BASE_URL}/semantic/hierarchy",
    json={"classId": "class:UserService", "maxDepth": 5}
)
hierarchy = response.json()
if hierarchy["found"]:
    print(f"Class: {hierarchy['class']['fullName']}")
    print(f"Ancestors: {len(hierarchy['ancestors'])}")
    print(f"Descendants: {len(hierarchy['descendants'])}")
```

## 📚 Recursos Adicionales

- **Documentación Interactiva (Swagger)**: http://localhost:8000/docs
- **OpenAPI Schema**: http://localhost:8000/openapi.json
- **Health Check**: http://localhost:8000/health

## 🔗 Flujo Completo de Trabajo

```
┌────────────────┐         ┌──────────────┐         ┌──────────────┐
│  RoslynIndexer │ ───────> │  IndexerDB   │ ───────> │ Query Service│
│ (Semantic Model) │         │  (MongoDB)   │         │ (FastAPI)    │
└────────────────┘         └──────────────┘         └──────────────┘
        ↓                          ↓                        ↓
   Genera grafo              Almacena en DB          Consultas vía API
   con relaciones            con proyectos           - Estadísticas
   semánticas:               separados               - Jerarquías
   - Inherits                                        - Implementaciones
   - Implements                                      - Llamadas
   - Calls                                           - Usos de tipos
   - Uses
```

## 🆘 Troubleshooting

### El endpoint retorna 500

- Verificar que MongoDB esté corriendo y accesible
- Verificar que IndexerDB haya procesado los archivos correctamente
- Revisar logs del servicio para más detalles

### No se encuentran relaciones semánticas

- Asegurarse de que RoslynIndexer esté usando Semantic Model (no syntax-only)
- Verificar que los proyectos se compilaron correctamente antes del análisis
- Regenerar el grafo con el Indexer actualizado

### Respuesta vacía en estadísticas

- Verificar que hay datos en MongoDB:
  ```bash
  curl http://localhost:8000/api/projects/
  ```
- Si no hay proyectos, ejecutar IndexerDB para procesar archivos de grafo

