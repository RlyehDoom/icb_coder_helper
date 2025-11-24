## 🔧 Agregar Override de Método en Tailored

{component_header}

### 1. Verificar que el método sea Virtual

Primero, verifica en ICBanking que el método esté marcado como `virtual`:

```csharp
// En Infocorp.Accounts.BusinessComponents.Accounts
public virtual GetAccountsOut GetAccounts(GetAccountsIn input)
{{
    // ...
}}
```

⚠️ **Solo puedes override métodos marcados como `virtual`**

### 2. Crear/Editar Clase Tailored

{file_location}

{code_pattern}

### 3. Patrones Comunes de Override

#### 3.1 Agregar Validación Adicional

```csharp
public override void CreateAccount(CreateAccountIn input)
{{
    // Validación específica de Tailored
    if (input.AccountType == "Premium" && !IsPremiumClient(input.ClientId))
    {{
        throw new ValidationException("Cliente no califica para cuenta Premium");
    }}

    // Ejecutar lógica base de ICBanking
    base.CreateAccount(input);
}}
```

#### 3.2 Modificar Resultado

```csharp
public override GetAccountsOut GetAccounts(GetAccountsIn input)
{{
    // Llamar a ICBanking
    var result = base.GetAccounts(input);

    // Agregar información adicional de Tailored
    foreach (var account in result.Accounts)
    {{
        account.CustomField = GetTailoredData(account.Id);
    }}

    return result;
}}
```

#### 3.3 Auditoría Personalizada

```csharp
public override void UpdateClient(UpdateClientIn input)
{{
    // Auditoría pre-ejecución
    LogTailoredAudit("UpdateClient", input);

    try
    {{
        base.UpdateClient(input);
        LogTailoredAudit("UpdateClient - Success", input);
    }}
    catch (Exception ex)
    {{
        LogTailoredAudit("UpdateClient - Error", ex);
        throw;
    }}
}}
```

### 4. Consideraciones Importantes

- ✅ **NAMING CONVENTION (CRÍTICO):**
  - **Clase extendida:** `<ClaseOriginal>Extended` (ejemplo: `Accounts` → `AccountsExtended`)
  - **Archivo:** `<ArchivoOriginal sin .cs>Extended.cs` (ejemplo: `Accounts.cs` → `AccountsExtended.cs`)
  - Esta convención es **OBLIGATORIA** para todo código que extiende clases base de ICBanking
- ✅ **Siempre considera llamar a `base.Metodo()`** a menos que necesites reemplazar completamente
- ✅ **Mantén la firma del método** (mismo tipo de retorno y parámetros)
- ✅ **Respeta contratos** (excepciones, validaciones esperadas por ICBanking)
- ✅ **Documenta cambios** con comentarios XML
- ⚠️ **Cuidado con breaking changes** que afecten otros componentes
