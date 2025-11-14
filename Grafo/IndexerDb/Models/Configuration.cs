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
