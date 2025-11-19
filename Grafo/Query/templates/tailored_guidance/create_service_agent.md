## 🔌 Crear Service Agent en Tailored

### 1. Ubicación

```
Tailored.ICBanking.sln/
└── 4_DataLayer/
    └── ServiceAgents/
        └── Tailored.ICBanking.ServiceAgents/
{component_file_location}```

### 2. Patrón de Código

```csharp
using Infocorp.Backend.ServiceAgents.Framework;
using Infocorp.Framework.Common.Interfaces;

{code_pattern}```

### 3. Referencias Necesarias

```xml
<Reference Include="Infocorp.Backend.ServiceAgents.Framework">
  <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.Backend.ServiceAgents.Framework.dll</HintPath>
</Reference>
```
