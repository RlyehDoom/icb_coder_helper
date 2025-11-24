## 💾 Crear Data Access en Tailored

### 1. Ubicación

```
Tailored.ICBanking.sln/
└── 4_DataLayer/
    └── DataAccess/
        └── Tailored.ICBanking.DataAccess/
{component_file_location}
```

### 2. Patrón de Código

{code_pattern}

### 3. Referencias NuGet Necesarias

```xml
<ItemGroup>
  <PackageReference Include="Dapper" Version="2.0.90" />
  <PackageReference Include="System.Data.SqlClient" Version="4.8.3" />
  <PackageReference Include="StackExchange.Redis" Version="2.5.61" />
</ItemGroup>
```

### 4. Referencias a Framework

```xml
<Reference Include="Infocorp.Framework.DataAccess">
  <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.Framework.DataAccess.dll</HintPath>
</Reference>
<Reference Include="IC.DataAccess">
  <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\IC.DataAccess.dll</HintPath>
</Reference>
```
