```csharp
namespace Tailored.ICBanking.ServiceAgents
{{
    public class {component_name}ServiceAgent
    {{
        private readonly IRestAdapter _adapter;

        public {component_name}ServiceAgent(IRestAdapter adapter)
        {{
            _adapter = adapter;
        }}

        public async Task<TResponse> CallExternalService<TRequest, TResponse>(
            TRequest request)
        {{
            var url = "https://api.external.com/endpoint";
            var response = await _adapter.PostAsync<TRequest, TResponse>(
                url, request);
            return response;
        }}
    }}
}}
```
