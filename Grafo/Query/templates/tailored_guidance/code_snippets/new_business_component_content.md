
### 2. Estructura para Business Component

```csharp
using Tailored.ICBanking.ApplicationServer.BusinessEntities;
using Tailored.ICBanking.MethodParameters;
using Tailored.ICBanking.DataAccess;

namespace Tailored.ICBanking.BusinessComponents
{{{{
    /// <summary>
    /// {component_name} - Componente de negocio Tailored
    /// </summary>
    public class {component_name}
    {{{{
        // Inyección de dependencias
        private readonly {component_name}DataAccess _dataAccess;

        public {component_name}({component_name}DataAccess dataAccess)
        {{{{
            _dataAccess = dataAccess;
        }}}}

        public void MetodoNegocio(ParametrosIn input)
        {{{{
            // Validaciones
            ValidateInput(input);

            // Lógica de negocio
            var result = _dataAccess.GetData(input.Id);

            // Procesamiento
            ProcessResult(result);
        }}}}

        private void ValidateInput(ParametrosIn input)
        {{{{
            if (input == null)
                throw new ArgumentNullException(nameof(input));
        }}}}
    }}}}
}}}}
```

### 3. Registrar en Unity

```xml
<!-- Si defines una interfaz I{component_name} -->
<register type="Tailored.ICBanking.Interfaces.I{component_name}"
         mapTo="Tailored.ICBanking.BusinessComponents.{component_name}" />
```
