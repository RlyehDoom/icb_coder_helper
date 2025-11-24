# Implementación de Versionado para Tailored Guidance

Este documento describe la implementación del sistema de versionado para generar guías específicas de Tailored según la versión del framework (.NET Framework 4.5.2 vs .NET 8).

## 📋 Resumen

El sistema ahora soporta dos versiones de templates:
- **v6:** Para proyectos Tailored con .NET Framework 4.5.2
- **v7:** Para proyectos Tailored con .NET 8

La versión se determina automáticamente basándose en el parámetro `version` que se pasa desde el MCP client (URL con `?version=X.X.X`).

## 🎯 Flujo de Datos

```
MCP Client URL (?version=6.10.3)
    ↓
HTTP/SSE Server (mcp_server_http.py)
    ↓
Session Tools (mcp_tools.py)
    ├─ default_version = "6.10.3"
    ↓
GraphMCPTools._get_tailored_guidance()
    ├─ args_with_version = {**args, "version": self.default_version}
    ↓
TailoredGuidanceService.get_tailored_guidance(args_with_version)
    ├─ self.version = args.get("version", "")
    ├─ _get_templates_dir() → v6/ o v7/
    ├─ _load_template() → usa templates versionados
    ↓
Markdown Guide con templates apropiados
```

## 📂 Estructura de Archivos

```
Grafo/Query/
├── src/
│   ├── tailored_guidance.py        # ✅ Actualizado con lógica de versionado
│   ├── mcp_tools.py                 # ✅ Actualizado para pasar versión
│   └── mcp_server_http.py           # ✅ Ya soporta ?version=X.X.X
├── templates/
│   └── tailored_guidance/
│       ├── v6/                      # 🆕 Templates para .NET Framework 4.5.2
│       │   ├── extend_business_component.md
│       │   ├── final_validations.md
│       │   ├── code_snippets/
│       │   │   ├── unity_registration.md        # ✅ Fully qualified types
│       │   │   ├── component_reference.md       # ✅ XML tradicional
│       │   │   ├── business_component_code.md
│       │   │   └── ...
│       │   └── validation_snippets/
│       │       └── ...
│       └── v7/                      # ✅ Templates para .NET 8
│           ├── extend_business_component.md
│           ├── final_validations.md
│           ├── code_snippets/
│           │   ├── unity_registration.md        # ✅ Tipos simplificados
│           │   ├── component_reference.md       # ✅ SDK-style
│           │   └── ...
│           └── validation_snippets/
│               └── ...
└── docs/
    ├── TAILORED_VERSION_DIFFERENCES.md  # 🆕 Documentación de diferencias
    └── TAILORED_VERSIONING_IMPLEMENTATION.md  # 🆕 Este documento
```

## 🔧 Cambios Implementados

### 1. `tailored_guidance.py`

#### 1.1 Nuevo atributo de instancia
```python
class TailoredGuidanceService:
    def __init__(self, graph_service):
        self.graph_service = graph_service
        self.version = None  # 🆕 Se establece en get_tailored_guidance
```

#### 1.2 Nuevo método `_get_templates_dir()` con lógica flexible
```python
def _get_templates_dir(self) -> Path:
    """
    Obtiene el directorio de templates según la versión.

    Mapeo de versiones a templates:
    - 5.X, 6.X → v6 (NET Framework 4.5.2)
    - 7.X, 8.X+ → v7 (NET 8)
    - Sin versión → v7 (default)

    Incluye fallback automático si el directorio no existe.
    """
    if self.version:
        try:
            major_version = int(self.version.split('.')[0])

            # Versiones <= 6 usan v6
            if major_version <= 6:
                target_dir = TEMPLATES_DIR / "v6"
                if target_dir.exists():
                    return target_dir
                logger.warning("Templates v6 no encontrados, usando v7 como fallback")
                return TEMPLATES_DIR / "v7"

            # Versiones >= 7 usan v7
            else:
                target_dir = TEMPLATES_DIR / "v7"
                if target_dir.exists():
                    return target_dir
                logger.warning("Templates v7 no encontrados, usando v6 como fallback")
                return TEMPLATES_DIR / "v6"

        except (ValueError, IndexError):
            logger.warning(f"No se pudo parsear versión '{self.version}', usando v7 default")

    # Default: v7 (NET 8)
    return TEMPLATES_DIR / "v7"
```

#### 1.3 Métodos actualizados
- `_load_template()`: Usa `_get_templates_dir()`
- `_load_code_snippet()`: Usa `_get_templates_dir()`
- `get_tailored_guidance()`:
  - Recibe `version` en args
  - Establece `self.version`
  - Agrega Framework info al header
- `_append_final_validations()`: Usa `_get_templates_dir()`

### 2. `mcp_tools.py`

#### 2.1 Método `_get_tailored_guidance()` actualizado
```python
async def _get_tailored_guidance(self, args: Dict[str, Any]) -> str:
    """
    Genera guía especializada para trabajar en Tailored.

    Pasa la versión del grafo al servicio para generar guías apropiadas.
    """
    # Agregar versión del grafo a los argumentos
    args_with_version = {**args, "version": self.default_version}
    return await self.tailored_guidance.get_tailored_guidance(args_with_version)
```

## 📝 Templates Específicos por Versión

### Templates que DIFIEREN entre v6 y v7:

#### 1. `extend_business_component.md`
- **v6:** Menciona .NET Framework 4.5.2, PostSharp, formato XML tradicional
- **v7:** Menciona .NET 8, sin PostSharp, SDK-style

#### 2. `final_validations.md`
- **v6:** Comandos MSBuild, verificaciones específicas de .NET Framework
- **v7:** Comandos dotnet CLI, validaciones .NET 8

#### 3. `code_snippets/unity_registration.md`
- **v6:** Fully qualified types con Version, Culture, PublicKeyToken
- **v7:** Tipos simplificados sin assembly info

#### 4. `code_snippets/component_reference.md`
- **v6:** `<Reference>` con `<HintPath>` en formato XML tradicional
- **v7:** `<Reference>` en formato SDK-style

### Templates COMPARTIDOS (idénticos en v6 y v7):
- `add_method_override.md`
- `configure_unity.md`
- `create_data_access.md`
- `create_new_component.md`
- `create_service_agent.md`
- `extend_api.md`
- `understand_architecture.md`
- La mayoría de code_snippets
- Todos los validation_snippets

## 🧪 Testing

### Escenarios de Prueba

1. **URL con versión 5.X:**
   ```
   http://localhost:9083/sse?version=5.12.0
   ```
   - ✅ Debe usar templates de v6/ (Framework antiguo)
   - ✅ Header debe mostrar ".NET Framework 4.5.2"
   - ✅ Unity registration con fully qualified types

2. **URL con versión 6.X:**
   ```
   http://localhost:9083/sse?version=6.10.3
   ```
   - ✅ Debe usar templates de v6/
   - ✅ Header debe mostrar ".NET Framework 4.5.2"
   - ✅ Unity registration con fully qualified types

3. **URL con versión 7.X:**
   ```
   http://localhost:9083/sse?version=7.10.3
   ```
   - ✅ Debe usar templates de v7/
   - ✅ Header debe mostrar ".NET 8"
   - ✅ Unity registration simplificado

4. **URL con versión 8.X:**
   ```
   http://localhost:9083/sse?version=8.0.0
   ```
   - ✅ Debe usar templates de v7/ (.NET 8+)
   - ✅ Header debe mostrar ".NET 8"
   - ✅ Unity registration simplificado

5. **URL sin versión:**
   ```
   http://localhost:9083/sse
   ```
   - ✅ Debe usar templates de v7/ (default)
   - ✅ Header debe mostrar ".NET 8"

### Comando de Prueba MCP
```bash
# En Cursor/VSCode, agregar a mcp.json:
{
  "mcpServers": {
    "grafo-6.10": {
      "url": "http://localhost:9083/sse?version=6.10.3",
      "transport": "sse"
    },
    "grafo-7.10": {
      "url": "http://localhost:9083/sse?version=7.10.3",
      "transport": "sse"
    }
  }
}
```

Luego usar el tool `get_tailored_guidance` desde Cursor y verificar que los templates sean correctos.

## 📊 Logs para Debugging

Los logs mostrarán la versión usada:
```
Template cargado exitosamente: extend_business_component (versión: 6.10.3)
Code snippet cargado exitosamente: unity_registration (versión: 6.10.3)
```

## 🚀 Despliegue

### 1. Verificar estructura de templates
```bash
cd c:\GITHUB\icb_coder_helper\Grafo\Query
python copy_v7_to_v6.py  # Si es necesario
```

### 2. Reiniciar MCP Server
```bash
cd c:\GITHUB\icb_coder_helper\Grafo
grafo mcp stop
grafo mcp start
```

### 3. Actualizar configuración Cursor
Agregar ambas versiones al `mcp.json` para testing.

## ⚠️ Consideraciones Importantes

1. **Default es v7:**
   - Si no se especifica versión, se usa v7 (NET 8)
   - Esto es correcto ya que v7 es la versión más reciente

2. **Detección de versión flexible:**
   - Versiones **<= 6** (5.X, 6.X) → usan templates v6/
   - Versiones **>= 7** (7.X, 8.X+) → usan templates v7/
   - Parsing robusto con manejo de errores
   - Fallback automático si un directorio no existe

3. **Fallback automático:**
   - Si v6/ no existe pero se solicita versión <= 6 → usa v7/
   - Si v7/ no existe pero se solicita versión >= 7 → usa v6/
   - Logs de warning cuando ocurre fallback

4. **Backwards Compatibility:**
   - Templates v6 contienen toda la funcionalidad de v7
   - Solo difieren en detalles de framework y formato

5. **Mantenimiento:**
   - Al agregar nuevos templates, crearlos en v7/
   - Evaluar si necesitan versión específica en v6/
   - Si son idénticos, copiar con `copy_v7_to_v6.py`

## 📚 Referencias

- **Diferencias detalladas:** `TAILORED_VERSION_DIFFERENCES.md`
- **Proyecto v6 real:** `C:\GIT\RBSUR\Tailored` (.NET Framework 4.5.2)
- **Proyecto v7 real:** `C:\GIT\ICB7C\Tailored` (.NET 8)
- **MCP Config:** `~/.cursor/mcp.json`

## ✅ Checklist de Implementación Completa

- [x] Analizar estructura de Tailored 6.X
- [x] Documentar diferencias entre versiones
- [x] Crear estructura v6/ y v7/
- [x] Mover templates actuales a v7/
- [x] Crear templates específicos de v6
- [x] Implementar `_get_templates_dir()` en TailoredGuidanceService
- [x] Actualizar `_load_template()` y `_load_code_snippet()`
- [x] Actualizar `get_tailored_guidance()` para aceptar version
- [x] Actualizar `_get_tailored_guidance()` en mcp_tools.py
- [x] Copiar templates comunes a v6
- [x] Documentar implementación (este documento)
- [x] Preparar comandos de testing

---

**Fecha de Implementación:** 2025-01-24
**Autor:** Claude Code
**Versión del Sistema:** 1.0.0
