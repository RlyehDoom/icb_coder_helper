# Testing Guide - RoslynIndexer

## Estructura de Archivos

```
/Grafo/Indexer/
├── configs/                    # Archivos de configuración
│   ├── batch-sample.json       # Ejemplo configuración JSON
│   ├── batch-sample.yaml       # Ejemplo configuración YAML
│   └── batch-test-config.yaml  # Configuración para pruebas
├── scripts/                    # Scripts de integración
│   └── analyze-solution.sh     # Script cross-platform para análisis
├── test-results/               # Resultados de pruebas (ignorado por git)
├── tests/                      # Tests unitarios
└── .gitignore                  # Exclusiones de git
```

## Ejecutar Pruebas

### 1. Usando dotnet run (desarrollo)
```bash
# Análisis básico
dotnet run -- -s "ruta/solucion.sln" -o "test-results/output.json" -v

# Con generación de grafo
dotnet run -- -s "ruta/solucion.sln" -o "test-results/symbols.json" -g "test-results/graph.json"

# Procesamiento por lotes
dotnet run -- --batch-config "configs/batch-test-config.yaml" -v

# Con filtros
dotnet run -- -s "ruta/solucion.sln" -o "test-results/filtered.json" --filter-types "Class,Interface"
```

### 2. Usando el script cross-platform (producción)
```bash
# Análisis completo con script automatizado
./scripts/analyze-solution.sh "ruta/solucion.sln" "test-results"

# Con opciones avanzadas
./scripts/analyze-solution.sh "ruta/solucion.sln" "test-results" --verbose --filter-types "Class,Interface"

# Ayuda del script
./scripts/analyze-solution.sh --help
```

## Configuración de Pruebas

Edita `configs/batch-test-config.yaml` para configurar:
- Directorio de salida
- Filtros de tipos de símbolos
- Exclusión de proyectos
- Múltiples soluciones

## Archivos Ignorados por Git

Los siguientes archivos NO se suben al repositorio:
- `test-results/` - Todos los resultados de pruebas
- `bin/` y `obj/` - Artefactos de build
- `*-test-*.json` - Archivos temporales de prueba
- `infocorp-*.json` - Resultados de análisis de soluciones externas

## Limpieza

Para limpiar archivos de prueba:
```bash
Remove-Item "test-results" -Recurse -Force
```
