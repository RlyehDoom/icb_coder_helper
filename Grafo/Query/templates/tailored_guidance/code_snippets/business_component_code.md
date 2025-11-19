```csharp
using Infocorp.ApplicationServer.Interfaces.BusinessComponents;
using Infocorp.{component_name}.BusinessComponents;  // Clase base de ICBanking

namespace Tailored.ICBanking.BusinessComponents
{{
    /// <summary>
    /// Extensión Tailored de {component_name} para agregar funcionalidad personalizada.
    /// </summary>
    public class {component_name} : Infocorp.{component_name}.BusinessComponents.{component_name}
    {{
        // Override de métodos virtuales
        public override TipoRetorno MetodoAExtender(ParametrosIn input)
        {{
            // Pre-processing personalizado de Tailored
            // ...

            // Llamar a la lógica base de ICBanking
            var result = base.MetodoAExtender(input);

            // Post-processing personalizado de Tailored
            // ...

            return result;
        }}

        // Nuevos métodos específicos de Tailored
        public void NuevoMetodoTailored()
        {{
            // Lógica específica de Tailored
        }}
    }}
}}
```
