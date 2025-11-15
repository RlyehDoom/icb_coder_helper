# makefile.sh - Guía de Uso

Script multiplataforma para gestionar el Grafo Query Service.

## 🌍 Compatibilidad

- ✅ **Linux** (Ubuntu, Debian, RHEL, etc.)
- ✅ **macOS** (Monterey, Ventura, Sonoma, etc.)
- ✅ **Windows** (Git Bash, WSL, MSYS2)

## 🐍 Detección Automática de Python

El script detecta automáticamente qué comando de Python usar:

| Sistema | Comando Detectado | Motivo |
|---------|-------------------|--------|
| Linux/macOS | `python3` | Python 3 es estándar |
| Windows | `python` | Instalador oficial usa `python` |

Si tienes ambos instalados, el script prefiere `python3` por defecto.

## 📋 Comandos Disponibles

### Desarrollo

```bash
# Ver todos los comandos
./makefile.sh help

# Instalar dependencias (crea venv automáticamente)
./makefile.sh install

# Ejecutar en modo producción
./makefile.sh run

# Ejecutar en modo desarrollo (auto-reload)
./makefile.sh dev
```

### Docker

```bash
# Construir imagen
./makefile.sh docker-build

# Ejecutar con Docker Compose
./makefile.sh docker-run

# Ver logs en tiempo real
./makefile.sh docker-logs

# Detener contenedores
./makefile.sh docker-stop
```

### Utilidad

```bash
# Limpiar archivos temporales
./makefile.sh clean

# Ejecutar pruebas (requiere pytest)
./makefile.sh test

# Verificar código (requiere linters)
./makefile.sh lint
```

## 🚀 Inicio Rápido

### Primera vez

```bash
# Clonar e instalar
cd Grafo/Query
./makefile.sh install

# Copiar configuración
cp .env.example .env
# Editar .env según tu configuración

# Ejecutar
./makefile.sh dev
```

### Uso diario

```bash
# Simplemente ejecutar en modo desarrollo
./makefile.sh dev
```

## 🔧 Características Especiales

### Gestión Automática de Entorno Virtual

El script:
1. ✅ Detecta si existe `venv/`
2. ✅ Lo crea si no existe (durante `install`)
3. ✅ Lo activa automáticamente antes de ejecutar comandos
4. ✅ Funciona en Linux, macOS y Windows

### Detección de Sistema Operativo

```bash
# En Linux
$ ./makefile.sh help
Sistema detectado: linux | Python: python3

# En macOS
$ ./makefile.sh help
Sistema detectado: mac | Python: python3

# En Windows (Git Bash)
$ ./makefile.sh help
Sistema detectado: windows | Python: python
```

### Mensajes Coloridos

El script usa colores ANSI para mejor legibilidad:
- 🔵 **Azul**: Acciones en progreso
- 🟢 **Verde**: Éxito
- 🟡 **Amarillo**: Advertencias
- 🔴 **Rojo**: Errores

## 🐛 Troubleshooting

### "Python no está instalado"

**Síntoma:**
```
❌ Python no está instalado
   Instalar Python 3.11+ desde https://www.python.org/
```

**Solución:**
1. Instalar Python 3.11+ desde https://www.python.org/
2. En Windows, marcar "Add Python to PATH" durante la instalación
3. Reiniciar terminal/Git Bash

### "Permission denied" en Linux/Mac

**Síntoma:**
```
-bash: ./makefile.sh: Permission denied
```

**Solución:**
```bash
chmod +x makefile.sh
./makefile.sh help
```

### Scripts no funcionan en Windows PowerShell

**Síntoma:**
Los comandos no funcionan en PowerShell nativo de Windows.

**Solución:**
Usar uno de estos:
- Git Bash (recomendado)
- WSL (Windows Subsystem for Linux)
- MSYS2

### El venv no se activa en Windows

**Síntoma:**
El entorno virtual no se activa correctamente.

**Causa:**
El script detecta automáticamente la ruta correcta:
- Linux/Mac: `venv/bin/activate`
- Windows: `venv/Scripts/activate`

**Verificación:**
```bash
./makefile.sh install
# Debería ver: "✅ Dependencias instaladas"
```

## 💡 Tips

### Usar con alias

Agrega a tu `.bashrc` o `.zshrc`:

```bash
alias query-dev='cd /path/to/Grafo/Query && ./makefile.sh dev'
alias query-test='cd /path/to/Grafo/Query && ./makefile.sh test'
```

### Integración con IDEs

#### VSCode

Crear task en `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Query Service - Dev",
      "type": "shell",
      "command": "./makefile.sh dev",
      "options": {
        "cwd": "${workspaceFolder}/Grafo/Query"
      },
      "problemMatcher": []
    }
  ]
}
```

#### PyCharm

1. Run → Edit Configurations
2. Add New Configuration → Shell Script
3. Script path: `/path/to/Grafo/Query/makefile.sh`
4. Script options: `dev`

### Ejecutar múltiples comandos

```bash
# Limpiar, instalar y ejecutar
./makefile.sh clean && ./makefile.sh install && ./makefile.sh dev

# Build y run con Docker
./makefile.sh docker-build && ./makefile.sh docker-run
```

## 📊 Comparación con otros métodos

| Método | Cross-platform | Auto-venv | Detección Python |
|--------|---------------|-----------|------------------|
| `makefile.sh` | ✅ Sí | ✅ Sí | ✅ Automática |
| `Makefile` | ⚠️ No Windows | ❌ No | ❌ Manual |
| `setup.py` | ✅ Sí | ❌ No | ⚠️ Limitada |
| Manual | ✅ Sí | ❌ No | ❌ Manual |

## 🔗 Referencias

- [Documentación principal](README.md)
- [Guía de integración MCP](INTEGRATION_MCP.md)
- [Resumen del proyecto](PROJECT_SUMMARY.md)

---

**Versión:** 1.0.0  
**Compatible con:** Python 3.11+  
**Última actualización:** Octubre 2024

