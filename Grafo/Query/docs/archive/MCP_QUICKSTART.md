# MCP Quick Start - 5 Minutos

Guía rápida para tener el MCP Server funcionando en 5 minutos.

## ✅ Prerequisites

- Python 3.11+ instalado
- MongoDB ejecutándose con datos del grafo
- Cursor o VSCode instalado

## 🚀 Paso 1: Instalar Dependencias (1 min)

```bash
cd Grafo/Query

# Crear venv (si no existe)
python -m venv venv

# Activar venv
source venv/bin/activate  # Linux/Mac
# o
venv\Scripts\activate     # Windows

# Instalar
pip install -r requirements.txt
```

## 🧪 Paso 2: Probar el Servidor (1 min)

```bash
# Probar que todo funciona
python test_mcp.py
```

Deberías ver:
```
🧪 Iniciando pruebas del MCP Server...
✅ Conectado a MongoDB
✅ GraphQueryService inicializado
✅ Herramientas MCP inicializadas
📋 HERRAMIENTAS DISPONIBLES
...
```

Si ves errores:
- **MongoDB error:** Verifica que MongoDB esté ejecutándose
- **Import error:** Ejecuta `pip install -r requirements.txt`

## ⚙️ Paso 3: Configurar Cursor (2 min)

### Opción A: Configuración Automática (Recomendado)

1. Copia el archivo de configuración:
   ```bash
   cp mcp_config_venv.json ~/.cursor/mcp.json  # Linux/Mac
   # o
   copy mcp_config_venv.json %APPDATA%\Cursor\User\mcp.json  # Windows
   ```

2. **Edita las rutas** en el archivo copiado para que coincidan con tu instalación:
   ```json
   {
     "mcpServers": {
       "grafo-query": {
         "command": "C:/TU_RUTA/icb_coder_helper/Grafo/Query/venv/Scripts/python.exe",
         "args": ["start_mcp.py"],
         "cwd": "C:/TU_RUTA/icb_coder_helper/Grafo/Query"
       }
     }
   }
   ```

### Opción B: Configuración Manual

1. Abre Cursor
2. Presiona `Ctrl+Shift+P` (o `Cmd+Shift+P` en Mac)
3. Busca "Preferences: Open Settings (JSON)"
4. Agrega:
   ```json
   {
     "mcp.servers": {
       "grafo-query": {
         "command": "python",
         "args": ["/ruta/completa/a/Grafo/Query/start_mcp.py"],
         "cwd": "/ruta/completa/a/Grafo/Query"
       }
     }
   }
   ```

## ✨ Paso 4: Usar en Cursor (1 min)

1. Reinicia Cursor
2. Abre un nuevo chat
3. Escribe:
   ```
   "Busca la clase UserService en el grafo"
   ```

Claude debería automáticamente usar la herramienta `search_code` y mostrarte resultados del grafo.

## 🎯 Ejemplos de Uso

### Búsqueda Básica
```
Usuario: "Busca clases que contengan 'Service' en Banking"
Claude: [Usa search_code con query="Service", project="Banking"]
```

### Contexto Detallado
```
Usuario: "Dame el contexto completo de AuthenticationService"
Claude: [Usa get_code_context con className="AuthenticationService"]
```

### Exploración de Proyecto
```
Usuario: "Muéstrame la estructura del proyecto Banking"
Claude: [Usa get_project_structure con project_id="Banking"]
```

### Análisis de Implementaciones
```
Usuario: "Qué clases implementan IUserRepository?"
Claude: [Usa find_implementations con interface_or_class="IUserRepository"]
```

## 🐛 Troubleshooting Rápido

### "MCP server not responding"

1. Verifica que el servidor puede iniciar manualmente:
   ```bash
   python start_mcp.py
   ```

2. Revisa que las rutas en la configuración de Cursor sean absolutas y correctas

3. Verifica los logs de Cursor: `Ctrl+Shift+I` → Console

### "MongoDB connection failed"

1. Verifica MongoDB:
   ```bash
   mongosh "mongodb://InfocorpAI:InfocorpAI2025@localhost:27017/"
   ```

2. Si no hay datos:
   ```bash
   # Indexar código
   cd ../Indexer
   dotnet run -- --solution "<path-to-solution.sln>"

   # Almacenar en MongoDB
   cd ../IndexerDb
   dotnet run --all
   ```

### "No tools available"

1. Verifica que el archivo `src/mcp_tools.py` existe
2. Verifica que `mcp` está instalado: `pip list | grep mcp`
3. Reinstala: `pip install -r requirements.txt --force-reinstall`

## 📚 Más Información

- **Documentación Completa:** [MCP_README.md](MCP_README.md)
- **Test Interactivo:** `python test_mcp.py --interactive`
- **Logs del Servidor:** `python start_mcp.py 2>&1 | tee mcp.log`

## 🎉 ¡Listo!

Ahora tienes el MCP Server funcionando. Claude en Cursor puede consultar tu grafo de código directamente.

**Próximos Pasos:**
- Explora las 6 herramientas disponibles
- Prueba consultas complejas
- Integra con tu flujo de desarrollo

---

**Tiempo total:** ~5 minutos
**Dificultad:** ⭐⭐ (Fácil)
