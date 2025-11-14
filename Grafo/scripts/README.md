# Scripts de Grafo

Scripts shell para gestión del proyecto (Windows/Linux/macOS con bash).

## 📋 Scripts

### setup.sh
Configuración completa automática.
```bash
./scripts/setup.sh
```

### build.sh  
Compila RoslynIndexer y verifica CLI.
```bash
./scripts/build.sh
```

### test.sh
Ejecuta suite de pruebas.
```bash
./scripts/test.sh --quick    # Prueba rápida
./scripts/test.sh --verbose  # Con detalles
```

### clean.sh
Limpia archivos temporales.
```bash
./scripts/clean.sh           # Limpieza estándar
./scripts/clean.sh --deep    # Incluye node_modules
```

### install.sh
Instalación global de la CLI.
```bash
./scripts/install.sh         # Instalar
./scripts/install.sh -u      # Desinstalar
```

## 🖥️ Compatibilidad

Scripts bash estándar funcionan en:
- **Windows**: Git Bash, WSL
- **Linux**: Bash nativo
- **macOS**: Terminal nativo

### Windows
Instalar **Git for Windows** (incluye Git Bash automáticamente)
https://git-scm.com/download/win

## 🚀 Uso

```bash
# Primera instalación
./scripts/setup.sh

# Desarrollo diario
./scripts/build.sh
./scripts/test.sh --quick

# Instalación global
./scripts/install.sh
grafo status
```

## 🚨 Problemas Comunes

```bash
# Script no ejecutable
chmod +x scripts/*.sh

# Bash no encontrado (Windows)
# Instalar Git for Windows: https://git-scm.com/download/win

# Prerequisitos faltantes
node --version     # >= 16.x
dotnet --version   # >= 8.0
git --version      # cualquier versión

# PATH diferente en bash vs PowerShell (Windows)
# Usar: node src/cli.js all setup
```

---

Scripts simples y efectivos para gestión cross-platform del proyecto Grafo.
