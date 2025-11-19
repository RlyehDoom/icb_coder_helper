```csharp
namespace Tailored.ICBanking.BusinessComponents
{{{{
    public class {component_name} : Infocorp.{component_name}.BusinessComponents.{component_name}
    {{{{
        // Override del método
        public override TipoRetorno MetodoAExtender(ParametrosIn input)
        {{{{
            // OPCIÓN 1: Pre-processing + llamada a base
            // Validaciones personalizadas de Tailored
            ValidarReglaTailored(input);

            // Llamar a la lógica original de ICBanking
            var result = base.MetodoAExtender(input);

            // Post-processing personalizado
            AplicarTransformacionTailored(result);

            return result;

            // OPCIÓN 2: Reemplazo completo (solo si necesario)
            // return NuevaImplementacionTailored(input);
        }}}}
    }}}}
}}
```
