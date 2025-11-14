# Query Service - CLI Commands

Este documento describe cómo usar el CLI de Grafo para gestionar el Query Service con Docker Compose.

## Comandos Disponibles

### Build
Construye la imagen Docker del Query Service:

```bash
grafo query build
```

Este comando:
- Verifica que Docker esté instalado
- Construye la imagen usando `docker-compose build`
- Prepara el servicio para ser ejecutado

### Run / Start
Inicia el Query Service con Docker Compose:

```bash
grafo query run
# o
grafo query start
```

Este comando:
- **Elimina automáticamente** cualquier contenedor existente (corriendo o detenido)
- Crea un **nuevo contenedor** usando la imagen actualizada
- Inicia el contenedor en modo detached (background)
- Muestra URLs para acceder al servicio:
  - API: `http://localhost:8081`
  - Documentación: `http://localhost:8081/docs`

> **💡 Tip**: Siempre que hagas cambios en el código o hagas `grafo query build`, simplemente ejecuta `grafo query run` y automáticamente usará la imagen actualizada.

### Stop
Detiene el Query Service:

```bash
grafo query stop
```

Este comando detiene el contenedor sin eliminarlo, preservando el estado.

### Restart
Reinicia el Query Service:

```bash
grafo query restart
```

Reinicia el contenedor sin necesidad de detenerlo y volverlo a iniciar manualmente.

### Delete / Down
Elimina los contenedores y recursos del Query Service:

```bash
grafo query delete
# o
grafo query down
```

Este comando:
- Pregunta si deseas eliminar también los volúmenes
- Ejecuta `docker-compose down` para limpiar recursos

### Logs
Muestra los logs del Query Service:

```bash
# Ver logs en tiempo real (default)
grafo query logs

# Ver las últimas 100 líneas
grafo query logs --tail 100

# Ver logs sin seguir (modo estático)
grafo query logs --no-follow
```

Opciones:
- `--follow`: Sigue los logs en tiempo real (default: true)
- `--tail <n>`: Muestra solo las últimas n líneas

### Status
Muestra el estado completo del Query Service:

```bash
grafo query status
```

Este comando verifica:
- ✓ Docker instalado y versión
- ✓ Docker Compose instalado y versión
- ✓ Directorio y archivos necesarios
- ✓ Estado del contenedor (Running/Stopped/Not created)
- ✓ URLs disponibles si está corriendo
- ✓ Configuración de MongoDB
- ✓ Puerto 8081 disponible

### Test
Ejecuta los tests del Query Service:

```bash
grafo query test
```

Este comando:
- Verifica si el contenedor está corriendo
- Inicia el contenedor si no está corriendo
- Ejecuta `pytest` dentro del contenedor
- Muestra los resultados de los tests

### Clean
Limpia todos los recursos del Query Service:

```bash
grafo query clean
```

Este comando:
- Detiene y elimina contenedores
- Pregunta si deseas eliminar imágenes Docker
- Limpia recursos temporales

### Shell
Abre una shell interactiva dentro del contenedor:

```bash
grafo query shell
```

Útil para debugging y exploración del contenedor. Usa `exit` para salir.

### Exec
Ejecuta un comando específico dentro del contenedor:

```bash
grafo query exec --command "python --version"
```

## Modo Interactivo

También puedes usar el modo interactivo para gestionar el Query Service:

```bash
grafo interactive
# o
grafo i
```

Luego selecciona:
1. `🔍 Query (Graph Query API)`
2. Selecciona la acción deseada del menú

## Ejemplos de Uso Común

### Inicio rápido
```bash
# Primera vez: construir imagen
grafo query build

# Iniciar servicio
grafo query run

# Ver si está funcionando
grafo query status

# Ver logs
grafo query logs
```

### Desarrollo
```bash
# Hacer cambios en el código...

# Rebuild imagen
grafo query build

# Run (elimina el contenedor viejo automáticamente y usa la nueva imagen)
grafo query run

# Ver logs en tiempo real
grafo query logs

# Ejecutar tests
grafo query test
```

### Debugging
```bash
# Abrir shell en el contenedor
grafo query shell

# O ejecutar comandos específicos
grafo query exec --command "pip list"
grafo query exec --command "python -m src.server --help"
```

### Limpieza
```bash
# Detener servicio
grafo query stop

# Eliminar contenedores
grafo query delete

# Limpieza completa (incluyendo imágenes)
grafo query clean
```

## Configuración

El servicio se configura a través de `docker-compose.yml`:

- **Puerto**: 8081
- **Nombre del contenedor**: `grafo-query-service`
- **Nombre del servicio**: `query-service`
- **Variables de entorno**:
  - `MONGODB_CONNECTION_STRING`: Conexión a MongoDB
  - `MONGODB_DATABASE`: Base de datos GraphDB
  - `MONGODB_PROJECTS_COLLECTION`: Colección de proyectos
  - `SERVER_HOST`: 0.0.0.0
  - `SERVER_PORT`: 8081
  - `LOG_LEVEL`: INFO
  - `CORS_ORIGINS`: *

## Troubleshooting

### El puerto 8081 ya está en uso
```bash
# Ver qué proceso está usando el puerto
netstat -ano | findstr :8081

# O detener el servicio actual
grafo query stop
```

### Docker no está disponible
```bash
# Verificar instalación
docker --version
docker-compose --version

# Si no está instalado, descargar de:
# https://www.docker.com/products/docker-desktop
```

### El contenedor no inicia
```bash
# Ver logs para diagnosticar
grafo query logs

# Verificar estado
grafo query status

# Reconstruir imagen
grafo query build
grafo query restart
```

### Cambios en el código no se reflejan
```bash
# Reconstruir imagen
grafo query build

# Run (automáticamente elimina el contenedor viejo y usa la nueva imagen)
grafo query run
```

> **Nota**: `grafo query run` ahora elimina automáticamente el contenedor existente, por lo que no necesitas usar `restart` después de un build.

## Integración con otros componentes

El Query Service es parte del flujo completo de Grafo:

```bash
# Flujo completo
grafo setup

# Estado de todos los componentes
grafo status
```

El Query Service se conecta a:
- **MongoDB**: Base de datos GraphDB creada por IndexerDb
- **Puerto 8081**: API REST para consultas de grafos

## Ver también

- [Grafo README principal](../README.md)
- [Query Service README](./README.md)
- [Docker Compose documentation](https://docs.docker.com/compose/)

