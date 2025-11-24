```csharp
namespace Tailored.ICBanking.BusinessComponents
{
    public class MiComponente : Infocorp.MiComponente.BusinessComponents.MiComponente
    {
        public override TipoRetorno Metodo(ParametrosIn input)
        {
            var result = base.Metodo(input);
            // Personalización Tailored
            return result;
        }
    }
}
```
