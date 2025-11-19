# Code Snippets - Tailored Guidance

Esta carpeta contiene snippets de código reutilizables para las guías de Tailored.

## Estructura

Los snippets están organizados por tipo de componente:

### Business Components

- `business_component_code.md` - Patrón de código para extender Business Components (con nombre)
- `business_component_code_generic.md` - Patrón genérico cuando no se especifica nombre
- `new_business_component_content.md` - Contenido completo para crear un nuevo Business Component

### Data Access

- `data_access_code.md` - Patrón de código para crear Data Access layer

### Service Agents

- `service_agent_code.md` - Patrón de código para crear Service Agents

### Method Overrides

- `method_override_code.md` - Patrón de código para hacer override de métodos

### Unity IoC

- `unity_registration.md` - XML para registrar componentes en Unity (con nombre)
- `unity_registration_generic.md` - XML genérico para Unity registration

### Project References

- `component_reference.md` - XML para agregar referencias a .csproj

## Uso

Los snippets son cargados por los métodos helper en `mcp_tools.py` usando `_load_code_snippet()`:

```python
def _build_data_access_code_pattern(self, component_name: str) -> str:
    if component_name:
        template = self._load_code_snippet("data_access_code")
        return template.format(component_name=component_name)
    return ""
```

## Variables

Los snippets utilizan placeholders en formato `{variable_name}`:

- `{component_name}` - Nombre del componente (ej: "Customer", "Account")

## Formato

Los snippets pueden contener:

- Bloques de código delimitados con ````csharp` o ````xml`
- Texto markdown
- Placeholders para variables

## Agregar Nuevo Snippet

1. Crear archivo `.md` en esta carpeta
2. Definir contenido con placeholders `{variable_name}`
3. Crear método helper en `mcp_tools.py` que cargue el snippet
4. Usar el snippet en el método `_guidance_*` correspondiente

## Ejemplos

**business_component_code.md:**
```csharp
namespace Tailored.ICBanking.BusinessComponents
{{
    public class {component_name} : Infocorp.{component_name}.BusinessComponents.{component_name}
    {{
        public override TipoRetorno Metodo(ParametrosIn input)
        {{
            return base.Metodo(input);
        }}
    }}
}}
```

**Llamada desde Python:**
```python
template = self._load_code_snippet("business_component_code")
code = template.format(component_name="Customer")
```

## Notas

- Los snippets NO incluyen el header de la guía (eso va en los templates principales)
- Los bloques de código C# usan `{{` y `}}` para escapar las llaves (format string)
- Los snippets son fragmentos reutilizables que se insertan en templates más grandes
