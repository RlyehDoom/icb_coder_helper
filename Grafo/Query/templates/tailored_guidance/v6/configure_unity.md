## ⚙️ Configurar Unity IoC en Tailored

### 1. Ubicación del Archivo

```
Tailored.ICBanking.AppServer.Api/
└── UnityConfiguration.config  ← EDITAR ESTE ARCHIVO
```

### 2. Estructura Básica

```xml
<?xml version="1.0"?>
<unity xmlns="http://schemas.microsoft.com/practices/2010/unity">
  <container>
    <!-- Registros de componentes Tailored -->
  </container>
</unity>
```

### 3. Patrones de Registro

#### 3.1 Override de Business Component

```xml
<register type="Infocorp.ApplicationServer.Interfaces.BusinessComponents.IAccounts"
         mapTo="Tailored.ICBanking.BusinessComponents.Accounts" />
```

#### 3.2 Singleton

```xml
<register type="Infocorp.ApplicationServer.Common.Utilities.ISqlProvider"
         mapTo="Infocorp.ApplicationServer.Common.Utilities.MicrosoftSqlProvider">
  <lifetime type="singleton"/>
</register>
```

#### 3.3 Con Assembly Full Name

```xml
<register
  type="Infocorp.ApplicationServer.Interfaces.BusinessComponents.ILoans, Infocorp.ApplicationServer.Interfaces, Version=1.0.0.0, Culture=neutral, PublicKeyToken=f43e0188197ab34e"
  mapTo="Tailored.ICBanking.BusinessComponents.Loans, Tailored.ICBanking.BusinessComponents, Version=1.0.0.0, Culture=neutral, PublicKeyToken=f43e0188197ab34e" />
```

### 4. Contenedores Nombrados

```xml
<!-- Para proveedores específicos -->
<container name="DataProvider">
  <register type="Infocorp.ApplicationServer.Interfaces.DataAccess.Framework.IDynamicParameters"
           mapTo="IC.DataAccess.Dapper.DynamicParametersDapper" />
</container>

<!-- Para encriptación -->
<container name="Cryptographer">
  <register type="Infocorp.Framework.Common.Interfaces.IEncryption"
           mapTo="Infocorp.Framework.Common.Utilities.AESEncryption"
           name="AES"/>
</container>
```

### 5. Resolver Dependencias en Código

```csharp
// Desde contenedor default
var service = CachingInterfaceFactory.Resolve<IMyService>();

// Desde contenedor nombrado
var service = CachingInterfaceFactory.Resolve<IMyService>(
    "DataProvider");
```

{component_example}
