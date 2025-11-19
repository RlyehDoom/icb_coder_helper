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
        template_path = TEMPLATES_DIR / f"{template_name}.md"

        if not template_path.exists():
            logger.error(f"Template no encontrado: {template_path}")
            raise FileNotFoundError(f"Template '{template_name}' no encontrado en {TEMPLATES_DIR}")

        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                content = f.read()
            logger.debug(f"Template cargado exitosamente: {template_name}")
            return content
        except Exception as e:
            logger.error(f"Error al cargar template {template_name}: {e}")
            raise

    def _load_code_snippet(self, snippet_name: str) -> str:
        """
        Carga un code snippet desde templates/tailored_guidance/code_snippets/.

        Args:
            snippet_name: Nombre del snippet (sin extensión .md)

        Returns:
            Contenido del snippet como string

        Raises:
            FileNotFoundError: Si el snippet no existe
        """
        snippet_path = TEMPLATES_DIR / "code_snippets" / f"{snippet_name}.md"

        if not snippet_path.exists():
            logger.error(f"Code snippet no encontrado: {snippet_path}")
            raise FileNotFoundError(f"Code snippet '{snippet_name}' no encontrado")

        try:
            with open(snippet_path, 'r', encoding='utf-8') as f:
                content = f.read()
            logger.debug(f"Code snippet cargado exitosamente: {snippet_name}")
            return content
        except Exception as e:
            logger.error(f"Error al cargar code snippet {snippet_name}: {e}")
            raise

    async def get_tailored_guidance(self, args: Dict[str, Any]) -> str:
        """
        Genera guía especializada para trabajar en Tailored.

        Args:
            args: Diccionario con task_type, component_name, layer, details

        Returns:
            Guía completa en formato Markdown
        """
        task_type = args["task_type"]
        component_name = args.get("component_name", "")
        layer = args.get("layer", "")
        details = args.get("details", "")

        # Header común
        md = "# 🎯 Guía Tailored - ICBanking\n\n"
        md += f"**Tarea:** `{task_type}`  \n"
        if component_name:
            md += f"**Componente:** `{component_name}`  \n"
        if layer:
            md += f"**Capa:** `{layer}`  \n"
        md += "\n---\n\n"

        # Generar contenido específico según el tipo de tarea
        if task_type == "extend_business_component":
            md += await self._guidance_extend_business_component(component_name, details)
        elif task_type == "create_data_access":
            md += self._guidance_create_data_access(component_name, details)
        elif task_type == "create_service_agent":
            md += self._guidance_create_service_agent(component_name, details)
        elif task_type == "extend_api":
            md += self._guidance_extend_api(layer, details)
        elif task_type == "configure_unity":
            md += self._guidance_configure_unity(component_name, layer, details)
        elif task_type == "understand_architecture":
            md += self._guidance_understand_architecture()
        elif task_type == "add_method_override":
            md += self._guidance_add_method_override(component_name, details)
        elif task_type == "create_new_component":
            md += self._guidance_create_new_component(component_name, layer, details)
        else:
            md += f"❌ Tipo de tarea no reconocido: `{task_type}`\n"

        # Agregar validaciones finales SIEMPRE
        md += self._append_final_validations(task_type)

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
            # Consultar el grafo para obtener contexto de la clase
            from .models import CodeContextRequest

            request = CodeContextRequest(
                className=component_name,
                includeRelated=True,
                maxDepth=2
            )

            context = await self.graph_service.get_code_context(request)

            if not context.found or not context.mainElement:
                # No se encontró en el grafo - instrucciones manuales
                template = self._load_code_snippet("inheritance_verification")
                return template.format(
                    component_name=component_name,
                    actual_inheritance_info="**❌ Clase no encontrada en el grafo.** Debes verificar manualmente en ICBanking."
                )

            # Construir información de herencia desde el grafo
            elem = context.mainElement
            info_lines = []

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
            # Consultar el grafo para obtener el proyecto que contiene la clase
            from .models import CodeContextRequest

            request = CodeContextRequest(
                className=component_name,
                includeRelated=True,
                maxDepth=1
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
                snippet_path = TEMPLATES_DIR / "validation_snippets" / f"{validation_file}.md"
                if snippet_path.exists():
                    with open(snippet_path, 'r', encoding='utf-8') as f:
                        task_specific = f.read()
            except Exception as e:
                logger.warning(f"No se pudo cargar validación específica para {task_type}: {e}")
                task_specific = "_(No hay validaciones específicas para este tipo de tarea)_"

        return final_validations.format(task_specific_validations=task_specific)
