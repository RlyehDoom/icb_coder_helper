# Tool MCP: get_tailored_guidance

## Descripción

La tool `get_tailored_guidance` proporciona guía especializada para trabajar en el proyecto **Tailored** de ICBanking. Tailored es un proyecto que hereda de ICBanking y usa Unity IoC (Inversion of Control) para hacer overrides de componentes.

## Propósito

Esta herramienta fue diseñada para ayudar a desarrolladores que trabajan en Cursor/VSCode a:

1. **Entender la arquitectura** de Tailored y sus patrones de extensibilidad
2. **Extender componentes** de ICBanking siguiendo las convenciones correctas
3. **Configurar Unity** para registrar componentes personalizados
4. **Agregar referencias** correctas según la capa de arquitectura
5. **Seguir patrones** de nombres, namespaces y ubicación de archivos

## Parámetros

### task_type (requerido)

Tipo de tarea a realizar. Opciones:

- `extend_business_component` - Extender un componente de negocio de ICBanking
- `create_data_access` - Crear capa de acceso a datos
- `create_service_agent` - Crear un service agent para integración externa
- `extend_api` - Extender AppServer o WebServer API
- `configure_unity` - Configurar Unity IoC para inyección de dependencias
- `understand_architecture` - Entender la arquitectura en capas de Tailored
- `add_method_override` - Agregar override de un método específico
- `create_new_component` - Crear un componente completamente nuevo

### component_name (opcional)

Nombre del componente/clase de ICBanking a extender o crear.

**Ejemplo:** `Accounts`, `Clients`, `Loans`

### layer (opcional)

Capa de arquitectura donde trabajar. Opciones:

- `BusinessComponents` - Capa de lógica de negocio
- `DataAccess` - Capa de acceso a datos
- `ServiceAgents` - Capa de integración externa
- `AppServerApi` - API del servidor de aplicaciones
- `WebServerApi` - API del servidor web
- `BusinessEntities` - Entidades y DTOs
- `Common` - Utilidades compartidas

### details (opcional)

Detalles adicionales sobre la tarea.

## Ejemplos de Uso

### Ejemplo 1: Extender Business Component

```json
{
  "task_type": "extend_business_component",
  "component_name": "Accounts",
  "layer": "BusinessComponents"
}
```

**Respuesta:** Guía completa sobre cómo extender la clase `Accounts` de ICBanking en Tailored, incluyendo:
- Ubicación del archivo
- Patrón de código con herencia
- Referencias necesarias (.csproj)
- Configuración de Unity
- Inyección de dependencias
- Convenciones importantes

### Ejemplo 2: Configurar Unity

```json
{
  "task_type": "configure_unity",
  "component_name": "Clients"
}
```

**Respuesta:** Guía sobre cómo configurar `UnityConfiguration.config` para registrar el componente `Clients`, incluyendo:
- Ubicación del archivo
- Estructura básica
- Patrones de registro (override, singleton, full name)
- Contenedores nombrados
- Resolución de dependencias en código

### Ejemplo 3: Entender Arquitectura

```json
{
  "task_type": "understand_architecture"
}
```

**Respuesta:** Guía completa sobre la arquitectura de Tailored, incluyendo:
- Estructura en capas (4 niveles + Cross-Cutting)
- Patrón de extensibilidad con Unity
- Convenciones de nombres
- Flujo de dependencias
- Referencias a ICBanking Framework
- Puntos clave de extensibilidad

### Ejemplo 4: Crear Data Access

```json
{
  "task_type": "create_data_access",
  "component_name": "CustomOrders"
}
```

**Respuesta:** Guía para crear `CustomOrdersDataAccess.cs` en la capa de datos, incluyendo:
- Ubicación del archivo
- Patrón de código con Dapper
- Referencias NuGet necesarias
- Referencias a Framework

### Ejemplo 5: Agregar Override de Método

```json
{
  "task_type": "add_method_override",
  "component_name": "Accounts",
  "details": "Necesito agregar validación personalizada antes de crear cuenta"
}
```

**Respuesta:** Guía específica sobre cómo hacer override de métodos, incluyendo:
- Verificación de métodos virtuales
- Creación/edición de clase Tailored
- Patrones comunes (validación, modificar resultado, auditoría)
- Consideraciones importantes

## Salida

La herramienta retorna documentación en formato **Markdown** con:

1. **Encabezado** con la tarea y parámetros
2. **Guía estructurada** específica para la tarea solicitada
3. **Ejemplos de código** en C# y XML
4. **Referencias necesarias** (proyectos, assemblies, NuGet)
5. **Convenciones y patrones** a seguir
6. **Consideraciones importantes** y advertencias

## Arquitectura de Tailored

### Estructura en Capas

```
Tailored.ICBanking.sln
│
├── 1_PresentationLayer/
│   └── UserInterface/
│       └── Tailored.ICBanking.BackOfficeUI
│
├── 2_ServicesLayer/
│   ├── AppServerApi/
│   │   └── Tailored.ICBanking.AppServer.Api
│   └── WebServerApi/
│       └── Tailored.ICBanking.WebServer.Api
│
├── 3_BusinessLayer/
│   └── BusinessComponents/
│       └── Tailored.ICBanking.BusinessComponents
│
├── 4_DataLayer/
│   ├── DataAccess/
│   │   └── Tailored.ICBanking.DataAccess
│   └── ServiceAgents/
│       └── Tailored.ICBanking.ServiceAgents
│
└── Cross-Cutting/
    ├── Tailored.ICBanking.ApplicationServer.BusinessEntities
    ├── Tailored.ICBanking.MethodParameters
    └── Tailored.ICBanking.Common
```

### Patrón de Extensibilidad

Tailored **NO modifica** código de ICBanking. En su lugar:

1. **Hereda** de clases de ICBanking
2. **Override** de métodos virtuales
3. **Registra** en Unity para reemplazar implementaciones

**Flujo:**
```
Cursor solicita IAccounts
       ↓
Unity lee UnityConfiguration.config
       ↓
Encuentra: IAccounts → Tailored.ICBanking.BusinessComponents.Accounts
       ↓
Inyecta la versión Tailored (que hereda de Infocorp)
```

## Convenciones de Nombres

| Elemento | Patrón | Ejemplo |
|----------|--------|---------|
| **Namespace** | `Tailored.<Feature>.<Component>` | `Tailored.ICBanking.BusinessComponents` |
| **Clase Business** | Mismo nombre que ICBanking | `Accounts`, `Clients` |
| **Data Access** | `<Feature>DataAccess` | `AccountsDataAccess` |
| **Service Agent** | `<Feature>ServiceAgent` | `ClientsServiceAgent` |
| **Ensamblado** | `Tailored.<Feature>.<Layer>` | `Tailored.ICBanking.BusinessComponents` |

## Puntos Clave

### Business Components
- Métodos `virtual` pueden ser overridden
- Usa `base.Metodo()` para mantener lógica de ICBanking
- Propiedades virtuales para inyección de dependencias

### Unity Configuration
- Define qué implementaciones usar (Tailored vs ICBanking)
- Permite registros singleton, transient, etc.
- Contenedores nombrados para contextos específicos

### Referencias
Todos los proyectos Tailored referencian assemblies de ICBanking desde:
```
Resources/Assemblies_ProductAppServer/
├── Infocorp.ApplicationServer.Common.dll
├── Infocorp.ApplicationServer.Interfaces.dll
├── Infocorp.Framework.Common.dll
└── Infocorp.<Componente>.BusinessComponents.dll
```

## Integración con MCP

Esta tool está integrada en el servidor MCP de Grafo Query Service y es accesible desde Cursor/VSCode a través de la configuración MCP.

### Configuración en Cursor

Archivo: `~/.cursor/mcp.json` (macOS/Linux) o `%APPDATA%\Cursor\User\mcp.json` (Windows)

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

Después de agregar la configuración, reinicia Cursor.

## Casos de Uso

### 1. Desarrollador nuevo en Tailored
Usa `understand_architecture` para obtener una visión general del proyecto.

### 2. Extender funcionalidad existente
Usa `extend_business_component` con el nombre del componente para obtener guía específica.

### 3. Crear nuevo componente
Usa `create_new_component` especificando el nombre y la capa apropiada.

### 4. Configurar inyección de dependencias
Usa `configure_unity` para aprender cómo registrar componentes en Unity.

### 5. Override de método específico
Usa `add_method_override` con el componente y detalles del método para obtener patrones de override.

## Notas Técnicas

- La herramienta genera respuestas en tiempo real basadas en el análisis exhaustivo del proyecto Tailored
- Toda la información se basa en patrones reales extraídos del código fuente de ICBanking
- Los ejemplos de código son directamente aplicables al proyecto
- Las rutas de archivos siguen las convenciones de Windows (backslashes)

## Soporte

Para reportar problemas o sugerir mejoras a esta herramienta:
- Repositorio: [Claude Code Issues](https://github.com/anthropics/claude-code/issues)
- Documentación Grafo: `Grafo/README.md`

## Versión

- **Versión:** 1.0.0
- **Fecha de creación:** 2025-01-18
- **Última actualización:** 2025-01-18
