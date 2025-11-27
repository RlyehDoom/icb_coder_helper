# TLS Certificate Configuration for MongoDB

IndexerDb soporta conexiones TLS/SSL a MongoDB con certificados de cliente automáticos.

## 🔐 Certificado por Defecto

Cuando `tls=true` está en la connection string, **IndexerDb usa automáticamente el certificado por defecto**:

```
📂 Grafo/Certs/prod/client.pem
```

**Ventaja:** No necesitas configurar nada adicional. Solo especifica `tls=true` en la connection string y el certificado se cargará automáticamente.

## 🚀 Quick Start con TLS

### 1. Colocar el Certificado

Asegúrate de que el certificado esté en la ubicación correcta:

```bash
# Estructura del proyecto
Grafo/
├── Certs/
│   └── prod/
│       └── client.pem          # ← Certificado TLS por defecto
├── IndexerDb/
│   ├── .env
│   └── Program.cs
```

### 2. Configurar Connection String

En tu archivo `.env`:

```bash
# Connection string con TLS habilitado
MongoDB__ConnectionString=mongodb://username:password@host:port/database?authSource=admin&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true
```

**Eso es todo.** El certificado en `../Certs/prod/client.pem` se cargará automáticamente.

### 3. Verificar

Al ejecutar, verás el mensaje:

```
🔒 TLS enabled with client certificate (default): ../Certs/prod/client.pem
✅ Connected to MongoDB: GraphDB/projects
```

## 📋 Configuración Avanzada

### Usar un Certificado Personalizado

Si necesitas usar un certificado diferente, configura explícitamente:

**.env**
```bash
MongoDB__ConnectionString=mongodb://user:pass@host:port/db?authSource=admin&tls=true
MongoDB__TlsCertificateFile=/path/to/custom/certificate.pem
```

Verás:
```
🔒 TLS enabled with client certificate (custom): /path/to/custom/certificate.pem
```

### Sin Certificado de Cliente

Si tu MongoDB no requiere certificado de cliente, solo validación TLS del servidor:

**.env**
```bash
MongoDB__ConnectionString=mongodb://user:pass@host:port/db?authSource=admin&tls=true
MongoDB__TlsInsecure=true
```

Verás:
```
🔒 TLS enabled with certificate validation disabled (no client cert)
```

## 🔍 Detección Automática de TLS

IndexerDb detecta automáticamente si TLS está habilitado verificando estos parámetros en la connection string:

- `tls=true`
- `ssl=true`

Si alguno está presente, se aplicará la configuración TLS automáticamente.

## 📝 Ejemplo Completo

### Escenario: MongoDB en Producción con TLS

**Setup:**
```bash
# 1. Certificado en ubicación por defecto
ls ../Certs/prod/client.pem
# ../Certs/prod/client.pem

# 2. Configurar .env
cat > .env << 'EOF'
MongoDB__ConnectionString=mongodb://user:pass@207.244.249.22:28101/GraphDB?authSource=admin&tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true
MongoDB__DatabaseName=GraphDB
EOF

# 3. Ejecutar
dotnet run --all
```

**Output esperado:**
```
✓ Loaded configuration from .env file
🔒 TLS enabled with client certificate (default): ../Certs/prod/client.pem
✅ Connected to MongoDB: GraphDB/projects
📊 Database Status: 90 total projects
```

## 🛡️ Opciones de Seguridad TLS

### tlsAllowInvalidCertificates

**Uso:** Acepta certificados autofirmados o expirados del servidor

```bash
MongoDB__ConnectionString=...&tls=true&tlsAllowInvalidCertificates=true
```

**Cuándo usar:**
- ✅ Servidores con certificados autofirmados
- ✅ Entornos de desarrollo/staging
- ⚠️ NO recomendado para producción con certificados válidos

### tlsAllowInvalidHostnames

**Uso:** Desactiva validación de hostname en el certificado del servidor

```bash
MongoDB__ConnectionString=...&tls=true&tlsAllowInvalidHostnames=true
```

**Cuándo usar:**
- ✅ IP directa en lugar de hostname (e.g., `207.244.249.22` vs `mongodb.example.com`)
- ✅ Hostname no coincide con el certificado
- ⚠️ Reduce la seguridad, usar solo cuando sea necesario

## 🔧 Formato del Certificado

**Formato requerido:** PEM (Privacy Enhanced Mail)

El archivo `.pem` debe contener:
- Certificado de cliente
- Clave privada (private key)

**Ejemplo de contenido:**
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKl...
-----END CERTIFICATE-----
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0...
-----END PRIVATE KEY-----
```

### Convertir otros formatos a PEM

**De .pfx/.p12 a .pem:**
```bash
# Extraer certificado y clave privada
openssl pkcs12 -in certificate.pfx -out client.pem -nodes
```

**De .crt + .key a .pem:**
```bash
# Combinar certificado y clave
cat certificate.crt private.key > client.pem
```

## 🐛 Troubleshooting

### Certificado no encontrado

**Error:**
```
⚠️ TLS certificate file not found: ../Certs/prod/client.pem
🔒 TLS enabled with certificate validation disabled (no client cert)
```

**Solución:**
```bash
# Verificar ubicación del certificado
ls ../Certs/prod/client.pem

# Crear directorio si no existe
mkdir -p ../Certs/prod

# Copiar certificado
cp /path/to/certificate.pem ../Certs/prod/client.pem
```

### Error de carga de certificado

**Error:**
```
⚠️ Could not load client certificate from ../Certs/prod/client.pem, proceeding without it
```

**Posibles causas:**
1. **Formato incorrecto:** El archivo no es PEM válido
2. **Permisos:** No tienes permisos de lectura
3. **Corrupto:** El archivo está dañado

**Verificar formato:**
```bash
# Ver contenido
cat ../Certs/prod/client.pem

# Debe empezar con:
-----BEGIN CERTIFICATE-----
# y contener:
-----BEGIN PRIVATE KEY-----
```

### Conexión TLS falla

**Error:**
```
❌ Failed to connect to MongoDB: Authentication failed
```

**Verificar:**
1. **Credenciales correctas** en connection string
2. **Puerto correcto** (28101 en tu caso)
3. **MongoDB acepta certificado de cliente** (si es requerido)
4. **Firewall** permite conexión al puerto

**Test de conexión:**
```bash
# Probar con mongosh
mongosh "mongodb://user:pass@host:28101/database?authSource=admin&tls=true&tlsAllowInvalidCertificates=true"
```

## 📦 Variables de Entorno

Todas las opciones TLS se pueden configurar en `.env`:

```bash
# Connection string con TLS
MongoDB__ConnectionString=mongodb://user:pass@host:port/db?tls=true

# Certificado personalizado (opcional, usa default si está vacío)
MongoDB__TlsCertificateFile=../Certs/prod/client.pem

# Desactivar validación (solo para dev/staging)
MongoDB__TlsInsecure=true
```

## 🎯 Resumen

### Para Producción (Recomendado)
```bash
# 1. Certificado en ubicación por defecto
../Certs/prod/client.pem

# 2. Connection string con TLS
MongoDB__ConnectionString=...?tls=true&tlsAllowInvalidCertificates=true&tlsAllowInvalidHostnames=true

# 3. NO configurar TlsCertificateFile (usará default automáticamente)
```

### Para Custom Certificate
```bash
# 1. Especificar path explícito
MongoDB__TlsCertificateFile=/path/to/custom.pem

# 2. Connection string con TLS
MongoDB__ConnectionString=...?tls=true
```

### Para Desarrollo Local (Sin TLS)
```bash
# Sin tls=true en la connection string
MongoDB__ConnectionString=mongodb://localhost:27019/
```

## 📚 Referencias

- MongoDB TLS/SSL Configuration: https://www.mongodb.com/docs/manual/tutorial/configure-ssl/
- MongoDB Connection String Options: https://www.mongodb.com/docs/manual/reference/connection-string/#tls-options
- .NET X509Certificate2 Documentation: https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.x509certificates.x509certificate2
