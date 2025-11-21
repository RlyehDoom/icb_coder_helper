# Templates de Guía Tailored

Esta carpeta contiene templates en formato Markdown para generar guías contextualizadas de trabajo en el proyecto Tailored de ICBanking.

## Estructura

```
tailored_guidance/
├── README.md (este archivo)
├── extend_business_component.md    - Guía para extender componentes de negocio
├── create_data_access.md           - Guía para crear capa de acceso a datos
├── create_service_agent.md         - Guía para crear service agents
├── extend_api.md                   - Guía para extender APIs
├── configure_unity.md              - Guía para configurar Unity IoC
├── understand_architecture.md      - Guía de arquitectura de Tailored
├── add_method_override.md          - Guía para agregar overrides de métodos
└── create_new_component.md         - Guía para crear componentes nuevos
```

## Formato de Templates

Los templates usan placeholders en formato `{variable_name}` que son reemplazados dinámicamente por el código Python.

### Placeholders Comunes

- `{component_name}` - Nombre del componente (ej: "Accounts", "Clients")
- `{component_header}` - Encabezado con objetivo
- `{component_file_location}` - Ubicación del archivo a crear
- `{code_pattern}` - Patrón de código C#
- `{component_reference}` - Referencias específicas del componente
- `{unity_registration}` - Registro de Unity
- `{component_convention}` - Convenciones específicas del componente
- `{layer}` - Capa de arquitectura
- `{api_name}` - Nombre de la API (AppServer/WebServer)
- `{file_location}` - Ubicación de archivo
- `{component_example}` - Ejemplo específico del componente
- `{layer_specific_content}` - Contenido específico de la capa

## Cómo Agregar un Nuevo Template

1. **Crear archivo .md** en esta carpeta con el nombre del task_type
2. **Definir placeholders** usando `{nombre_variable}`
3. **Actualizar código Python** en `src/mcp_tools.py`:
   - Agregar task_type al enum en `get_tools()`
   - Agregar caso en `_get_tailored_guidance()`
   - Agregar método helper si necesita lógica compleja
4. **Actualizar tests** en `tests/test_tailored_guidance.py`
5. **Documentar** en `docs/TAILORED_GUIDANCE_TOOL.md`

## Ejemplo de Template

```markdown
## Título de la Guía

{component_header}

### Sección 1

Texto con placeholder: `{component_name}`

### Sección 2

Código con placeholder:
\`\`\`csharp
{code_pattern}
\`\`\`
```

## Ejemplo de Uso en Código

```python
# Cargar template
template_content = self._load_template("extend_business_component")

# Definir variables
variables = {
    "component_name": "Accounts",
    "component_header": "### Objetivo: Extender `Accounts` de ICBanking\n",
    "code_pattern": "public class Accounts : Infocorp.Accounts.BusinessComponents.Accounts { ... }"
}

# Renderizar
result = template_content.format(**variables)
```

## Ventajas de Usar Templates

- ✅ **Separación de responsabilidades:** Lógica vs presentación
- ✅ **Fácil mantenimiento:** Editar guías sin tocar código
- ✅ **Versionable:** Templates en Git
- ✅ **Escalable:** Agregar nuevas guías fácilmente
- ✅ **Colaborativo:** Equipo puede editar templates sin conocer Python

## ⚠️ CONVENCIONES CRÍTICAS DE TAILORED

### Naming Convention para Clases Extendidas (OBLIGATORIO)

Cuando se extiende una clase de ICBanking en Tailored, **SIEMPRE** seguir esta convención:

- **Clase extendida:** `<ClaseOriginal>Extended`
  - Ejemplo: `Accounts` → `AccountsExtended`
  - Ejemplo: `ApprovalScheme` → `ApprovalSchemeExtended`

- **Archivo:** `<ArchivoOriginal sin .cs>Extended.cs`
  - Ejemplo: `Accounts.cs` → `AccountsExtended.cs`
  - Ejemplo: `ApprovalScheme.cs` → `ApprovalSchemeExtended.cs`

- **Registro en Unity:** También debe usar el nombre con `Extended`
  ```xml
  <register type="Infocorp.ApplicationServer.Interfaces.BusinessComponents.IAccounts"
           mapTo="Tailored.ICBanking.BusinessComponents.AccountsExtended" />
  ```

**IMPORTANTE:** Esta convención aplica **SOLO** a clases que heredan de ICBanking. Clases 100% nuevas de Tailored no necesitan el sufijo `Extended`.

## Convenciones de Templates

- Usar Markdown válido
- Placeholders en formato `{nombre_en_snake_case}`
- Doble llaves `{{` y `}}` para escapar en código C# que usa llaves
- Mantener consistencia de formato entre templates
- Incluir ejemplos de código completos y funcionales
- Usar emojis al inicio de secciones principales (📦, 💾, 🔌, etc.)

## Mantenimiento

Para actualizar una guía:
1. Editar el archivo .md correspondiente
2. Ejecutar tests: `python tests/test_tailored_guidance.py`
3. Verificar que todos los tests pasen
4. Commit los cambios

**No es necesario modificar código Python** para cambios en el contenido de las guías.
