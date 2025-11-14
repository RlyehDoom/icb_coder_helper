# Query Service - Quick Start Guide

## Inicio Rápido (5 minutos)

### Pre-requisitos

Antes de comenzar, asegúrate de tener:

1. ✓ Docker Desktop instalado y corriendo
2. ✓ MongoDB corriendo (local o Docker)
3. ✓ Puerto 8081 disponible

### Paso 1: Verificar Estado

```bash
cd Grafo
grafo query status
```

Deberías ver:
- ✓ Docker instalado
- ✓ Docker Compose instalado
- ✓ Archivos necesarios presentes

### Paso 2: Construir Imagen Docker

```bash
grafo query build
```

Esto tomará algunos minutos la primera vez. Descargará dependencias Python y construirá la imagen.

### Paso 3: Iniciar el Servicio

```bash
grafo query run
```

El servicio iniciará en modo background. Verás:
```
✓ Servicio disponible en: http://localhost:8081
✓ API Docs: http://localhost:8081/docs
```

> **💡 Tip**: `grafo query run` siempre usa la imagen más reciente. Si el contenedor ya existe, lo elimina automáticamente y crea uno nuevo.

### Paso 4: Verificar que Funciona

Abre tu navegador y visita:
- **Documentación interactiva**: http://localhost:8081/docs
- **Health check**: http://localhost:8081/health

O desde la terminal:
```bash
curl http://localhost:8081/health
```

### Paso 5: Ver Logs

```bash
grafo query logs --tail 50
```

Presiona `Ctrl+C` para salir de los logs.

## Uso Diario

### Detener el Servicio

```bash
grafo query stop
```

### Reiniciar el Servicio

```bash
grafo query restart
```

### Ver Estado

```bash
grafo query status
```

## Ejemplos de Consultas

### Usando curl

```bash
# Health check
curl http://localhost:8081/health

# Listar proyectos (si hay datos)
curl http://localhost:8081/api/v1/projects

# Buscar símbolos
curl -X POST http://localhost:8081/api/v1/query/search \
  -H "Content-Type: application/json" \
  -d '{"query": "MyClass", "type": "class"}'
```

### Usando la Documentación Interactiva

1. Visita http://localhost:8081/docs
2. Explora los endpoints disponibles
3. Prueba las consultas directamente desde el navegador

## Flujo Completo de Grafo

Para tener datos que consultar, necesitas ejecutar el flujo completo:

```bash
# 1. Clonar un repositorio
grafo repo clone -u <URL_REPO>

# 2. Analizar el código
grafo indexer analyze

# 3. Procesar a MongoDB
grafo indexerdb run

# 4. Iniciar Query Service
grafo query run

# 5. Consultar los datos
curl http://localhost:8081/api/v1/projects
```

O usa el flujo automático:
```bash
grafo setup
grafo query run
```

## Testing

### Ejecutar Tests del Servicio

```bash
grafo query test
```

### Debugging

Si algo no funciona:

```bash
# Ver logs detallados
grafo query logs

# Abrir shell en el contenedor
grafo query shell

# Dentro del shell:
python --version
pip list
python -m pytest tests/ -v
exit
```

## Limpieza

### Detener y Limpiar

```bash
# Detener servicio
grafo query stop

# Eliminar contenedor
grafo query delete

# Limpieza completa (incluye imágenes)
grafo query clean
```

## Troubleshooting Rápido

### Error: "Port 8081 already in use"

```bash
# En Windows
netstat -ano | findstr :8081

# Detener el proceso que usa el puerto
# o cambiar el puerto en docker-compose.yml
```

### Error: "Docker daemon not running"

```bash
# Inicia Docker Desktop
# Espera a que el icono esté verde
# Intenta de nuevo
```

### Error: "Cannot connect to MongoDB"

```bash
# Verifica que MongoDB esté corriendo
docker ps | grep mongo

# O inicia MongoDB
docker run -d -p 27017:27017 --name mongodb mongo
```

### El servicio no responde

```bash
# Ver logs para diagnosticar
grafo query logs

# Reconstruir y reiniciar (run elimina el contenedor viejo automáticamente)
grafo query build
grafo query run

# Ver logs para ver qué pasó
grafo query logs --tail 50
```

## Próximos Pasos

1. **Explorar la API**: Usa http://localhost:8081/docs para ver todos los endpoints
2. **Integrar con MCP**: El servicio se puede integrar con Model Context Protocol
3. **Consultas avanzadas**: Explora búsquedas por tipo, dependencias, referencias
4. **Exportar datos**: Usa los endpoints de export para obtener datos en formato específico

## Comandos Útiles de un Vistazo

```bash
# Estado
grafo query status

# Iniciar/Detener
grafo query run
grafo query stop
grafo query restart

# Logs y Debugging
grafo query logs
grafo query logs --tail 100
grafo query shell

# Tests
grafo query test

# Limpieza
grafo query delete
grafo query clean

# Modo interactivo
grafo interactive
```

## Recursos

- [Documentación completa del CLI](./README-CLI.md)
- [API Documentation](http://localhost:8081/docs) (cuando el servicio está corriendo)
- [Grafo README](../README.md)

---

¿Problemas? Verifica:
1. Docker está corriendo
2. MongoDB está accesible
3. Puerto 8081 está libre
4. Logs del servicio: `grafo query logs`

