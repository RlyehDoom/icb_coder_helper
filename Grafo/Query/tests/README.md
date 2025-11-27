# Grafo API Tests

API tests using Postman collection.

## Prerequisites

- Node.js 18+
- Newman (Postman CLI): `npm install -g newman`
- Query Service running: `grafo query start`

## Run Tests

```bash
# Using Newman
newman run Grafo_API_v2.1.postman_collection.json

# With environment variables
newman run Grafo_API_v2.1.postman_collection.json \
  --env-var "baseUrl=http://localhost:8081" \
  --env-var "version=6.5.0"

# With detailed output
newman run Grafo_API_v2.1.postman_collection.json -r cli,json
```

## Using Postman GUI

1. Import `Grafo_API_v2.1.postman_collection.json`
2. Set variables:
   - `baseUrl`: http://localhost:8081
   - `version`: 6.5.0 (or your version)
3. Run collection

## Test Structure

| Folder | Description |
|--------|-------------|
| Health & Info | Health check, versions list |
| Node Search | Search by name, type, project |
| Graph Traversal | Callers, callees, implementations, inheritance |
| Statistics | Version statistics |
| Error Cases | Invalid inputs, 404 scenarios |

## Collection Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `baseUrl` | http://localhost:8081 | API base URL |
| `version` | 6.5.0 | Graph version |
| `nodeId` | (auto) | Set by search tests |
| `methodId` | (auto) | Set by method search |
| `classId` | (auto) | Set by class search |
| `interfaceId` | (auto) | Set by interface search |
