# Diferencias entre Tailored 6.X (.NET Framework 4.5.2) y 7.X (.NET 8)

Este documento detalla las diferencias clave entre las dos versiones de Tailored para generar guías apropiadas.

## 📊 Resumen Ejecutivo

| Aspecto | Versión 6.X | Versión 7.X |
|---------|-------------|-------------|
| **Framework** | .NET Framework 4.5.2 | .NET 8.0 |
| **Formato .csproj** | XML tradicional (ToolsVersion="12.0") | SDK-style (Sdk="Microsoft.NET.Sdk") |
| **Estructura** | Carpetas numeradas (1_, 2_, 3_, 4_) | Carpetas numeradas (1_, 2_, 3_, 4_) |
| **Unity IoC** | UnityConfiguration.config con fully qualified types | UnityConfiguration.config simplificado |
| **Naming Convention** | `<Clase>Extended` | `<Clase>Extended` |
| **PostSharp** | PostSharp 4.1.15 | No usa PostSharp |
| **NuGet** | packages.config | PackageReference en .csproj |

## 🗂️ Estructura de Carpetas

### Ambas Versiones Comparten:
```
Tailored.ICBanking.sln/
├── 1_PresentationLayer/
│   ├── UserInterface/
│   ├── UserInterfaceProcess/
│   └── UserInterfaceWebApi/
├── 2_ServicesLayer/
│   ├── ServiceHost/
│   └── Services/
├── 3_BusinessLayer/
│   ├── BusinessComponents/
│   └── BusinessEntities/
├── 4_DataLayer/
│   ├── DataAccess/
│   ├── ServiceAgents/
│   └── Daemons/
├── Cross-Cutting/
│   ├── Tailored.ICBanking.ApplicationServer.Common/
│   ├── Tailored.ICBanking.ApplicationServer.Interfaces/
│   ├── Tailored.ICBanking.Common/
│   └── Tailored.ICBanking.MethodParameters/
├── Resources/
│   ├── Assemblies_ProductAppServer/
│   ├── Files/
│   └── NuGetPackages/ (solo 6.X)
└── Databases/
```

### Diferencias en Ubicación:
- **6.X:** `Daemons/` está en `4_DataLayer/Daemons/`
- **7.X:** `Daemons/` está en raíz `Daemons/`

## 📄 Formato .csproj

### Versión 6.X (Framework 4.5.2)
```xml
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="12.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <TargetFrameworkVersion>v4.5.2</TargetFrameworkVersion>
    <AssemblyName>Tailored.ICBanking.BusinessComponents</AssemblyName>
  </PropertyGroup>

  <!-- Referencias con HintPath explícito -->
  <ItemGroup>
    <Reference Include="Infocorp.ApplicationServer.Common">
      <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.ApplicationServer.Common.dll</HintPath>
    </Reference>
  </ItemGroup>

  <!-- PostSharp -->
  <Import Project="..\..\..\Resources\NuGetPackages\PostSharp.4.1.15\tools\PostSharp.targets" />

  <!-- ProjectReferences con {GUID} -->
  <ItemGroup>
    <ProjectReference Include="..\..\..\4_DataLayer\DataAccess\Tailored.ICBanking.DataAccess\Tailored.ICBanking.DataAccess.csproj">
      <Project>{D22C54A4-4672-4AB3-840E-CA0F1D476FDE}</Project>
      <Name>Tailored.ICBanking.DataAccess</Name>
    </ProjectReference>
  </ItemGroup>

  <!-- Archivos .cs compilados explícitamente -->
  <ItemGroup>
    <Compile Include="Administration\ClientsExtended.cs" />
    <Compile Include="Framework\CommonExtended.cs" />
  </ItemGroup>
</Project>
```

### Versión 7.X (.NET 8)
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <AssemblyOriginatorKeyFile>..\..\..\Resources\Files\Infocorp.snk</AssemblyOriginatorKeyFile>
  </PropertyGroup>

  <!-- Referencias simplificadas -->
  <ItemGroup>
    <Reference Include="Infocorp.ApplicationServer.Common">
      <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.ApplicationServer.Common.dll</HintPath>
    </Reference>
  </ItemGroup>

  <!-- PackageReference (no packages.config) -->
  <ItemGroup>
    <PackageReference Include="Microsoft.CSharp" Version="4.7.0" />
    <PackageReference Include="RazorEngine.NetCore" Version="3.1.0" />
  </ItemGroup>

  <!-- ProjectReferences sin GUID -->
  <ItemGroup>
    <ProjectReference Include="..\..\..\4_DataLayer\DataAccess\Tailored.ICBanking.DataAccess\Tailored.ICBanking.DataAccess.csproj" />
  </ItemGroup>

  <!-- NO lista archivos .cs - se incluyen automáticamente -->
</Project>
```

## 🔧 Unity Configuration

### Versión 6.X
```xml
<unity xmlns="http://schemas.microsoft.com/practices/2010/unity">
  <container>
    <!-- Fully qualified types con Version y PublicKeyToken -->
    <register type="Infocorp.ApplicationServer.Interfaces.BusinessComponents.Administration.IClients, Infocorp.ApplicationServer.Interfaces, Version=1.0.0.0, Culture=neutral, PublicKeyToken=f43e0188197ab34e"
              mapTo="Tailored.ICBanking.BusinessComponents.Administration.ClientsExtended, Tailored.ICBanking.BusinessComponents, Version=1.0.0.0, Culture=neutral, PublicKeyToken=f43e0188197ab34e" />
  </container>
</unity>
```

### Versión 7.X
```xml
<unity xmlns="http://schemas.microsoft.com/practices/2010/unity">
  <container>
    <!-- Tipos simplificados (sin Version/PublicKeyToken) -->
    <register type="Infocorp.ApplicationServer.Interfaces.BusinessComponents.Administration.IClients"
              mapTo="Tailored.ICBanking.BusinessComponents.Administration.ClientsExtended" />
  </container>
</unity>
```

## 📝 Código C# - Diferencias Menores

### Convenciones Compartidas
- **Naming:** `<ClaseBase>Extended` (ejemplo: `ClientsExtended`)
- **Namespace:** `Tailored.ICBanking.BusinessComponents.<SubCarpeta>`
- **Herencia:** Heredan de clase concreta de ICBanking
- **Inyección de dependencias:** `CachingInterfaceFactory.Resolve<T>()`

### Diferencias en Código
Mínimas - el código C# es prácticamente idéntico entre versiones:

```csharp
// 6.X y 7.X - Mismo código
using Infocorp.Administration.BusinessComponents;
using Infocorp.ApplicationServer.Interfaces.BusinessComponents;
using Infocorp.Framework.Common.InterfaceFactory;

namespace Tailored.ICBanking.BusinessComponents.Administration
{
    public class ClientsExtended : Infocorp.Administration.BusinessComponents.Clients
    {
        public override UpdateSiteClientSubsidiariesOut UpdateSiteClientSubsidiaries(UpdateSiteClientSubsidiariesIn input)
        {
            // Lógica de override
            return base.UpdateSiteClientSubsidiaries(input);
        }
    }
}
```

## 🎯 Impacto en Templates de Guías

### Templates que DEBEN cambiar:

1. **Referencias .csproj**
   - **6.X:** Mostrar formato XML tradicional con `<Project ToolsVersion="12.0">`
   - **7.X:** Mostrar SDK-style `<Project Sdk="Microsoft.NET.Sdk">`

2. **Unity Configuration**
   - **6.X:** Fully qualified types con Version/PublicKeyToken
   - **7.X:** Tipos simplificados sin Version/PublicKeyToken

3. **Compilación**
   - **6.X:** MSBuild con .NET Framework 4.5.2
   - **7.X:** `dotnet build` con .NET 8

4. **PostSharp**
   - **6.X:** Mencionar PostSharp 4.1.15
   - **7.X:** No mencionar PostSharp

### Templates que NO cambian:
- Patrón de código C# (herencia, override)
- Naming conventions (`Extended`)
- Estructura de carpetas
- Inyección de dependencias
- Lógica de negocio

## 🚀 Comandos de Compilación

### Versión 6.X
```bash
# Compilar con MSBuild
cd C:\GIT\RBSUR\Tailored
"C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe" Tailored.ICBanking.sln /p:Configuration=Debug /p:TargetFrameworkVersion=v4.5.2
```

### Versión 7.X
```bash
# Compilar con dotnet CLI
cd C:\GIT\ICB7C\Tailored
dotnet build Tailored.ICBanking.sln --configuration Debug
```

## 📋 Checklist de Validación

### Versión 6.X
- [ ] Proyecto usa `TargetFrameworkVersion>v4.5.2`
- [ ] Referencias con `<HintPath>` explícito
- [ ] Archivos `.cs` listados en `<Compile Include>`
- [ ] PostSharp configurado
- [ ] Unity con fully qualified types
- [ ] packages.config existe

### Versión 7.X
- [ ] Proyecto usa `<TargetFramework>net8.0</TargetFramework>`
- [ ] SDK-style project format
- [ ] `<PackageReference>` en .csproj
- [ ] No hay packages.config
- [ ] Unity con tipos simplificados
- [ ] No usa PostSharp

## 🔍 Cómo Detectar la Versión

En el código de TailoredGuidanceService, detectar por version string:
- **6.X:** `version.startswith("6.")`
- **7.X:** `version.startswith("7.")`

```python
def _get_templates_path(self, version: str) -> Path:
    if version and version.startswith("6."):
        return TEMPLATES_DIR / "v6"
    else:
        return TEMPLATES_DIR / "v7"
```

## 🎨 Estructura de Templates Propuesta

```
templates/tailored_guidance/
├── v6/                                    # Templates para .NET Framework 4.5.2
│   ├── extend_business_component.md
│   ├── final_validations.md
│   ├── code_snippets/
│   │   ├── business_component_code.md
│   │   ├── unity_registration.md         # Fully qualified
│   │   └── component_reference.md        # XML tradicional
│   └── validation_snippets/
│       └── extend_business_component_validations.md
└── v7/                                    # Templates para .NET 8 (actuales)
    ├── extend_business_component.md
    ├── final_validations.md
    ├── code_snippets/
    │   ├── business_component_code.md
    │   ├── unity_registration.md         # Simplificado
    │   └── component_reference.md        # SDK-style
    └── validation_snippets/
        └── extend_business_component_validations.md
```

---

**Nota:** Esta documentación se usa para generar templates versionados en el MCP Server de Grafo.
