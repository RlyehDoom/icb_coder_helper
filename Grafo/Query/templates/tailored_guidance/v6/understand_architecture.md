## 🏗️ Arquitectura de Tailored - ICBanking

### 1. Estructura en Capas (4 niveles + Cross-Cutting)

```
Tailored.ICBanking.sln
│
├── 1_PresentationLayer/
│   └── UserInterface/
│       └── Tailored.ICBanking.BackOfficeUI (ASP.NET Web App)
│
├── 2_ServicesLayer/
│   ├── AppServerApi/
│   │   └── Tailored.ICBanking.AppServer.Api (ASP.NET Core API)
│   └── WebServerApi/
│       └── Tailored.ICBanking.WebServer.Api (ASP.NET Core API)
│
├── 3_BusinessLayer/
│   └── BusinessComponents/
│       └── Tailored.ICBanking.BusinessComponents (Lógica de negocio)
│
├── 4_DataLayer/
│   ├── DataAccess/
│   │   └── Tailored.ICBanking.DataAccess (Acceso a BD)
│   └── ServiceAgents/
│       └── Tailored.ICBanking.ServiceAgents (Llamadas externas)
│
└── Cross-Cutting/
    ├── Tailored.ICBanking.ApplicationServer.BusinessEntities (DTOs)
    ├── Tailored.ICBanking.MethodParameters (Parámetros)
    └── Tailored.ICBanking.Common (Utilidades)
```

### 2. Patrón de Extensibilidad con Unity

Tailored **NO modifica** código de ICBanking. En su lugar:

1. **Hereda** de clases de ICBanking
2. **Override** de métodos virtuales
3. **Registra** en Unity para reemplazar implementaciones

#### Flujo de Extensión:

```
Cursor solicita IAccounts
       ↓
Unity lee UnityConfiguration.config
       ↓
Encuentra: IAccounts → Tailored.ICBanking.BusinessComponents.Accounts
       ↓
Inyecta la versión Tailored (que hereda de Infocorp)
```

### 3. Convenciones de Nombres

| Elemento | Patrón | Ejemplo |
|----------|--------|----------|
| **Namespace** | `Tailored.<Feature>.<Component>` | `Tailored.ICBanking.BusinessComponents` |
| **Clase Business** | Mismo nombre que ICBanking | `Accounts`, `Clients` |
| **Data Access** | `<Feature>DataAccess` | `AccountsDataAccess` |
| **Service Agent** | `<Feature>ServiceAgent` | `ClientsServiceAgent` |
| **Ensamblado** | `Tailored.<Feature>.<Layer>` | `Tailored.ICBanking.BusinessComponents` |

### 4. Flujo de Dependencias

```
API Layer (AppServer/WebServer)
       ↓ (usa)
Business Components
       ↓ (usa)
DataAccess + ServiceAgents
       ↓ (usa)
Cross-Cutting (Entities, Parameters, Common)
```

**Regla:** Capas superiores dependen de capas inferiores, nunca al revés.

### 5. Referencias a ICBanking Framework

Todos los proyectos Tailored referencian assemblies de ICBanking:

```
Resources/
└── Assemblies_ProductAppServer/
    ├── Infocorp.ApplicationServer.Common.dll
    ├── Infocorp.ApplicationServer.Interfaces.dll
    ├── Infocorp.Framework.Common.dll
    └── Infocorp.<Componente>.BusinessComponents.dll
```

### 6. Puntos Clave de Extensibilidad

#### 6.1 Business Components
- Métodos `virtual` pueden ser overridden
- Usa `base.Metodo()` para mantener lógica de ICBanking
- Propiedades virtuales para inyección de dependencias

#### 6.2 API Startup
- `Tailored.Startup` hereda de `Infocorp.Startup`
- Permite agregar configuración sin modificar ICBanking

#### 6.3 Unity Configuration
- Define qué implementaciones usar (Tailored vs ICBanking)
- Permite registros singleton, transient, etc.
- Contenedores nombrados para contextos específicos
