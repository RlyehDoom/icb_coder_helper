# Implementación de la Tool MCP: get_tailored_guidance

## Resumen

Se ha implementado exitosamente una nueva herramienta MCP llamada `get_tailored_guidance` que proporciona guía especializada para trabajar en el proyecto Tailored de ICBanking.

**Fecha de implementación:** 18 de enero de 2025
**Estado:** ✅ Completado y testeado
**Versión:** 1.0.0

## Motivación

El proyecto Tailored es un sistema complejo que hereda de ICBanking y utiliza Unity IoC para hacer overrides de componentes. Los desarrolladores necesitan guía específica sobre:

- Cómo extender clases de ICBanking siguiendo las convenciones correctas
- Qué referencias agregar según la capa de arquitectura
- Cómo configurar Unity para registrar componentes personalizados
- Patrones de nombres, namespaces y ubicación de archivos
- Puntos clave de extensibilidad y arquitectura en capas

Esta tool automatiza la generación de esta guía, proporcionando ejemplos de código contextualizados y documentación precisa.

## Análisis Previo

### 1. Exploración del Proyecto Tailored

Se realizó un análisis exhaustivo del proyecto Tailored en `C:\GIT\ICB7C\Tailored\Tailored.ICBanking.sln` para identificar:

#### Estructura en Capas (4 niveles + Cross-Cutting)
```
Tailored.ICBanking.sln
├── 1_PresentationLayer/
│   └── UserInterface/
├── 2_ServicesLayer/
│   ├── AppServerApi/
│   └── WebServerApi/
├── 3_BusinessLayer/
│   └── BusinessComponents/
├── 4_DataLayer/
│   ├── DataAccess/
│   └── ServiceAgents/
└── Cross-Cutting/
    ├── BusinessEntities
    ├── MethodParameters
    └── Common
```

#### Patrón de Extensibilidad con Unity

Tailored NO modifica código de ICBanking, sino que:
1. **Hereda** de clases de ICBanking
2. **Override** de métodos virtuales
3. **Registra** en Unity para reemplazar implementaciones

#### Convenciones Identificadas

| Elemento | Patrón | Ejemplo |
|----------|--------|---------|
| **Namespace** | `Tailored.<Feature>.<Component>` | `Tailored.ICBanking.BusinessComponents` |
| **Clase Business** | Mismo nombre que ICBanking | `Accounts`, `Clients` |
| **Data Access** | `<Feature>DataAccess` | `AccountsDataAccess` |
| **Service Agent** | `<Feature>ServiceAgent` | `ClientsServiceAgent` |

#### Referencias Clave

Todos los proyectos Tailored referencian assemblies de ICBanking desde:
```
Resources/Assemblies_ProductAppServer/
├── Infocorp.ApplicationServer.Common.dll
├── Infocorp.ApplicationServer.Interfaces.dll
└── Infocorp.<Componente>.BusinessComponents.dll
```

## Implementación

### Archivos Modificados/Creados

#### 1. Implementación Principal
**Archivo:** `Grafo/Query/src/mcp_tools.py`

**Cambios:**
- ✅ Agregada definición de tool `get_tailored_guidance` en `get_tools()` (líneas 245-302)
- ✅ Agregado handler en `execute_tool()` (líneas 330-331)
- ✅ Implementado método principal `_get_tailored_guidance()` (líneas 978-1014)
- ✅ Implementados 8 métodos de guía específicos:
  - `_guidance_extend_business_component()` (líneas 1016-1137)
  - `_guidance_create_data_access()` (líneas 1139-1202)
  - `_guidance_create_service_agent()` (líneas 1204-1251)
  - `_guidance_extend_api()` (líneas 1253-1312)
  - `_guidance_configure_unity()` (líneas 1314-1387)
  - `_guidance_understand_architecture()` (líneas 1389-1487)
  - `_guidance_add_method_override()` (líneas 1489-1592)
  - `_guidance_create_new_component()` (líneas 1594-1681)

**Total de líneas agregadas:** ~900 líneas

#### 2. Documentación
**Archivos creados:**
- ✅ `Grafo/Query/docs/TAILORED_GUIDANCE_TOOL.md` - Documentación completa de la tool
- ✅ `Grafo/Query/docs/IMPLEMENTACION_TAILORED_TOOL.md` - Este archivo
- ✅ Actualizado `Grafo/Query/README.md` - Sección de Herramientas MCP

#### 3. Testing
**Archivo:** `Grafo/Query/tests/test_tailored_guidance.py`

**Tests implementados:**
- ✅ Test de estructura de la tool
- ✅ Test de todos los task_types (8 tipos)
- ✅ Test de manejo de errores
- ✅ Todos los tests pasan exitosamente

## Funcionalidad

### Parámetros de la Tool

#### task_type (requerido)
Tipo de tarea a realizar:
- `extend_business_component` - Extender componente de negocio de ICBanking
- `create_data_access` - Crear capa de acceso a datos
- `create_service_agent` - Crear service agent para integración externa
- `extend_api` - Extender AppServer o WebServer API
- `configure_unity` - Configurar Unity IoC para inyección de dependencias
- `understand_architecture` - Entender la arquitectura en capas de Tailored
- `add_method_override` - Agregar override de un método específico
- `create_new_component` - Crear un componente completamente nuevo

#### component_name (opcional)
Nombre del componente/clase de ICBanking a extender o crear.

#### layer (opcional)
Capa de arquitectura donde trabajar:
- `BusinessComponents`
- `DataAccess`
- `ServiceAgents`
- `AppServerApi`
- `WebServerApi`
- `BusinessEntities`
- `Common`

#### details (opcional)
Detalles adicionales sobre la tarea.

### Ejemplos de Uso

#### Ejemplo 1: Extender Business Component
```json
{
  "task_type": "extend_business_component",
  "component_name": "Accounts",
  "layer": "BusinessComponents"
}
```

**Respuesta:** Guía completa en Markdown con:
- Ubicación del archivo (`Tailored.ICBanking.BusinessComponents/Accounts.cs`)
- Patrón de código C# con herencia
- Referencias necesarias en `.csproj`
- Configuración de Unity en `UnityConfiguration.config`
- Inyección de dependencias
- Convenciones importantes

#### Ejemplo 2: Entender Arquitectura
```json
{
  "task_type": "understand_architecture"
}
```

**Respuesta:** Guía completa sobre:
- Estructura en capas (diagrama ASCII)
- Patrón de extensibilidad con Unity (flujo)
- Convenciones de nombres (tabla)
- Flujo de dependencias (diagrama)
- Referencias a ICBanking Framework
- Puntos clave de extensibilidad

#### Ejemplo 3: Configurar Unity
```json
{
  "task_type": "configure_unity",
  "component_name": "Clients"
}
```

**Respuesta:** Guía sobre:
- Ubicación del archivo `UnityConfiguration.config`
- Estructura básica XML
- Patrones de registro (override, singleton, full name)
- Contenedores nombrados
- Resolución de dependencias en código
- Ejemplo específico para el componente

## Testing

### Resultados de Tests

```
✅ ESTRUCTURA DE LA TOOL VERIFICADA CORRECTAMENTE

🧪 Iniciando tests de get_tailored_guidance...

✅ Test 1: Extend Business Component - passed
✅ Test 2: Configure Unity - passed
✅ Test 3: Understand Architecture - passed
✅ Test 4: Create Data Access - passed
✅ Test 5: Create Service Agent - passed
✅ Test 6: Extend API - passed
✅ Test 7: Add Method Override - passed
✅ Test 8: Create New Component - passed
✅ Test 9: Invalid Task Type - passed

✅ TODOS LOS TESTS COMPLETADOS EXITOSAMENTE
```

### Cobertura
- ✅ Todos los task_types testeados
- ✅ Validación de parámetros
- ✅ Manejo de errores
- ✅ Estructura de la tool
- ✅ Schema de parámetros

## Integración con MCP

### Configuración en Cursor/VSCode

**Archivo:** `~/.cursor/mcp.json` (macOS/Linux) o `%APPDATA%\Cursor\User\mcp.json` (Windows)

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

### Inicio del Servidor MCP

```bash
cd Grafo
grafo mcp start
```

Después de agregar la configuración, reiniciar Cursor.

## Casos de Uso

### 1. Desarrollador Nuevo en Tailored
**Situación:** Acaba de unirse al equipo y necesita entender la arquitectura.

**Solución:** Usar `understand_architecture` para obtener una visión general completa del proyecto.

### 2. Extender Funcionalidad Existente
**Situación:** Necesita agregar lógica personalizada a la clase `Accounts`.

**Solución:** Usar `extend_business_component` con `component_name: "Accounts"` para obtener guía específica sobre herencia, override, referencias y Unity.

### 3. Crear Nuevo Componente
**Situación:** Necesita crear un nuevo componente de reportes personalizados.

**Solución:** Usar `create_new_component` especificando el nombre y la capa apropiada para obtener plantillas de código y referencias.

### 4. Configurar Inyección de Dependencias
**Situación:** No sabe cómo registrar su componente en Unity.

**Solución:** Usar `configure_unity` para aprender patrones de registro, contenedores nombrados y resolución.

### 5. Override de Método Específico
**Situación:** Necesita modificar el comportamiento de un método existente.

**Solución:** Usar `add_method_override` con el componente y detalles del método para obtener patrones de override (pre-processing, post-processing, validación, auditoría).

## Beneficios

### Para Desarrolladores
- ✅ **Reducción de tiempo:** Guía inmediata sin buscar en documentación dispersa
- ✅ **Consistencia:** Todos siguen los mismos patrones y convenciones
- ✅ **Menos errores:** Ejemplos de código probados y validados
- ✅ **Aprendizaje rápido:** Nuevos desarrolladores se integran más rápido

### Para el Proyecto
- ✅ **Calidad de código:** Código consistente y mantenible
- ✅ **Documentación viva:** Se actualiza con el código
- ✅ **Escalabilidad:** Fácil agregar nuevos task_types
- ✅ **Integración IDE:** Guía contextual directamente en Cursor/VSCode

## Limitaciones y Futuras Mejoras

### Limitaciones Actuales
- La tool no valida que el proyecto Tailored exista en el sistema
- No consulta el grafo de código para verificar componentes existentes
- Los ejemplos son estáticos (no generados dinámicamente)

### Futuras Mejoras
1. **Integración con Grafo:** Consultar componentes existentes en MongoDB
2. **Validación:** Verificar que los componentes existan antes de generar guía
3. **Ejemplos Dinámicos:** Generar ejemplos basados en código real del proyecto
4. **Más Task Types:** Agregar más tipos de tareas según necesidades
5. **Análisis de Impacto:** Integrar con `analyze_impact` para advertir sobre cambios
6. **Templates Personalizables:** Permitir configurar templates según estándares del equipo

## Mantenimiento

### Actualización de Guías
Para actualizar las guías generadas:
1. Editar los métodos `_guidance_*` en `mcp_tools.py`
2. Ejecutar tests: `python tests/test_tailored_guidance.py`
3. Actualizar documentación si es necesario

### Agregar Nuevo Task Type
1. Agregar el tipo en el `enum` de `task_type` en `get_tools()`
2. Crear método `_guidance_<nuevo_tipo>()`
3. Agregar handler en `_get_tailored_guidance()`
4. Agregar test en `test_tailored_guidance.py`
5. Actualizar documentación

## Conclusión

La tool `get_tailored_guidance` ha sido implementada exitosamente y está lista para ser utilizada en producción. Proporciona una guía completa y contextualizada para trabajar en el proyecto Tailored, mejorando la productividad de los desarrolladores y la calidad del código.

## Referencias

- Análisis del Proyecto Tailored: Realizado mediante el agente de Exploración
- Patrones de ICBanking: Extraídos de `C:\GITHUB\icb_coder_helper\Grafo\Repo\Cloned\ICB7C\ICBanking`
- MCP Protocol: https://modelcontextprotocol.io/
- Documentación Grafo: `Grafo/README.md`

---

**Implementado por:** Claude Code (Sonnet 4.5)
**Fecha:** 18 de enero de 2025
**Versión Tool:** 1.0.0
**Total Tools MCP:** 8 herramientas
