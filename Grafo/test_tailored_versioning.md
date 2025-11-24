# Test Manual del Versionado de Tailored Guidance

## Resumen de Implementación

✅ **Templates organizados por versión:**
- `v6/` - Para .NET Framework 4.5.2 (versiones <= 6.X)
- `v7/` - Para .NET 8 (versiones >= 7.X)

✅ **Lógica de versionado flexible:**
- Versiones 5.X, 6.X → usa templates v6/
- Versiones 7.X, 8.X+ → usa templates v7/
- Sin versión → usa v7/ (default)
- Fallback automático si un directorio no existe

✅ **MCP Server publicado:**
- Puerto: 8083 (externo) →  8082 (interno)
- Docker container: grafo-mcp-server
- Status: healthy

## Configuración para Testing en Cursor/VSCode

Agregar a `~/.cursor/mcp.json` o `%APPDATA%\Cursor\User\mcp.json`:

```json
{
  "mcpServers": {
    "grafo-6": {
      "url": "http://localhost:8083/sse?version=6.10.3",
      "transport": "sse"
    },
    "grafo-7": {
      "url": "http://localhost:8083/sse?version=7.10.3",
      "transport": "sse"
    }
  }
}
```

## Pruebas a Realizar

### 1. Test con Versión 6.10.3

Usar tool `get_tailored_guidance` desde Cursor con config `grafo-6`:

```json
{
  "task_type": "extend_business_component",
  "component_name": "Accounts",
  "layer": "BusinessComponents"
}
```

**Verificar en la respuesta:**
- ✅ Header muestra: `**Framework:** .NET Framework 4.5.2`
- ✅ Header muestra: `**Versión del Proyecto:** 6.10.3`
- ✅ Unity registration tiene fully qualified types con Version/PublicKeyToken
- ✅ Referencias .csproj en formato XML tradicional con GUIDs
- ✅ Validaciones mencionan MSBuild (no dotnet build)

### 2. Test con Versión 7.10.3

Usar tool `get_tailored_guidance` desde Cursor con config `grafo-7`:

```json
{
  "task_type": "extend_business_component",
  "component_name": "Accounts",
  "layer": "BusinessComponents"
}
```

**Verificar en la respuesta:**
- ✅ Header muestra: `**Framework:** .NET 8`
- ✅ Header muestra: `**Versión del Proyecto:** 7.10.3`
- ✅ Unity registration simplificado (sin Version/PublicKeyToken)
- ✅ Referencias .csproj en formato SDK-style
- ✅ Validaciones mencionan `dotnet build`

### 3. Verificar Logs del Servidor

```bash
grafo mcp logs
```

**Buscar líneas como:**
```
Template cargado exitosamente: extend_business_component (versión: 6.10.3)
Code snippet cargado exitosamente: unity_registration (versión: 6.10.3)
```

o

```
Template cargado exitosamente: extend_business_component (versión: 7.10.3)
Code snippet cargado exitosamente: unity_registration (versión: 7.10.3)
```

## Comandos Útiles

```bash
# Ver status del servidor
grafo mcp status

# Ver logs en tiempo real
grafo mcp logs

# Reiniciar servidor
grafo mcp stop
grafo mcp start

# Verificar que templates existen
ls c:\GITHUB\icb_coder_helper\Grafo\Query\templates\tailored_guidance\v6
ls c:\GITHUB\icb_coder_helper\Grafo\Query\templates\tailored_guidance\v7
```

## Archivos Clave Modificados

1. **tailored_guidance.py**
   - Método `_get_templates_dir()` con lógica flexible
   - Soporte para versiones 5.X-8.X+

2. **mcp_tools.py**
   - `_get_tailored_guidance()` pasa versión al servicio

3. **docker-compose.yml**
   - Variable `SERVER_PORT=8082` agregada

4. **Templates**
   - `v6/extend_business_component.md` - Específico .NET Framework
   - `v6/final_validations.md` - Validaciones MSBuild
   - `v6/code_snippets/unity_registration.md` - Fully qualified
   - `v7/` - Templates para .NET 8

## Estado Actual

✅ Código implementado y funcionando
✅ MCP Server publicado en Docker
✅ Templates organizados en v6/ y v7/
✅ Documentación completa generada
✅ Listo para testing manual en Cursor

## Próximos Pasos

1. Agregar configuración a Cursor `mcp.json`
2. Probar tool `get_tailored_guidance` con ambas versiones
3. Verificar que las guías generadas son diferentes
4. Validar logs del servidor

---

**Fecha:** 2025-01-24
**MCP Server:** http://localhost:8083/sse
**Status:** ✅ READY FOR TESTING
