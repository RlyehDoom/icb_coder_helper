#### 🔍 1. Consultar Grafo para Verificar Herencia

**Usa la herramienta MCP** para obtener información real de la clase:

```
🔧 Herramienta MCP: get_code_context
Parámetros:
  - className: {component_name}
  - includeRelated: true
  - maxDepth: 2
```

**Información a verificar:**
{actual_inheritance_info}

**Si el grafo no tiene datos**, revisar manualmente en Visual Studio:
1. Abrir `C:\GIT\ICB7C\Infocorp.Banking\` en Visual Studio
2. Buscar clase `{component_name}` (Ctrl+T)
3. Ver jerarquía de herencia (F12 en clase base)
4. Identificar métodos `virtual` para override