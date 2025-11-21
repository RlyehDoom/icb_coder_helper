namespace IndexerDb.Models
{
    public class MongoDbSettings
    {
        public string ConnectionString { get; set; } = string.Empty;
        public string DatabaseName { get; set; } = string.Empty;
        public string CollectionName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string AuthDatabase { get; set; } = "admin";
        public bool EnableAuth { get; set; } = false;

        // TLS Certificate for production MongoDB connections
        // Default: ../Certs/prod/client.pem (relative to IndexerDb directory)
        public string TlsCertificateFile { get; set; } = string.Empty;
        public bool TlsInsecure { get; set; } = false;

        /// <summary>
        /// Gets the TLS certificate file path to use.
        /// If TlsCertificateFile is not set and TLS is enabled in the connection string,
        /// returns the default certificate path: ../Certs/prod/client.pem
        /// </summary>
        public string GetTlsCertificatePath()
        {
            // If explicitly set, use that
            if (!string.IsNullOrEmpty(TlsCertificateFile))
                return TlsCertificateFile;

            // Check if TLS is enabled in connection string
            bool tlsEnabled = ConnectionString.Contains("tls=true", StringComparison.OrdinalIgnoreCase) ||
                             ConnectionString.Contains("ssl=true", StringComparison.OrdinalIgnoreCase);

            // Return default path if TLS is enabled
            if (tlsEnabled)
                return "../Certs/prod/client.pem";

            return string.Empty;
        }

        public string GetAuthenticatedConnectionString()
        {
            if (!EnableAuth || string.IsNullOrEmpty(Username))
                return ConnectionString;

            var uri = new Uri(ConnectionString);
            var userInfo = string.IsNullOrEmpty(Password) 
                ? Username 
                : $"{Username}:{Password}";
            
            var authenticatedUri = $"mongodb://{userInfo}@{uri.Host}:{uri.Port}/{AuthDatabase}";
            return authenticatedUri;
        }
    }

    public class ApplicationSettings
    {
        public bool EnableMongoDB { get; set; } = true;
        public bool MockDataMode { get; set; } = false;
    }

    public class InputSettings
    {
        public string InputDirectory { get; set; } = string.Empty;
        public string GraphFilePattern { get; set; } = string.Empty;
        public string GraphFileExtension { get; set; } = string.Empty;
    }
}
