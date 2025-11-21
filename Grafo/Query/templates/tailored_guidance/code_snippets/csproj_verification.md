#### 📋 2. Verificar Referencias del .csproj Base

**Ubicación del .csproj base:**
```
[Raíz de tu solución ICBanking]
  └── [Ubicación del proyecto que contiene {component_name}]
      └── [ProjectName].csproj
```

**Pasos para copiar referencias:**

1. **Abrir el .csproj del proyecto base** en ICBanking
2. **Copiar todas las referencias `<Reference>` y `<ProjectReference>`** que sean necesarias
3. **Pegar en Tailored.ICBanking.BusinessComponents.csproj**
4. **Ajustar paths** si es necesario

**Ejemplo de lo que debes buscar:**
```xml
<ItemGroup>
  <Reference Include="Infocorp.XXX.dll" />
  <ProjectReference Include="..\OtroProyecto\OtroProyecto.csproj" />
</ItemGroup>
```

{project_references_info}

**⚠️ IMPORTANTE:** Si no copias las referencias correctamente, el proyecto **NO COMPILARÁ**.