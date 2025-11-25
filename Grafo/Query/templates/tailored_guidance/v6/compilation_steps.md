## 🔨 Compilación por Capas de Arquitectura

### ⚠️ IMPORTANTE: Orden de Compilación

La arquitectura de ICBanking/Tailored tiene **dependencias en cascada**. Cuando modificas un proyecto, **DEBES** compilar también los proyectos que dependen de él.

---

### Arquitectura y Dependencias

```
📦 ICBanking/Tailored Architecture (Capas de abajo hacia arriba)

5. WebApi                    ← Depende de TODO
   └── Tailored.ICBanking.WebServer.Api
       └── Infocorp.Banking.WebServer.Api

4. ServiceHost (AppServer)   ← Depende de capas 1-3
   └── Tailored.ICBanking.AppServer.Api
       └── Infocorp.Banking.AppServer

3. Business Layer            ← Depende de capas 1-2
   └── BusinessComponents/
       └── Tailored.ICBanking.BusinessComponents

2. Data Layer                ← Depende de capa 1
   ├── DataAccess/
   │   └── Tailored.ICBanking.DataAccess
   └── ServiceAgents/
       └── Tailored.ICBanking.ServiceAgents

1. Cross-Cutting            ← Base (no depende de nadie)
   ├── BusinessEntities
   ├── MethodParameters
   ├── Framework
   └── Common
```

---

### Reglas de Compilación

#### ✅ Regla 1: Si modificas BusinessComponents
```bash
# DEBES compilar (en orden):
1. BusinessComponents         # Tu cambio
2. ServiceHost (AppServer)    # Depende de BusinessComponents
3. WebApi                     # Depende de ServiceHost
```

#### ✅ Regla 2: Si modificas DataAccess o ServiceAgents
```bash
# DEBES compilar (en orden):
1. DataAccess/ServiceAgents   # Tu cambio
2. BusinessComponents         # Puede depender de DataAccess
3. ServiceHost (AppServer)    # Depende de BusinessComponents
4. WebApi                     # Depende de ServiceHost
```

#### ✅ Regla 3: Si modificas Cross-Cutting (BusinessEntities, Framework, Common)
```bash
# DEBES compilar TODO (en orden):
1. Cross-Cutting              # Tu cambio (base de TODO)
2. DataAccess/ServiceAgents   # Dependen de Cross-Cutting
3. BusinessComponents         # Depende de Cross-Cutting y DataAccess
4. ServiceHost (AppServer)    # Depende de todo lo anterior
5. WebApi                     # Depende de ServiceHost
```

#### ⚠️ Regla General (RECOMENDADO)
**Para estar seguro, SIEMPRE compila ServiceHost y WebApi:**
```bash
# Compilación completa segura
cd /Tailored
dotnet build Tailored.ICBanking.sln --configuration Debug

# Si compila sin errores, entonces compilar hosts
cd /Tailored/Tailored.ICBanking.AppServer.Api
dotnet build --configuration Debug

cd /Tailored/Tailored.ICBanking.WebServer.Api
dotnet build --configuration Debug
```

---

### Comandos de Compilación Recomendados

#### 🎯 Opción 1: Compilación Completa (MÁS SEGURA)
```bash
# Compilar toda la solución
cd /Tailored
dotnet build Tailored.ICBanking.sln --configuration Debug

# Verificar ServiceHost
cd Tailored.ICBanking.AppServer.Api
dotnet build --configuration Debug

# Verificar WebApi
cd Tailored.ICBanking.WebServer.Api
dotnet build --configuration Debug
```

#### 🎯 Opción 2: Compilación por Proyecto Específico
```bash
# Compilar solo tu proyecto modificado
cd /Tailored/[RUTA_AL_PROYECTO]
dotnet build --configuration Debug

# LUEGO compilar ServiceHost (OBLIGATORIO)
cd /Tailored/Tailored.ICBanking.AppServer.Api
dotnet build --configuration Debug

# LUEGO compilar WebApi (OBLIGATORIO)
cd /Tailored/Tailored.ICBanking.WebServer.Api
dotnet build --configuration Debug
```

---

### ✅ Checklist de Compilación

Después de modificar CUALQUIER proyecto, verifica:

- [ ] **Tu proyecto compila** sin errores
- [ ] **ServiceHost compila** sin errores (AppServer.Api)
- [ ] **WebApi compila** sin errores (WebServer.Api)
- [ ] **No hay warnings críticos** relacionados con tus cambios
- [ ] **Referencias .csproj** están correctas

---

### 🚨 Errores Comunes

#### Error: "The type or namespace 'X' could not be found"
**Causa:** Falta referencia en `.csproj`

**Solución:**
1. Verificar qué proyecto define el tipo `X`
2. Agregar `<ProjectReference>` o `<Reference>` en tu `.csproj`
3. Recompilar

#### Error: "Could not load file or assembly 'X'"
**Causa:** DLL no está en el directorio de salida

**Solución:**
1. Limpiar y recompilar: `dotnet clean && dotnet build`
2. Verificar que el proyecto referenciado compiló correctamente
3. Verificar `Copy Local = True` en las referencias

#### Error en ServiceHost o WebApi después de tu cambio
**Causa:** Tu cambio rompió una dependencia

**Solución:**
1. Leer el error completo para identificar qué se rompió
2. Verificar que no cambiaste firmas de métodos públicos
3. Verificar que no eliminaste clases o métodos usados por otros proyectos
4. Si es un cambio intencional, actualizar también los proyectos dependientes

---

### 💡 Recomendación Final

**SIEMPRE compila ServiceHost y WebApi** después de cualquier cambio en Tailored.

Estos proyectos son los **puntos de entrada de la aplicación** y deben poder arrancar correctamente. Si alguno falla, tu cambio NO está completo.
