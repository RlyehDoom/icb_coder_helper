## 🌐 Extender API en Tailored

### 1. Estructura de {api_name} API

```
Tailored.ICBanking.sln/
└── 2_ServicesLayer/
    └── {layer}/
        ├── Program.cs          ← Punto de entrada
        ├── Startup.cs          ← Configuración (hereda de Infocorp)
        └── UnityConfiguration.config  ← Registro de componentes
```

### 2. Startup - Patrón de Herencia

```csharp
using Microsoft.Extensions.Configuration;

namespace Tailored.ICBanking.{api_name}.Api
{{
    public class Startup : Infocorp.{api_name}.Api.Startup
    {{
        public Startup(IConfiguration configuration) : base(configuration)
        {{
            // Configuración adicional de Tailored
        }}

        // Override de métodos virtuales si es necesario
        // public override void ConfigureServices(IServiceCollection services)
        // {{
        //     base.ConfigureServices(services);
        //     // Servicios adicionales de Tailored
        // }}
    }}
}}
```

### 3. Program.cs - Punto de Extensión

```csharp
using Microsoft.Extensions.Hosting;

namespace Tailored.ICBanking.{api_name}.Api
{{
    public class Program
    {{
        public static void Main(string[] args)
        {{
            Infocorp.{api_name}.Api.Program
                .CreateHostBuilder(args, typeof(Startup))
                .CreateHostExtension(CreateHostBuilder, args)
                .Build()
                .Run();
        }}

        // PUNTO DE EXTENSIÓN para configuración personalizada
        private static IHostBuilder CreateHostBuilder(
            string[] args, IHostBuilder hostBuilder) => hostBuilder;
    }}
}}
```
