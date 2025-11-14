# Tests para GraphQueryService

Este directorio contiene pruebas encadenadas para el servicio de consultas de grafo (`GraphQueryService`).

## ⚠️ IMPORTANTE: Tests con Datos Reales

**Estos tests NO crean ni eliminan datos. Trabajan con datos REALES de la base de datos.**

- ✅ Solo realizan consultas de LECTURA
- ✅ Usan la configuración del `.env`
- ✅ Se adaptan a los datos existentes en la BD
- ❌ NO crean datos dummy
- ❌ NO eliminan datos
- ❌ NO modifican la base de datos

## Requisitos Previos

### 1. Base de Datos con Datos

**IMPORTANTE**: Debes tener datos indexados en la base de datos antes de ejecutar los tests.

```bash
# Primero ejecuta el indexer para poblar la base de datos
cd ../Indexer
./build.sh
dotnet run -- index <ruta-al-proyecto>

# O ejecuta IndexerDb si ya tienes datos procesados
cd ../IndexerDb
dotnet run
```

### 2. MongoDB en Ejecución

```bash
# Linux
sudo systemctl start mongod

# macOS
brew services start mongodb-community

# Windows
net start MongoDB
# o inicia el servicio desde Servicios de Windows
```

### 3. Archivo .env

El archivo `.env` debe existir en el directorio `Grafo/Query/` con la configuración de MongoDB:

```bash
MONGODB_CONNECTION_STRING=mongodb://usuario:password@localhost:27017/
MONGODB_DATABASE=GraphDB
MONGODB_PROJECTS_COLLECTION=projects
```

Si no existe `.env`, se usará la configuración por defecto de `config.py`.

## Estructura de Tests

### Tests Encadenados (`TestGraphServiceChained`)

Suite de 17 tests que simulan un flujo de trabajo real:

1. **test_01_get_code_context_by_class_name**: Obtiene contexto de una clase real
2. **test_02_get_code_context_by_method_name**: Obtiene contexto de un método real
3. **test_03_get_code_context_by_path**: Obtiene contexto por ruta de archivo
4. **test_04_search_nodes_from_context**: Busca nodos usando el contexto obtenido
5. **test_05_get_related_nodes_from_context**: Obtiene nodos relacionados reales
6. **test_06_get_related_nodes_with_relationship_filter**: Filtra por tipo de relación
7. **test_07_get_node_by_id_from_context**: Obtiene nodo por ID
8. **test_08_get_nodes_by_project_from_context**: Lista nodos del proyecto
9. **test_09_get_nodes_by_project_filtered_by_type**: Filtra nodos por tipo
10. **test_10_get_edges_by_project_from_context**: Obtiene aristas del proyecto
11. **test_11_get_project_by_id_from_context**: Obtiene información del proyecto
12. **test_12_get_project_with_graph**: Obtiene proyecto con grafo completo
13. **test_13_search_projects**: Busca proyectos por capa
14. **test_14_get_all_projects**: Lista todos los proyectos
15. **test_15_get_projects_by_layer**: Estadísticas por capa
16. **test_16_get_statistics**: Estadísticas generales
17. **test_17_complete_workflow**: Workflow completo end-to-end

### Tests Individuales (`TestGraphServiceIndividual`)

- Búsqueda de nodos por tipo
- Búsqueda de nodos por proyecto
- Casos de error (elementos no encontrados)

### Tests de Semantic Model (`TestSemanticModel`) 🔬

Suite de 10 tests específicos para funcionalidades del Semantic Model:

1. **test_01_get_semantic_stats**: Estadísticas completas del Semantic Model
2. **test_02_get_inheritance_relationships**: Relaciones de herencia (Inherits)
3. **test_03_get_implementation_relationships**: Implementaciones de interfaces (Implements)
4. **test_04_get_method_calls**: Llamadas a métodos (Calls)
5. **test_05_get_type_usages**: Usos de tipos (Uses)
6. **test_06_get_class_hierarchy_with_real_class**: Jerarquía de una clase real
7. **test_07_get_class_hierarchy_nonexistent**: Manejo de clase inexistente
8. **test_08_find_and_get_interface_implementations**: Implementaciones de una interfaz
9. **test_09_semantic_model_integration_workflow**: Workflow completo semántico
10. **test_10_semantic_stats_consistency**: Verificación de consistencia de estadísticas

## Instalación de Dependencias

```bash
cd Grafo/Query

# Instalar dependencias de testing
pip install -r requirements-test.txt
```

## Ejecución de Tests

### Script Principal

```bash
# Desde el directorio Query/
./run_tests.sh
```

### Modos de Ejecución

#### 1. Test Rápido (Quick)
```bash
./run_tests.sh quick
```
Ejecuta solo el workflow completo (test 17). Útil para verificación rápida.

#### 2. Tests Encadenados
```bash
./run_tests.sh chained
```
Ejecuta la suite completa de tests encadenados (tests 1-17).

#### 3. Tests Individuales
```bash
./run_tests.sh individual
```
Ejecuta solo los tests aislados de funcionalidades específicas.

#### 4. Cobertura
```bash
./run_tests.sh coverage
```
Genera reporte de cobertura de código en `htmlcov/index.html`.

#### 5. Descubrimiento
```bash
./run_tests.sh discover
```
Solo ejecuta el descubrimiento de datos para ver qué hay en la BD.

#### 6. Todos los Tests
```bash
./run_tests.sh
```
Ejecuta todos los tests disponibles.

### Ejecución Manual con pytest

```bash
# Todos los tests
pytest tests/ -v -s

# Solo encadenados
pytest tests/test_graph_service.py::TestGraphServiceChained -v -s

# Solo tests del Semantic Model
pytest tests/test_graph_service.py::TestSemanticModel -v -s

# Test específico
pytest tests/test_graph_service.py::TestGraphServiceChained::test_01_get_code_context_by_class_name -v -s

# Test específico del Semantic Model
pytest tests/test_graph_service.py::TestSemanticModel::test_01_get_semantic_stats -v -s

# Con cobertura
pytest tests/ --cov=src --cov-report=html -v
```

## Cómo Funcionan los Tests

### 1. Descubrimiento de Datos (Fixture `real_data_discovery`)

Antes de ejecutar los tests, se realiza un descubrimiento automático de los datos:

```python
# El fixture descubre:
- Todos los proyectos disponibles
- El proyecto con más nodos (más rico para testing)
- Una clase de ejemplo
- Un método de ejemplo
- Nodos disponibles
- Capas arquitectónicas
- Namespaces
```

### 2. Validación de Datos (Fixture `validate_data`)

Verifica que hay suficientes datos para ejecutar los tests. Si no hay datos, los tests se saltan automáticamente con `pytest.skip()`.

### 3. Ejecución Encadenada

Cada test:
1. Usa los datos descubiertos
2. Realiza consultas de SOLO LECTURA
3. Verifica los resultados
4. Muestra información útil
5. Se adapta a la estructura de datos real

### 4. Tests del Semantic Model

Los tests de Semantic Model verifican las nuevas funcionalidades:
- Relaciones de herencia entre clases
- Implementaciones de interfaces
- Llamadas a métodos
- Usos de tipos
- Jerarquías de clases
- Implementaciones de interfaces específicas
- Consistencia de estadísticas

## Interpretación de Resultados

### Éxito Completo
```
✓ Contexto obtenido: UserService
  - Tipo: Class
  - Namespace: MyApp.Services
  - Elementos relacionados: 3
  - Edges: 2
  - Proyecto: MyProject
...
======================================================================
WORKFLOW COMPLETADO EXITOSAMENTE
======================================================================
```

### Test Saltado (Skip)
```
SKIPPED [1] tests/test_graph_service.py:123: No se encontró una clase en los datos reales
```
**Causa**: No hay datos del tipo necesario en la BD.
**Solución**: Ejecuta el indexer para agregar más proyectos.

### Test Fallido
```
AssertionError: Debe haber proyectos en la base de datos
```
**Causa**: La base de datos está vacía o no conectada.
**Solución**: 
1. Verifica que MongoDB esté corriendo
2. Ejecuta el indexer para poblar datos
3. Verifica la conexión en `.env`

## Problemas Comunes

### 1. "No hay proyectos en la base de datos"

**Problema**: La BD está vacía.

**Solución**:
```bash
cd Grafo/Indexer
dotnet run -- index <ruta-al-proyecto-csharp>
```

### 2. "MongoDB no está corriendo"

**Problema**: El servicio MongoDB no está activo.

**Solución**:
```bash
# Verifica el estado
sudo systemctl status mongod  # Linux
brew services list  # macOS

# Inicia el servicio
sudo systemctl start mongod  # Linux
brew services start mongodb-community  # macOS
net start MongoDB  # Windows
```

### 3. "Connection refused"

**Problema**: No se puede conectar a MongoDB.

**Solución**:
1. Verifica que MongoDB esté corriendo
2. Verifica `MONGODB_CONNECTION_STRING` en `.env`
3. Verifica que el puerto (27017) esté abierto

### 4. "No se encontró una clase en los datos reales"

**Problema**: El proyecto indexado no tiene clases, solo tiene otros tipos de nodos.

**Solución**: Normal para ciertos proyectos. El test se salta automáticamente.

### 5. Tests muy lentos

**Problema**: Base de datos grande o sin índices.

**Solución**:
- Ejecuta solo `quick` para prueba rápida
- Verifica índices en MongoDB
- Usa `pytest -n auto` para paralelizar

## Estructura de Datos Esperada

Los tests esperan que la base de datos tenga:

### Colección: `projects`

Documentos con estructura:
```json
{
  "ProjectId": "string",
  "ProjectName": "string",
  "Layer": "string",
  "NodeCount": number,
  "EdgeCount": number,
  "Nodes": [
    {
      "_id": "string",
      "Name": "string",
      "FullName": "string",
      "Type": "Class|Method|Property|Interface|...",
      "Namespace": "string",
      "Location": {
        "RelativePath": "string",
        "AbsolutePath": "string"
      }
    }
  ],
  "Edges": [
    {
      "_id": "string",
      "Source": "string",
      "Target": "string",
      "Relationship": "Contains|Uses|Implements|Inherits|Calls|..."
    }
  ]
}
```

#### Semantic Model Relationships

Los tests del Semantic Model esperan específicamente:

```json
{
  "Edges": [
    {
      "Relationship": "Inherits",   // Herencia de clases
      "Source": "class:ChildClass",
      "Target": "class:ParentClass"
    },
    {
      "Relationship": "Implements",  // Implementación de interfaces
      "Source": "class:MyClass",
      "Target": "interface:IMyInterface"
    },
    {
      "Relationship": "Calls",       // Llamadas a métodos
      "Source": "method:CallerMethod",
      "Target": "method:CalledMethod",
      "Count": 5
    },
    {
      "Relationship": "Uses",        // Uso de tipos
      "Source": "method:MyMethod",
      "Target": "class:TypeUsed",
      "Count": 3
    }
  ]
}
```

## Personalización

### Agregar Nuevos Tests

Para agregar un test que use datos reales:

```python
@pytest.mark.asyncio
async def test_XX_mi_funcionalidad(
    self, 
    graph_service: GraphQueryService,
    real_data_discovery: Dict,
    validate_data: bool
):
    """Test de mi funcionalidad con datos reales."""
    # Obtener datos reales descubiertos
    sample_project = real_data_discovery["sample_project"]
    
    # Ejecutar consulta
    result = await graph_service.mi_metodo(sample_project.ProjectId)
    
    # Verificar y mostrar
    print(f"\n✓ Mi funcionalidad: {len(result)} resultados")
    
    return result
```

### Modificar Descubrimiento

Edita el fixture `real_data_discovery` en `conftest.py` para descubrir datos adicionales.

## CI/CD

Para integrar en pipeline:

```yaml
- name: Start MongoDB
  run: docker run -d -p 27017:27017 mongo:latest

- name: Index sample data
  run: |
    cd Grafo/Indexer
    dotnet run -- index <sample-project>

- name: Run tests
  run: |
    cd Grafo/Query
    pip install -r requirements-test.txt
    pytest tests/ -v --cov=src --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Métricas de Cobertura

### Objetivos
- **Líneas**: > 80%
- **Funciones**: 100% (todos los métodos públicos)

### Ver Reporte
```bash
./run_tests.sh coverage
# Abre htmlcov/index.html en tu navegador
```

## Buenas Prácticas

### ✅ DO

- Ejecuta el indexer antes de los tests
- Usa datos reales para validación
- Revisa el output detallado con `-s`
- Ejecuta `quick` para validación rápida
- Verifica la conexión antes de tests

### ❌ DON'T

- No intentes ejecutar sin datos en la BD
- No modifiques los tests para crear datos
- No asumas estructura específica de datos
- No elimines el fixture de validación

## Referencias

- [pytest Documentation](https://docs.pytest.org/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [Motor (MongoDB async driver)](https://motor.readthedocs.io/)

## Troubleshooting Avanzado

### Logs Detallados

```bash
# Aumentar verbosidad
pytest tests/ -vv -s --log-cli-level=DEBUG

# Ver traceback completo
pytest tests/ --tb=long
```

### Debugging

```python
# En el test, agrega:
import pdb; pdb.set_trace()
```

### Performance

```bash
# Ver tests más lentos
pytest tests/ --durations=10
```

## Conclusión

Estos tests validan el `GraphQueryService` con datos reales, asegurando que:

✅ Todas las consultas funcionan con datos de producción  
✅ El servicio se adapta a diferentes estructuras de datos  
✅ Los flujos encadenados son consistentes  
✅ El manejo de errores es robusto  
✅ La documentación es ejecutable  

Para cualquier duda, revisa el archivo `TESTING_STRATEGY.md`.
