---

## ⚠️ VALIDACIONES OBLIGATORIAS

Antes de considerar esta tarea completa, **DEBES** ejecutar las siguientes validaciones:

### 1. 🔍 Verificar Compilación

**IMPORTANTE:** El código debe compilar sin errores antes de hacer commit.

```bash
# Compilar el proyecto Tailored
cd /Tailored
dotnet build Tailored.ICBanking.sln --configuration Debug

# Si hay errores, revisar:
# - Referencias faltantes en .csproj
# - Namespaces incorrectos
# - Tipos no reconocidos
# - Métodos con firma incorrecta
```

**Errores comunes:**
- `The type or namespace 'X' could not be found` → Falta referencia en .csproj
- `does not contain a definition for 'X'` → Método/propiedad no existe en clase base
- `no suitable method found to override` → Firma del método incorrecta

### 2. 🧪 Ejecutar Tests (si existen)

```bash
# Ejecutar tests del proyecto
dotnet test Tailored.ICBanking.sln --configuration Debug

# Si fallan tests:
# - Verificar que no rompiste funcionalidad existente
# - Actualizar tests si cambiaste comportamiento
# - Agregar tests para nueva funcionalidad
```

### 3. ✅ Checklist de Código

Marcar cada item antes de continuar:

- [ ] **Código compila** sin errores ni warnings
- [ ] **Tests pasan** (o no hay tests para este componente)
- [ ] **Referencias .csproj** están correctas y completas
- [ ] **Namespaces** son consistentes con la estructura del proyecto
- [ ] **Nombres de clase** siguen las convenciones de Tailored
- [ ] **Unity registration** agregado a `UnityConfiguration.config`
- [ ] **Código formateado** correctamente (indentación, llaves, etc.)
- [ ] **Comentarios XML** agregados para clases y métodos públicos
- [ ] **Verificada herencia** de la clase base (métodos virtuales disponibles)

### 4. 🔎 Validaciones Específicas por Tipo

{task_specific_validations}

### 5. 📋 Recomendaciones Finales

**Antes de hacer commit:**

1. **Revisar cambios:**
   ```bash
   git status
   git diff
   ```

2. **Verificar que solo modificaste lo necesario:**
   - No hay cambios en archivos no relacionados
   - No hay código comentado sin usar
   - No hay `TODO` o `FIXME` sin resolver

3. **Hacer commit descriptivo:**
   ```bash
   git add .
   git commit -m "feat(Tailored): [Descripción clara del cambio]"
   ```

---

## 🚨 Si Encuentras Errores

### Error: No compila

1. Verificar referencias en `.csproj` del proyecto base
2. Comparar con `.csproj` de Tailored
3. Agregar referencias faltantes
4. Volver a compilar

### Error: Tests fallan

1. Revisar qué test está fallando
2. Verificar si es por tu cambio o estaba fallando antes
3. Ajustar código o tests según corresponda

### Error: Unity no resuelve dependencia

1. Verificar registro en `UnityConfiguration.config`
2. Verificar que la interfaz y clase existen
3. Verificar namespaces correctos
4. Reiniciar aplicación para recargar Unity

---

## ✅ Cuando TODO Esté Verde

Solo cuando **TODAS** las validaciones pasen:

1. ✅ Código compila
2. ✅ Tests pasan
3. ✅ Checklist completada
4. ✅ Revisión de cambios hecha

**Entonces** puedes considerar la tarea completa y hacer commit.

---

**💡 Recuerda:** Es mejor detectar errores **AHORA** en desarrollo que en producción.
