## 📦 Extender Business Component de ICBanking en Tailored

{component_header}

### ⚠️ PASO 0: VERIFICAR ANTES DE ESCRIBIR CÓDIGO

**CRÍTICO:** Antes de crear el archivo, **DEBES** verificar la información real de la clase base en ICBanking:

{inheritance_info}

{csproj_verification}

---

### 1. Ubicación del Archivo

```
Tailored.ICBanking.sln/
└── 3_BusinessLayer/
    └── BusinessComponents/
        └── Tailored.ICBanking.BusinessComponents/
{component_file_location}```

### 2. Patrón de Código

```csharp
{code_pattern}```

### 3. Referencias Necesarias

Agregar en `Tailored.ICBanking.BusinessComponents.csproj`:

```xml
<ItemGroup>
  <!-- Referencias internas de Tailored -->
  <ProjectReference Include="..\..\..\4_DataLayer\DataAccess\Tailored.ICBanking.DataAccess\Tailored.ICBanking.DataAccess.csproj" />
  <ProjectReference Include="..\..\..\Cross-Cutting\Tailored.ICBanking.ApplicationServer.BusinessEntities\Tailored.ICBanking.ApplicationServer.BusinessEntities.csproj" />
  <ProjectReference Include="..\..\..\Cross-Cutting\Tailored.ICBanking.MethodParameters\Tailored.ICBanking.MethodParameters.csproj" />

  <!-- Referencias a ICBanking Framework -->
  <Reference Include="Infocorp.ApplicationServer.Common">
    <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.ApplicationServer.Common.dll</HintPath>
  </Reference>
  <Reference Include="Infocorp.ApplicationServer.Interfaces">
    <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.ApplicationServer.Interfaces.dll</HintPath>
  </Reference>
{component_reference}</ItemGroup>
```

### 4. Registrar en Unity

Editar `Tailored.ICBanking.AppServer.Api/UnityConfiguration.config`:

```xml
<unity xmlns="http://schemas.microsoft.com/practices/2010/unity">
  <container>
{unity_registration}  </container>
</unity>
```

### 5. Inyección de Dependencias

Si tu componente necesita otros servicios:

```csharp
// Propiedades virtuales para inyección
private ICommon _commonComponent;
public virtual ICommon CommonComponent
{{
    get {{ return _commonComponent ?? (_commonComponent =
        CachingInterfaceFactory.Resolve<ICommon>()); }}
    set {{ _commonComponent = value; }}
}}
```

### 6. Convenciones Importantes

- ✅ **Namespace:** `Tailored.ICBanking.BusinessComponents`
{component_convention}- ✅ **NAMING CONVENTION (CRÍTICO):**
  - **Clase extendida:** `<ClaseOriginal>Extended` (ejemplo: `Accounts` → `AccountsExtended`)
  - **Archivo:** `<ArchivoOriginal sin .cs>Extended.cs` (ejemplo: `Accounts.cs` → `AccountsExtended.cs`)
  - Esta convención es **OBLIGATORIA** para todo código que extiende clases base de ICBanking
- ✅ **Herencia:** Extender de la clase concreta de ICBanking
- ✅ **Métodos virtuales:** Solo puedes override métodos marcados como `virtual` en ICBanking
- ✅ **Llamar a base:** Siempre considera llamar a `base.Metodo()` para mantener lógica de ICBanking
