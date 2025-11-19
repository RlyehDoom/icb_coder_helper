## ✨ Crear Componente Nuevo en Tailored

{component_header}

### 1. Definir la Capa Apropiada

| Capa | Propósito | Ejemplo |
|------|-----------|----------|
| **BusinessComponents** | Lógica de negocio | Validaciones, reglas de negocio |
| **DataAccess** | Acceso a base de datos | Queries SQL, stored procedures |
| **ServiceAgents** | Integración externa | REST APIs, SOAP services |
| **BusinessEntities** | DTOs y entidades | Objetos de transferencia |
| **MethodParameters** | Parámetros de métodos | Input/Output objects |
| **Common** | Utilidades compartidas | Helpers, extensiones |

{layer_specific_content}

### 4. Referencias Necesarias

Dependiendo de la capa, agregar en `.csproj`:

```xml
<ItemGroup>
  <!-- Referencias internas -->
  <ProjectReference Include="..\..\..\Cross-Cutting\Tailored.ICBanking.ApplicationServer.BusinessEntities\..." />
  <ProjectReference Include="..\..\..\Cross-Cutting\Tailored.ICBanking.MethodParameters\..." />

  <!-- Framework -->
  <Reference Include="Infocorp.ApplicationServer.Common">
    <HintPath>..\..\..\Resources\Assemblies_ProductAppServer\Infocorp.ApplicationServer.Common.dll</HintPath>
  </Reference>
</ItemGroup>
```

### 5. Convenciones de Código

- ✅ **Namespace:** Sigue el patrón `Tailored.ICBanking.<Layer>`
- ✅ **PascalCase:** Para clases, métodos, propiedades
- ✅ **camelCase:** Para variables locales y parámetros
- ✅ **Comentarios XML:** Documenta clases y métodos públicos
- ✅ **Async/Await:** Usa async para operaciones I/O
