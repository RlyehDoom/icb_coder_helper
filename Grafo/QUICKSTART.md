# Grafo - Quick Start (5 Minutos)

Esta guía te ayuda a tener Grafo corriendo en menos de 5 minutos.

> 💡 **Nota**: Para documentación completa, ver [README.md](README.md)

## ⚡ Pasos Rápidos

### 1. Instalar CLI
```bash
npm install && npm link
```

### 2. Iniciar MongoDB
```bash
grafo mongodb start
```

Espera a ver: `✅ MongoDB listo para usar`

### 3. Iniciar MCP Server
```bash
grafo mcp build
grafo mcp start
```

Espera a ver: `✅ MCP Server listo para usar`

### 4. Configurar Cursor

Copia el JSON que aparece en pantalla y pégalo en `~/.cursor/mcp.json`:

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

### 5. ¡Listo! 🎉

Reinicia Cursor y ya puedes consultar tu grafo de código desde el chat.

---

## 📊 Comandos Útiles

### MongoDB

```bash
grafo mongodb start      # Iniciar
grafo mongodb stop       # Detener
grafo mongodb restart    # Reiniciar
grafo mongodb status     # Ver estado
grafo mongodb logs       # Ver logs
grafo mongodb shell      # Abrir mongosh
grafo mongodb clean      # Limpiar (elimina datos)
```

### MCP Server

```bash
grafo mcp build          # Construir imagen
grafo mcp start          # Iniciar
grafo mcp stop           # Detener
grafo mcp restart        # Reiniciar
grafo mcp status         # Ver estado
grafo mcp logs           # Ver logs
grafo mcp test           # Ejecutar tests
grafo mcp shell          # Abrir shell
grafo mcp clean          # Limpiar
```

---

## 🔄 Workflow Completo: Indexar Código

Una vez que MongoDB y MCP están corriendo:

### 1. Indexar tu código C#

```bash
cd Grafo/Indexer
dotnet run -- --solution "/ruta/a/tu/solution.sln"
```

### 2. Almacenar en MongoDB

```bash
cd Grafo/IndexerDb

# Cargar a versión específica (ej: 6.5.0)
dotnet run -- -d ICB6_6_5_0 -v 6.5.0 --all --clean

# Cargar proyecto Tailored (se agrega a la misma versión)
dotnet run -- -d ICB6_RBL_T -v 6.5.0 --all
```

### 3. Verificar datos

```bash
# Via API
curl http://localhost:8081/api/v1/stats/6.5.0

# Via mongosh
grafo mongodb shell
db.nodes_6_5_0.countDocuments()
db.nodes_6_5_0.findOne({kind: "class"})
exit
```

### 4. Usar desde Cursor

Ahora puedes consultar tu código desde Cursor:
```
"Busca todas las clases que implementan IUserRepository"
"Dame el contexto de la clase AuthenticationService"
"Qué proyectos están indexados?"
```

### 5. Multi-Solution (Base + Tailored)

Para proyectos con extensibilidad (Base + Tailored):

```bash
# Las relaciones cross-project funcionan automáticamente
# Ejemplo: AccountsExtended (Tailored) hereda de Accounts (Base)

# Consultar herencia
curl http://localhost:8081/api/v1/graph/6.5.0/inheritance/grafo:cls/963edc04

# Consultar implementaciones (muestra Base + Tailored)
curl http://localhost:8081/api/v1/graph/6.5.0/implementations/grafo:ifc/3f72978e
```

---

## 🐛 Troubleshooting

### MongoDB no inicia

```bash
# Verificar Docker
docker --version
docker info

# Ver logs
grafo mongodb logs

# Reiniciar
grafo mongodb restart
```

### MCP no conecta

```bash
# 1. Verificar MongoDB
grafo mongodb status

# 2. Verificar MCP
grafo mcp status

# 3. Ver logs
grafo mcp logs

# 4. Ejecutar tests
grafo mcp test
```

### Docker no está instalado

Instala Docker Desktop:
- **Windows:** https://www.docker.com/products/docker-desktop/
- **Mac:** https://www.docker.com/products/docker-desktop/
- **Linux:** https://docs.docker.com/engine/install/

### Cursor no muestra herramientas MCP

1. Verifica que MCP esté corriendo: `grafo mcp status`
2. Verifica la configuración en `~/.cursor/mcp.json`
3. Reinicia Cursor completamente
4. Verifica logs de Cursor: `Ctrl+Shift+I` → Console

---

## 📚 Documentación Completa

- **README Principal:** [README.md](README.md)
- **Ecosystem Overview:** [ECOSYSTEM_OVERVIEW.md](ECOSYSTEM_OVERVIEW.md)
- **MongoDB Setup:** [IndexerDb/MONGODB_SETUP.md](IndexerDb/MONGODB_SETUP.md)
- **Indexer:** [Indexer/README.md](Indexer/README.md)
- **IndexerDb:** [IndexerDb/README.md](IndexerDb/README.md)
- **Query Service:** [Query/README.md](Query/README.md)
- **Extension:** [../Extension/package.json](../Extension/package.json)

---

## 💡 Tips

### Iniciar todo de una vez

```bash
# Terminal 1: Iniciar MongoDB
grafo mongodb start

# Terminal 2: Iniciar MCP
grafo mcp start

# Verificar ambos
grafo mongodb status
grafo mcp status
```

### Ver logs en tiempo real

```bash
# Terminal 1
grafo mongodb logs

# Terminal 2 (otra terminal)
grafo mcp logs
```

### Limpiar y empezar de nuevo

```bash
# Limpiar MCP (preserva MongoDB)
grafo mcp clean

# Limpiar MongoDB (ELIMINA DATOS)
grafo mongodb clean

# Rebuild todo
grafo mcp build
grafo mcp start
```

---

**Tiempo total:** ~5 minutos
**Dificultad:** ⭐⭐ (Fácil)
**Prerequisitos:** Docker instalado

¡Disfruta usando Grafo! 🚀
