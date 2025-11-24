"""
Servicio de guías especializadas para trabajar en el proyecto Tailored.

Este módulo proporciona guías contextuales para desarrolladores que trabajan
en el proyecto Tailored de ICBanking, incluyendo:
- Patrones de extensibilidad
- Verificación de herencia desde el grafo
- Validaciones de compilación
- Referencias .csproj correctas
"""
import logging
from typing import Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Ruta base de templates
TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "tailored_guidance"


class TailoredGuidanceService:
    """Servicio para generar guías especializadas de Tailored."""

    def __init__(self, graph_service):
        """
        Inicializa el servicio de guías Tailored.

        Args:
            graph_service: Servicio de consultas del grafo para obtener información contextual
        """
        self.graph_service = graph_service
        self.version = None  # Se establece en get_tailored_guidance

    def _get_templates_dir(self) -> Path:
        """
        Obtiene el directorio de templates según la versión.

        Mapeo de versiones a templates:
        - 5.X, 6.X → v6 (NET Framework 4.5.2)
        - 7.X, 8.X+ → v7 (NET 8)
        - Sin versión → v7 (default)

        Returns:
            Path del directorio de templates
        """
        if self.version:
            # Extraer major version
            try:
                major_version = int(self.version.split('.')[0])

                # Versiones 5 y 6 usan templates v6 (NET Framework 4.5.2)
                if major_version <= 6:
                    target_dir = TEMPLATES_DIR / "v6"
                    if target_dir.exists():
                        return target_dir
                    # Fallback a v7 si v6 no existe
                    logger.warning(f"Templates v6 no encontrados, usando v7 como fallback")
                    return TEMPLATES_DIR / "v7"

                # Versiones 7 y 8+ usan templates v7 (NET 8)
                else:
                    target_dir = TEMPLATES_DIR / "v7"
                    if target_dir.exists():
                        return target_dir
                    # Fallback a v6 si v7 no existe
                    logger.warning(f"Templates v7 no encontrados, usando v6 como fallback")
                    return TEMPLATES_DIR / "v6"

            except (ValueError, IndexError):
                logger.warning(f"No se pudo parsear versión '{self.version}', usando v7 default")
                return TEMPLATES_DIR / "v7"

        # Default: v7 (NET 8)
        return TEMPLATES_DIR / "v7"

    def _load_template(self, template_name: str) -> str:
        """
        Carga un template de guía Tailored desde archivo.

        Args:
            template_name: Nombre del template (sin extensión .md)

        Returns:
            Contenido del template como string

        Raises:
            FileNotFoundError: Si el template no existe
        """
        templates_dir = self._get_templates_dir()
        template_path = templates_dir / f"{template_name}.md"

        if not template_path.exists():
            logger.error(f"Template no encontrado: {template_path}")
            raise FileNotFoundError(f"Template '{template_name}' no encontrado en {templates_dir}")

        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                content = f.read()
            logger.debug(f"Template cargado exitosamente: {template_name} (versión: {self.version or 'default'})")
            return content
        except Exception as e:
            logger.error(f"Error al cargar template {template_name}: {e}")
            raise

    def _load_code_snippet(self, snippet_name: str) -> str:
        """
        Carga un code snippet desde templates/tailored_guidance/<version>/code_snippets/.

        Args:
            snippet_name: Nombre del snippet (sin extensión .md)

        Returns:
            Contenido del snippet como string

        Raises:
            FileNotFoundError: Si el snippet no existe
        """
        templates_dir = self._get_templates_dir()
        snippet_path = templates_dir / "code_snippets" / f"{snippet_name}.md"

        if not snippet_path.exists():
            logger.error(f"Code snippet no encontrado: {snippet_path}")
            raise FileNotFoundError(f"Code snippet '{snippet_name}' no encontrado")

        try:
            with open(snippet_path, 'r', encoding='utf-8') as f:
                content = f.read()
            logger.debug(f"Code snippet cargado exitosamente: {snippet_name} (versión: {self.version or 'default'})")
            return content
        except Exception as e:
            logger.error(f"Error al cargar code snippet {snippet_name}: {e}")
            raise

    def _get_task_steps(self, task_type: str) -> Dict[str, Any]:
        """
        Retorna la estructura de pasos para cada tipo de tarea.

        Returns:
            Dict con total_steps y descripción de cada paso
        """
        steps_map = {
            "extend_business_component": {
                "total_steps": 3,
                "steps": {
                    1: "Verificar herencia y referencias del grafo",
                    2: "Crear clase Extended y código",
                    3: "Configurar Unity y compilar"
                }
            },
            "create_data_access": {
                "total_steps": 2,
                "steps": {
                    1: "Crear clase DataAccess y código",
                    2: "Configurar referencias y compilar"
                }
            },
            "create_service_agent": {
                "total_steps": 2,
                "steps": {
                    1: "Crear ServiceAgent y código",
                    2: "Configurar referencias y compilar"
                }
            },
            "add_method_override": {
                "total_steps": 3,
                "steps": {
                    1: "Verificar método virtual y crear override",
                    2: "Compilar y validar override",
                    3: "Configurar Unity y compilar final"
                }
            },
            "configure_unity": {
                "total_steps": 1,
                "steps": {
                    1: "Configurar UnityConfiguration.config"
                }
            },
            "extend_api": {
                "total_steps": 2,
                "steps": {
                    1: "Crear controlador y endpoints",
                    2: "Configurar y compilar"
                }
            },
            "create_new_component": {
                "total_steps": 3,
                "steps": {
                    1: "Crear estructura y código",
                    2: "Configurar referencias",
                    3: "Registrar en Unity y compilar"
                }
            },
            "understand_architecture": {
                "total_steps": 1,
                "steps": {
                    1: "Entender arquitectura Tailored"
                }
            }
        }

        return steps_map.get(task_type, {"total_steps": 1, "steps": {1: "Ejecutar tarea"}})

    async def get_tailored_guidance(self, args: Dict[str, Any]) -> str:
        """
        Genera guía especializada para trabajar en Tailored.

        Args:
            args: Diccionario con task_type, component_name, layer, details, version, step

        Returns:
            Guía (overview o paso específico) en formato Markdown
        """
        task_type = args["task_type"]
        component_name = args.get("component_name", "")
        layer = args.get("layer", "")
        details = args.get("details", "")
        step = args.get("step", "overview")  # overview, 1, 2, 3, etc
        self.version = args.get("version", "")  # Establecer versión para este request

        # Si pide overview, mostrar guía de navegación
        if step == "overview" or step == 0:
            return self._generate_overview(task_type, component_name, layer)

        # Determinar framework version para mostrar en header
        framework_version = ".NET Framework 4.5.2" if self.version and self.version.startswith("6.") else ".NET 8"

        # Obtener info de pasos
        task_steps_info = self._get_task_steps(task_type)
        total_steps = task_steps_info["total_steps"]

        # Convertir step a int si es string
        try:
            step_num = int(step)
        except (ValueError, TypeError):
            step_num = 1  # Default a paso 1

        # Validar que el paso existe
        if step_num < 1 or step_num > total_steps:
            return f"# ❌ Error\n\nPaso {step_num} no válido. Esta tarea tiene {total_steps} pasos."

        # Header común
        md = "# 🎯 Guía Tailored - ICBanking\n\n"
        md += f"**Tarea:** `{task_type}`  \n"
        md += f"**Paso:** `{step_num} de {total_steps}` - {task_steps_info['steps'][step_num]}  \n"
        md += f"**Framework:** `{framework_version}`  \n"
        if component_name:
            md += f"**Componente:** `{component_name}`  \n"
        if layer:
            md += f"**Capa:** `{layer}`  \n"
        if self.version:
            md += f"**Versión del Proyecto:** `{self.version}`  \n"
        md += "\n---\n\n"

        # Generar contenido del paso específico
        if task_type == "extend_business_component":
            md += await self._guidance_extend_business_component_step(component_name, details, step_num)
        elif task_type == "create_data_access":
            md += self._guidance_create_data_access_step(component_name, details, step_num)
        elif task_type == "create_service_agent":
            md += self._guidance_create_service_agent_step(component_name, details, step_num)
        elif task_type == "extend_api":
            md += self._guidance_extend_api_step(layer, details, step_num)
        elif task_type == "configure_unity":
            md += self._guidance_configure_unity_step(component_name, layer, details, step_num)
        elif task_type == "understand_architecture":
            md += self._guidance_understand_architecture()
        elif task_type == "add_method_override":
            md += self._guidance_add_method_override_step(component_name, details, step_num)
        elif task_type == "create_new_component":
            md += self._guidance_create_new_component_step(component_name, layer, details, step_num)
        else:
            md += f"❌ Tipo de tarea no reconocido: `{task_type}`\n"

        # Navegación entre pasos
        md += "\n\n---\n\n"
        md += self._build_step_navigation(task_type, step_num, total_steps, component_name, layer)

        return md

    def _generate_overview(self, task_type: str, component_name: str, layer: str) -> str:
        """Genera un overview de la tarea con los pasos a seguir."""
        task_steps_info = self._get_task_steps(task_type)
        total_steps = task_steps_info["total_steps"]

        md = "# 🎯 Guía Tailored - Overview\n\n"
        md += f"**Tarea:** `{task_type}`  \n"
        if component_name:
            md += f"**Componente:** `{component_name}`  \n"
        if layer:
            md += f"**Capa:** `{layer}`  \n"
        md += "\n---\n\n"

        md += "## 📋 Pasos a Seguir\n\n"
        md += f"Esta tarea consta de **{total_steps} pasos**:\n\n"

        for step_num, step_desc in task_steps_info["steps"].items():
            md += f"{step_num}. **{step_desc}**\n"

        md += "\n---\n\n"
        md += "## 🚀 Cómo Usar Este Sistema\n\n"
        md += "1. **Comienza por el Paso 1:** Llama la herramienta `get_tailored_guidance` con `step=1`\n"
        md += "2. **Sigue las instrucciones** del paso actual\n"
        md += "3. **Al terminar cada paso:** La guía te indicará qué hacer después\n"
        md += "4. **Llama el siguiente paso:** Usa `get_tailored_guidance` con `step=2`, `step=3`, etc.\n\n"

        md += "**Importante:** Completa cada paso ANTES de avanzar al siguiente.\n\n"

        md += "---\n\n"
        md += "## 🎬 Comenzar Ahora\n\n"
        md += f"Para empezar, llama:\n\n"
        md += f"```\nget_tailored_guidance(\n"
        md += f"  task_type='{task_type}',\n"
        if component_name:
            md += f"  component_name='{component_name}',\n"
        if layer:
            md += f"  layer='{layer}',\n"
        md += f"  step=1\n"
        md += f")\n```"

        return md

    def _build_step_navigation(self, task_type: str, current_step: int, total_steps: int,
                                component_name: str, layer: str) -> str:
        """Construye la navegación para el paso siguiente."""
        md = "## 🔄 Siguiente Paso\n\n"

        if current_step < total_steps:
            next_step = current_step + 1
            task_steps_info = self._get_task_steps(task_type)
            next_step_desc = task_steps_info["steps"][next_step]

            md += f"✅ **Completaste el Paso {current_step}**\n\n"
            md += f"**Siguiente:** Paso {next_step} - {next_step_desc}\n\n"
            md += f"Para continuar, llama:\n\n"
            md += f"```\nget_tailored_guidance(\n"
            md += f"  task_type='{task_type}',\n"
            if component_name:
                md += f"  component_name='{component_name}',\n"
            if layer:
                md += f"  layer='{layer}',\n"
            md += f"  step={next_step}\n"
            md += f")\n```"
        else:
            md += f"🎉 **¡Completaste todos los pasos!**\n\n"
            md += f"Has terminado la tarea `{task_type}`. "
            md += f"Verifica que todo compile correctamente antes de continuar."

        return md

    # ==================== MÉTODOS DE GUÍA POR TIPO ====================

    async def _guidance_extend_business_component(self, component_name: str, details: str) -> str:
        """Guía para extender un Business Component usando template."""
        template = self._load_template("extend_business_component")

        # Obtener información de herencia del grafo si hay component_name
        inheritance_info = ""
        csproj_verification = ""

        if component_name:
            inheritance_info = await self._build_inheritance_verification(component_name)
            csproj_verification = await self._build_csproj_verification(component_name)

        # Preparar variables para el template
        variables = {
            "component_header": f"### Objetivo: Extender `{component_name}` de ICBanking\n" if component_name else "",
            "component_file_location": f"            └── {component_name}.cs  ← CREAR AQUÍ\n" if component_name else "",
            "code_pattern": self._build_business_component_code_pattern(component_name),
            "component_reference": self._build_component_reference(component_name),
            "unity_registration": self._build_unity_registration(component_name),
            "component_convention": f"- ✅ **Nombre de clase:** Mismo que ICBanking: `{component_name}`\n" if component_name else "",
            "inheritance_info": inheritance_info,
            "csproj_verification": csproj_verification
        }

        return template.format(**variables)

    def _guidance_create_data_access(self, component_name: str, details: str) -> str:
        """Guía para crear Data Access usando template."""
        template = self._load_template("create_data_access")

        variables = {
            "component_file_location": f"            └── {component_name}DataAccess.cs  ← CREAR AQUÍ\n" if component_name else "",
            "code_pattern": self._build_data_access_code_pattern(component_name)
        }

        return template.format(**variables)

    def _guidance_create_service_agent(self, component_name: str, details: str) -> str:
        """Guía para crear Service Agent usando template."""
        template = self._load_template("create_service_agent")

        variables = {
            "component_file_location": f"            └── {component_name}ServiceAgent.cs  ← CREAR AQUÍ\n" if component_name else "",
            "code_pattern": self._build_service_agent_code_pattern(component_name)
        }

        return template.format(**variables)

    def _guidance_extend_api(self, layer: str, details: str) -> str:
        """Guía para extender API usando template."""
        template = self._load_template("extend_api")

        api_name = "AppServer" if layer == "AppServerApi" else "WebServer"

        variables = {
            "api_name": api_name,
            "layer": layer
        }

        return template.format(**variables)

    def _guidance_configure_unity(self, component_name: str, layer: str, details: str) -> str:
        """Guía para configurar Unity usando template."""
        template = self._load_template("configure_unity")

        component_example = ""
        if component_name:
            component_example = f"""
### 6. Ejemplo para {component_name}

```xml
<register type="Infocorp.ApplicationServer.Interfaces.BusinessComponents.I{component_name}"
         mapTo="Tailored.ICBanking.BusinessComponents.{component_name}" />
```
"""

        variables = {
            "component_example": component_example
        }

        return template.format(**variables)

    def _guidance_understand_architecture(self) -> str:
        """Guía sobre arquitectura usando template."""
        template = self._load_template("understand_architecture")
        return template  # Este template no necesita variables

    def _guidance_add_method_override(self, component_name: str, details: str) -> str:
        """Guía para agregar override de método usando template."""
        template = self._load_template("add_method_override")

        variables = {
            "component_header": f"### Objetivo: Override de método en `{component_name}`\n" if component_name else "",
            "file_location": f"En `Tailored.ICBanking.BusinessComponents/{component_name}.cs`:\n\n" if component_name else "",
            "code_pattern": self._build_method_override_code_pattern(component_name)
        }

        return template.format(**variables)

    def _guidance_create_new_component(self, component_name: str, layer: str, details: str) -> str:
        """Guía para crear nuevo componente usando template."""
        template = self._load_template("create_new_component")

        component_header = ""
        if component_name:
            component_header = f"### Objetivo: Crear `{component_name}`"
            if layer:
                component_header += f" en capa `{layer}`"
            component_header += "\n\n"

        layer_specific_content = ""
        if layer == "BusinessComponents":
            layer_specific_content = self._build_new_business_component_content(component_name)

        variables = {
            "component_header": component_header,
            "layer_specific_content": layer_specific_content
        }

        return template.format(**variables)

    # ==================== MÉTODOS DE GUÍA POR PASOS ====================

    async def _guidance_extend_business_component_step(self, component_name: str, details: str, step: int) -> str:
        """Guía por pasos para extender Business Component."""
        if step == 1:
            # Paso 1: Verificar herencia y referencias del grafo
            md = "## Paso 1: Verificar Herencia y Referencias del Grafo\n\n"
            md += "Antes de escribir código, DEBES consultar el grafo de ICBanking para obtener:\n\n"

            if component_name:
                inheritance_info = await self._build_inheritance_verification(component_name)
                csproj_verification = await self._build_csproj_verification(component_name)
                md += inheritance_info + "\n\n"
                md += csproj_verification + "\n\n"
            else:
                md += "⚠️ **No especificaste component_name.** Usa el grafo para buscar la clase que quieres extender.\n\n"

            return md

        elif step == 2:
            # Paso 2: Crear clase Extended y código
            md = "## Paso 2: Crear Clase Extended y Código\n\n"
            md += "### Ubicación del Archivo\n\n"
            md += "```\n"
            md += "Tailored.ICBanking.sln/\n"
            md += "└── 3_BusinessLayer/\n"
            md += "    └── BusinessComponents/\n"
            md += "        └── Tailored.ICBanking.BusinessComponents/\n"
            if component_name:
                md += f"            └── {component_name}Extended.cs  ← CREAR AQUÍ\n"
            md += "```\n\n"

            md += "### Patrón de Código\n\n"
            md += self._build_business_component_code_pattern(component_name) + "\n\n"

            md += "### Referencias Necesarias en .csproj\n\n"
            md += "```xml\n"
            md += "<ItemGroup>\n"
            md += "  <!-- Referencias internas de Tailored -->\n"
            md += "  <ProjectReference Include=\"..\\..\\..\\4_DataLayer\\DataAccess\\Tailored.ICBanking.DataAccess\\Tailored.ICBanking.DataAccess.csproj\" />\n"
            if component_name:
                md += self._build_component_reference(component_name)
            md += "</ItemGroup>\n"
            md += "```\n\n"

            return md

        elif step == 3:
            # Paso 3: Configurar Unity y compilar
            md = "## Paso 3: Configurar Unity y Compilar\n\n"
            md += "### Registrar en Unity\n\n"
            md += "Editar `Tailored.ICBanking.AppServer.Api/UnityConfiguration.config`:\n\n"
            md += "```xml\n"
            md += "<unity xmlns=\"http://schemas.microsoft.com/practices/2010/unity\">\n"
            md += "  <container>\n"
            md += self._build_unity_registration(component_name)
            md += "  </container>\n"
            md += "</unity>\n"
            md += "```\n\n"

            md += "### Compilar y Validar\n\n"
            md += "1. **Compilar el proyecto:** `dotnet build`\n"
            md += "2. **Verificar errores de compilación**\n"
            md += "3. **Probar que Unity resuelva correctamente** la inyección de dependencias\n\n"

            return md

        return ""

    def _guidance_create_data_access_step(self, component_name: str, details: str, step: int) -> str:
        """Guía por pasos para crear Data Access."""
        if step == 1:
            md = "## Paso 1: Crear Clase DataAccess\n\n"
            md += self._guidance_create_data_access(component_name, details)
            return md
        elif step == 2:
            md = "## Paso 2: Compilar y Validar\n\n"
            md += "1. **Compilar:** `dotnet build`\n"
            md += "2. **Verificar que no haya errores**\n"
            return md
        return ""

    def _guidance_create_service_agent_step(self, component_name: str, details: str, step: int) -> str:
        """Guía por pasos para crear Service Agent."""
        if step == 1:
            md = "## Paso 1: Crear ServiceAgent\n\n"
            md += self._guidance_create_service_agent(component_name, details)
            return md
        elif step == 2:
            md = "## Paso 2: Compilar y Validar\n\n"
            md += "1. **Compilar:** `dotnet build`\n"
            md += "2. **Verificar que no haya errores**\n"
            return md
        return ""

    def _guidance_extend_api_step(self, layer: str, details: str, step: int) -> str:
        """Guía por pasos para extender API."""
        if step == 1:
            md = "## Paso 1: Crear Controlador\n\n"
            md += self._guidance_extend_api(layer, details)
            return md
        elif step == 2:
            md = "## Paso 2: Compilar y Probar\n\n"
            md += "1. **Compilar:** `dotnet build`\n"
            md += "2. **Probar endpoint** con Postman o similar\n"
            return md
        return ""

    def _guidance_configure_unity_step(self, component_name: str, layer: str, details: str, step: int) -> str:
        """Guía para configurar Unity."""
        if step == 1:
            return self._guidance_configure_unity(component_name, layer, details)
        return ""

    def _guidance_add_method_override_step(self, component_name: str, details: str, step: int) -> str:
        """Guía por pasos para override de método."""
        if step == 1:
            md = "## Paso 1: Verificar Método Virtual y Crear Override\n\n"
            md += self._guidance_add_method_override(component_name, details)
            return md
        elif step == 2:
            md = "## Paso 2: Compilar y Validar Override\n\n"
            md += "### Compilar el Proyecto\n\n"
            md += "```bash\n"
            md += "dotnet build\n"
            md += "```\n\n"
            md += "### Verificar\n\n"
            md += "1. ✅ **Sin errores de compilación**\n"
            md += "2. ✅ **El método override tiene la firma correcta**\n"
            md += "3. ✅ **La clase Extended compila correctamente**\n\n"
            md += "⚠️ **IMPORTANTE:** Aún falta configurar Unity para que este override se use en runtime.\n\n"
            return md
        elif step == 3:
            md = "## Paso 3: Configurar Unity y Compilar Final\n\n"
            md += "### ⚠️ CRÍTICO: Registrar en Unity\n\n"
            md += "**Sin esta configuración, tu override NUNCA se ejecutará** porque ICBanking seguirá usando la clase base.\n\n"
            md += "Editar `Tailored.ICBanking.AppServer.Api/UnityConfiguration.config`:\n\n"
            md += "```xml\n"
            md += "<unity xmlns=\"http://schemas.microsoft.com/practices/2010/unity\">\n"
            md += "  <container>\n"
            md += self._build_unity_registration(component_name)
            md += "  </container>\n"
            md += "</unity>\n"
            md += "```\n\n"
            md += "### Compilación Final\n\n"
            md += "```bash\n"
            md += "dotnet build\n"
            md += "```\n\n"
            md += "### Verificación Final\n\n"
            md += "1. ✅ **Compilación exitosa**\n"
            md += "2. ✅ **Unity está configurado para usar tu clase Extended**\n"
            md += "3. ✅ **El override se ejecutará en runtime**\n\n"
            return md
        return ""

    def _guidance_create_new_component_step(self, component_name: str, layer: str, details: str, step: int) -> str:
        """Guía por pasos para crear nuevo componente."""
        if step == 1:
            md = "## Paso 1: Crear Estructura\n\n"
            md += self._guidance_create_new_component(component_name, layer, details)
            return md
        elif step == 2:
            md = "## Paso 2: Configurar Referencias\n\n"
            md += "Agrega las referencias necesarias en el .csproj\n"
            return md
        elif step == 3:
            md = "## Paso 3: Registrar en Unity y Compilar\n\n"
            md += "1. Configurar en `UnityConfiguration.config`\n"
            md += "2. Compilar: `dotnet build`\n"
            return md
        return ""

    # ==================== MÉTODOS HELPER PARA CONSTRUIR CÓDIGO ====================

    def _build_business_component_code_pattern(self, component_name: str) -> str:
        """Construye el patrón de código para Business Component."""
        if component_name:
            template = self._load_code_snippet("business_component_code")
            return template.format(component_name=component_name)
        else:
            return self._load_code_snippet("business_component_code_generic")

    def _build_component_reference(self, component_name: str) -> str:
        """Construye la referencia del componente para el .csproj."""
        if component_name:
            template = self._load_code_snippet("component_reference")
            return template.format(component_name=component_name)
        return ""

    def _build_unity_registration(self, component_name: str) -> str:
        """Construye el registro de Unity."""
        if component_name:
            template = self._load_code_snippet("unity_registration")
            return template.format(component_name=component_name)
        return self._load_code_snippet("unity_registration_generic")

    def _build_data_access_code_pattern(self, component_name: str) -> str:
        """Construye el patrón de código para Data Access."""
        if component_name:
            template = self._load_code_snippet("data_access_code")
            return template.format(component_name=component_name)
        return ""

    def _build_service_agent_code_pattern(self, component_name: str) -> str:
        """Construye el patrón de código para Service Agent."""
        if component_name:
            template = self._load_code_snippet("service_agent_code")
            return template.format(component_name=component_name)
        return ""

    def _build_method_override_code_pattern(self, component_name: str) -> str:
        """Construye el patrón de código para override de método."""
        if component_name:
            template = self._load_code_snippet("method_override_code")
            return template.format(component_name=component_name)
        return ""

    def _build_new_business_component_content(self, component_name: str) -> str:
        """Construye contenido específico para nuevo Business Component."""
        if component_name:
            template = self._load_code_snippet("new_business_component_content")
            return template.format(component_name=component_name)
        return ""

    # ==================== MÉTODOS DE VERIFICACIÓN CON GRAFO ====================

    async def _build_inheritance_verification(self, component_name: str) -> str:
        """Construye información de verificación de herencia consultando el grafo."""
        try:
            # Las clases Extended solo existen en Tailored, no en el grafo base de ICBanking
            # Si el nombre termina en "Extended", buscar la clase base sin ese sufijo
            search_name = component_name
            is_extended_class = component_name.endswith("Extended")

            if is_extended_class:
                search_name = component_name[:-8]  # Remover "Extended"
                logger.info(f"Buscando clase base '{search_name}' para Extended class '{component_name}'")

            # Consultar el grafo para obtener contexto de la clase base
            from .models import CodeContextRequest

            request = CodeContextRequest(
                className=search_name,
                includeRelated=True,
                maxDepth=2,
                version=self.version
            )

            context = await self.graph_service.get_code_context(request)

            if not context.found or not context.mainElement:
                # No se encontró en el grafo - instrucciones manuales
                not_found_message = "**❌ Clase no encontrada en el grafo.**"

                if is_extended_class:
                    not_found_message += (
                        f"\n\n**ℹ️ Nota:** Las clases Extended (como `{component_name}`) **solo existen en Tailored**, "
                        f"no en el grafo de ICBanking. El grafo solo contiene la clase base `{search_name}` de ICBanking.\n\n"
                        f"Para crear `{component_name}`, debes extender la clase `{search_name}` de ICBanking. "
                        f"Busca manualmente en el código de ICBanking para verificar la herencia."
                    )
                else:
                    not_found_message += " Debes verificar manualmente en ICBanking."

                template = self._load_code_snippet("inheritance_verification")
                return template.format(
                    component_name=component_name,
                    actual_inheritance_info=not_found_message
                )

            # Construir información de herencia desde el grafo
            elem = context.mainElement
            info_lines = []

            if is_extended_class:
                info_lines.append(
                    f"**ℹ️ Información de la clase base `{search_name}` de ICBanking:**\n\n"
                    f"_(Las clases Extended solo existen en Tailored. El grafo muestra la clase base de ICBanking que debes extender.)_\n"
                )
            else:
                info_lines.append(f"**✅ Clase encontrada en el grafo:**\n")

            info_lines.append(f"- **Proyecto:** `{elem.Project}`")
            info_lines.append(f"- **Namespace:** `{elem.Namespace}`")
            info_lines.append(f"- **Tipo:** `{elem.Type}`")

            if elem.Location:
                info_lines.append(f"- **Ubicación:** `{elem.Location}`")

            # Buscar herencias en edges
            if context.edges:
                inherits_from = []
                implements = []

                for edge in context.edges:
                    if edge.Source == elem.Id:
                        related = next((r for r in context.relatedElements if r.Id == edge.Target), None)
                        if related:
                            if edge.Relationship == "Inherits":
                                inherits_from.append(f"`{related.Name}` (en `{related.Project}`)")
                            elif edge.Relationship == "Implements":
                                implements.append(f"`{related.Name}` (en `{related.Project}`)")

                if inherits_from:
                    info_lines.append(f"\n**🔗 Hereda de:**")
                    for base_class in inherits_from:
                        info_lines.append(f"  - {base_class}")

                if implements:
                    info_lines.append(f"\n**📋 Implementa:**")
                    for interface in implements:
                        info_lines.append(f"  - {interface}")

            actual_info = "\n".join(info_lines)

            template = self._load_code_snippet("inheritance_verification")
            return template.format(
                component_name=component_name,
                actual_inheritance_info=actual_info
            )

        except Exception as e:
            logger.error(f"Error al obtener información de herencia: {e}")
            # Fallback a instrucciones manuales
            template = self._load_code_snippet("inheritance_verification")
            return template.format(
                component_name=component_name,
                actual_inheritance_info=f"**⚠️ Error consultando grafo:** {str(e)}\n\nDebes verificar manualmente en ICBanking."
            )

    async def _build_csproj_verification(self, component_name: str) -> str:
        """Construye información para verificar referencias del .csproj."""
        try:
            # Las clases Extended solo existen en Tailored, buscar la clase base
            search_name = component_name
            if component_name.endswith("Extended"):
                search_name = component_name[:-8]  # Remover "Extended"

            # Consultar el grafo para obtener el proyecto que contiene la clase base
            from .models import CodeContextRequest

            request = CodeContextRequest(
                className=search_name,
                includeRelated=True,
                maxDepth=1,
                version=self.version
            )

            context = await self.graph_service.get_code_context(request)

            project_info = ""
            if context.found and context.mainElement:
                project_name = context.mainElement.Project
                project_info = f"""
**📦 Proyecto base encontrado:** `{project_name}`

**Pasos:**
1. Buscar archivo `.csproj` del proyecto `{project_name}` en ICBanking
2. Abrir el .csproj y copiar todas las referencias `<Reference>` y `<ProjectReference>`
3. Pegar en `Tailored.ICBanking.BusinessComponents.csproj`
4. Verificar que los paths sean correctos (ajustar si es necesario)
"""
            else:
                project_info = "**❌ No se pudo determinar el proyecto base.** Busca manualmente en ICBanking."

            template = self._load_code_snippet("csproj_verification")
            return template.format(
                component_name=component_name,
                project_references_info=project_info
            )

        except Exception as e:
            logger.error(f"Error al obtener información de .csproj: {e}")
            template = self._load_code_snippet("csproj_verification")
            return template.format(
                component_name=component_name,
                project_references_info=f"**⚠️ Error:** {str(e)}"
            )

    # ==================== MÉTODOS DE VALIDACIONES ====================

    def _append_final_validations(self, task_type: str) -> str:
        """Agrega las validaciones finales según el tipo de tarea."""
        # Cargar template de validaciones finales
        final_validations = self._load_template("final_validations")

        # Cargar validaciones específicas según el task_type
        validation_map = {
            "extend_business_component": "extend_business_component_validations",
            "create_data_access": "create_data_access_validations",
            "create_service_agent": "create_service_agent_validations",
            "extend_api": "extend_api_validations",
            "configure_unity": "configure_unity_validations",
            "add_method_override": "add_method_override_validations",
            "create_new_component": "create_new_component_validations",
            "understand_architecture": ""  # No tiene validaciones específicas
        }

        task_specific = ""
        validation_file = validation_map.get(task_type, "")

        if validation_file:
            try:
                templates_dir = self._get_templates_dir()
                snippet_path = templates_dir / "validation_snippets" / f"{validation_file}.md"
                if snippet_path.exists():
                    with open(snippet_path, 'r', encoding='utf-8') as f:
                        task_specific = f.read()
            except Exception as e:
                logger.warning(f"No se pudo cargar validación específica para {task_type}: {e}")
                task_specific = "_(No hay validaciones específicas para este tipo de tarea)_"

        return final_validations.format(task_specific_validations=task_specific)
