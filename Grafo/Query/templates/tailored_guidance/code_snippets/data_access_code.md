```csharp
namespace Tailored.ICBanking.DataAccess
{{{{
    public class {component_name}DataAccess
    {{{{
        private readonly IDataStrategy _dataStrategy;

        public {component_name}DataAccess(IDataStrategy dataStrategy)
        {{{{
            _dataStrategy = dataStrategy;
        }}}}

        public async Task<List<T>> GetData(int id)
        {{{{
            var sql = @"
                SELECT * FROM MiTabla
                WHERE Id = @Id
            ";

            var parameters = new DynamicParameters();
            parameters.Add("@Id", id);

            var result = await _dataStrategy.QueryAsync<T>(sql, parameters);
            return result.ToList();
        }}}}
    }}}}
}}
```
