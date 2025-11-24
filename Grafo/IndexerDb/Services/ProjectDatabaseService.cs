using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Bson.Serialization;
using MongoDB.Driver;

namespace IndexerDb.Services
{
    public class SaveProjectResult
    {
        public bool Success { get; set; }
        public bool IsFragmented { get; set; }
        public int FragmentCount { get; set; }
        public string? ErrorMessage { get; set; }
    }

    public class ProjectDatabaseService : IProjectDatabaseService
    {
        private readonly IMongoCollection<ProjectInfo> _projectsCollection;
        private readonly IMongoCollection<ProcessingState> _processingStateCollection;
        private readonly IMongoCollection<ProjectFragment> _fragmentsCollection;
        private readonly ILogger<ProjectDatabaseService> _logger;

        // MongoDB max document size is 16MB, we use 15MB as threshold to have safety margin
        private const int MaxDocumentSizeBytes = 15 * 1024 * 1024; // 15MB

        // Target size for each fragment when splitting large projects (~10MB)
        private const int TargetFragmentSizeBytes = 10 * 1024 * 1024; // 10MB

        public ProjectDatabaseService(ILogger<ProjectDatabaseService> logger, IOptions<MongoDbSettings> mongoSettings)
        {
            _logger = logger;

            var settings = mongoSettings.Value;

            try
            {
                // Parse connection string and create MongoClientSettings
                var mongoUrl = new MongoUrl(settings.ConnectionString);
                var clientSettings = MongoClientSettings.FromUrl(mongoUrl);

                // Get certificate path (uses default if not explicitly configured)
                var certPath = settings.GetTlsCertificatePath();

                // Configure TLS/SSL settings
                if (settings.TlsInsecure || !string.IsNullOrEmpty(certPath))
                {
                    var sslSettings = new SslSettings
                    {
                        CheckCertificateRevocation = false,
                        ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) =>
                        {
                            // Accept all server certificates when TlsInsecure is enabled
                            return true;
                        }
                    };

                    // Load client certificate if available
                    if (!string.IsNullOrEmpty(certPath))
                    {
                        if (System.IO.File.Exists(certPath))
                        {
                            try
                            {
                                // Read PEM file content
                                var pemContent = System.IO.File.ReadAllText(certPath);

                                // Convert PEM to X509Certificate2 with persisted key storage
                                // Windows requires non-ephemeral keys for TLS client authentication
                                var certWithEphemeralKey = System.Security.Cryptography.X509Certificates.X509Certificate2
                                    .CreateFromPem(pemContent, pemContent);

                                // Export and re-import with Exportable flag to avoid ephemeral key issues on Windows
                                var certBytes = certWithEphemeralKey.Export(System.Security.Cryptography.X509Certificates.X509ContentType.Pkcs12);
                                var cert = new System.Security.Cryptography.X509Certificates.X509Certificate2(
                                    certBytes,
                                    (string?)null,
                                    System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.Exportable |
                                    System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.PersistKeySet);

                                sslSettings.ClientCertificates = new[] { cert };

                                // Indicate if default or custom cert was used
                                var certSource = string.IsNullOrEmpty(settings.TlsCertificateFile) ? "default" : "custom";
                                _logger.LogInformation("🔒 TLS enabled with client certificate ({Source}): {CertFile}",
                                    certSource, certPath);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "⚠️ Could not load client certificate from {CertPath}, proceeding without it", certPath);
                            }
                        }
                        else
                        {
                            _logger.LogWarning("⚠️ TLS certificate file not found: {CertPath}", certPath);
                            _logger.LogInformation("🔒 TLS enabled with certificate validation disabled (no client cert)");
                        }
                    }
                    else if (settings.TlsInsecure)
                    {
                        _logger.LogInformation("🔒 TLS enabled with certificate validation disabled (no client cert)");
                    }

                    clientSettings.SslSettings = sslSettings;
                }

                var client = new MongoClient(clientSettings);
                var database = client.GetDatabase(settings.DatabaseName);

                _projectsCollection = database.GetCollection<ProjectInfo>("projects");
                _processingStateCollection = database.GetCollection<ProcessingState>("processing_states");
                _fragmentsCollection = database.GetCollection<ProjectFragment>("project_fragments");

                // Create indexes for efficient fragment queries
                var fragmentIndexKeys = Builders<ProjectFragment>.IndexKeys
                    .Ascending(f => f.ParentProjectId)
                    .Ascending(f => f.ChunkIndex);
                var fragmentIndexModel = new CreateIndexModel<ProjectFragment>(fragmentIndexKeys);
                _fragmentsCollection.Indexes.CreateOneAsync(fragmentIndexModel);

                // Test connection
                _ = database.RunCommand<MongoDB.Bson.BsonDocument>(new MongoDB.Bson.BsonDocument("ping", 1));

                _logger.LogInformation("✅ Connected to MongoDB: {Database} (collections: projects, processing_states, project_fragments)", settings.DatabaseName);

                if (settings.EnableAuth && !string.IsNullOrEmpty(settings.Username))
                {
                    _logger.LogInformation("🔐 Using authenticated connection with user: {Username}", settings.Username);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Failed to connect to MongoDB");
                throw new InvalidOperationException($"Failed to connect to MongoDB: {ex.Message}", ex);
            }
        }

        public async Task<bool> SaveProjectInfoAsync(ProjectInfo project)
        {
            var result = await SaveProjectInfoDetailedAsync(project);
            return result.Success;
        }

        public async Task<SaveProjectResult> SaveProjectInfoDetailedAsync(ProjectInfo project)
        {
            var result = new SaveProjectResult { Success = false, IsFragmented = false, FragmentCount = 0 };

            try
            {
                // Estimate document size before attempting to save
                var estimatedSize = EstimateDocumentSize(project);
                var sizeMB = estimatedSize / (1024.0 * 1024.0);

                if (estimatedSize > MaxDocumentSizeBytes)
                {
                    _logger.LogWarning("⚠️  Project '{ProjectName}' is too large ({Size:F2}MB > 15MB limit) with {NodeCount} nodes and {EdgeCount} edges",
                        project.ProjectName, sizeMB, project.NodeCount, project.EdgeCount);
                    _logger.LogInformation("📦 Fragmenting project into multiple chunks...");

                    // Fragment the project
                    var fragments = await CreateProjectFragmentsAsync(project);
                    result.FragmentCount = fragments.Count;

                    // Delete old fragments if project already exists
                    await DeleteProjectFragmentsAsync(project.ProjectId);

                    // Save all fragments
                    await _fragmentsCollection.InsertManyAsync(fragments);
                    _logger.LogInformation("✅ Saved {Count} fragments for project '{ProjectName}'", fragments.Count, project.ProjectName);

                    // Create metadata document with fragment references
                    var metadata = new ProjectInfo
                    {
                        MongoId = project.MongoId,
                        ProjectId = project.ProjectId,
                        ProjectName = project.ProjectName,
                        Layer = project.Layer,
                        NodeCount = project.NodeCount,
                        EdgeCount = project.EdgeCount,
                        ContentHash = project.ContentHash,
                        LastProcessed = project.LastProcessed,
                        LastModified = project.LastModified,
                        SourceFile = project.SourceFile,
                        SourceDirectory = project.SourceDirectory,
                        ProcessingStateId = project.ProcessingStateId,
                        IsFragmented = true,
                        FragmentCount = fragments.Count,
                        FragmentIds = fragments.Select(f => f.FragmentId).ToList(),
                        // Nodes and Edges are empty in main document (stored in fragments)
                        Nodes = new List<GraphNode>(),
                        Edges = new List<GraphEdge>()
                    };

                    project = metadata;
                    result.IsFragmented = true;
                }
                else
                {
                    _logger.LogDebug("Document size for '{ProjectName}': {Size:F2}MB (within limits)", project.ProjectName, sizeMB);

                    // Ensure fragmentation flags are false for normal projects
                    project.IsFragmented = false;
                    project.FragmentCount = null;
                    project.FragmentIds = null;
                }

                // Check if project already exists
                var existingFilter = Builders<ProjectInfo>.Filter.Eq(x => x.ProjectId, project.ProjectId);
                var existingProject = await _projectsCollection.Find(existingFilter).FirstOrDefaultAsync();

                if (existingProject != null)
                {
                    // Update existing project
                    project.MongoId = existingProject.MongoId;
                    await _projectsCollection.ReplaceOneAsync(existingFilter, project);
                    _logger.LogDebug("Updated project: {ProjectName}", project.ProjectName);
                }
                else
                {
                    // Insert new project
                    await _projectsCollection.InsertOneAsync(project);
                    _logger.LogDebug("Inserted new project: {ProjectName}", project.ProjectName);
                }

                result.Success = true;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving project: {ProjectName}", project.ProjectName);
                result.ErrorMessage = ex.Message;
                return result;
            }
        }

        public async Task<bool> SaveProjectsAsync(IEnumerable<ProjectInfo> projects)
        {
            try
            {
                var successCount = 0;
                foreach (var project in projects)
                {
                    if (await SaveProjectInfoAsync(project))
                    {
                        successCount++;
                    }
                }

                _logger.LogInformation("Successfully saved {SuccessCount} out of {TotalCount} projects", 
                    successCount, projects.Count());

                return successCount == projects.Count();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving multiple projects");
                return false;
            }
        }

        public async Task<ProjectInfo?> GetProjectByIdAsync(string projectId)
        {
            try
            {
                var filter = Builders<ProjectInfo>.Filter.Eq(x => x.ProjectId, projectId);
                var project = await _projectsCollection.Find(filter).FirstOrDefaultAsync();

                if (project == null)
                    return null;

                // If project is fragmented, assemble it from fragments
                if (project.IsFragmented)
                {
                    project = await AssembleFragmentedProjectAsync(project);
                }

                return project;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving project by ID: {ProjectId}", projectId);
                return null;
            }
        }

        public async Task<IEnumerable<ProjectInfo>> GetProjectsBySourceFileAsync(string sourceFile)
        {
            try
            {
                var filter = Builders<ProjectInfo>.Filter.Eq(x => x.SourceFile, sourceFile);
                var projects = await _projectsCollection.Find(filter).ToListAsync();
                
                _logger.LogInformation("Found {Count} projects for source file: {SourceFile}", 
                    projects.Count, sourceFile);

                return projects;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving projects by source file: {SourceFile}", sourceFile);
                return Enumerable.Empty<ProjectInfo>();
            }
        }

        public async Task<IEnumerable<ProjectInfo>> GetAllProjectsAsync()
        {
            try
            {
                var projects = await _projectsCollection.Find(_ => true).ToListAsync();
                _logger.LogInformation("Retrieved {Count} projects", projects.Count);
                return projects;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all projects");
                return Enumerable.Empty<ProjectInfo>();
            }
        }

        public async Task<ProcessingState?> GetProcessingStateAsync(string sourceFile, string? version = null)
        {
            try
            {
                // Build filter: SourceFile + Version (if specified)
                // This allows multiple versions of the same file to coexist
                FilterDefinition<ProcessingState> filter;

                if (!string.IsNullOrEmpty(version))
                {
                    // Filter by both SourceFile AND Version
                    var sourceFileFilter = Builders<ProcessingState>.Filter.Eq(x => x.SourceFile, sourceFile);
                    var versionFilter = Builders<ProcessingState>.Filter.Eq(x => x.Version, version);
                    filter = Builders<ProcessingState>.Filter.And(sourceFileFilter, versionFilter);

                    _logger.LogDebug("Retrieving processing state for: {SourceFile} (version: {Version})", sourceFile, version);
                }
                else
                {
                    // Filter by SourceFile only (backward compatibility)
                    filter = Builders<ProcessingState>.Filter.Eq(x => x.SourceFile, sourceFile);
                    _logger.LogDebug("Retrieving processing state for: {SourceFile} (no version specified)", sourceFile);
                }

                return await _processingStateCollection.Find(filter).FirstOrDefaultAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving processing state for: {SourceFile}", sourceFile);
                return null;
            }
        }

        public async Task<bool> SaveProcessingStateAsync(ProcessingState state)
        {
            try
            {
                // Build filter: SourceFile + Version (if specified)
                // This allows multiple versions of the same file to coexist
                FilterDefinition<ProcessingState> filter;

                if (!string.IsNullOrEmpty(state.Version))
                {
                    // Filter by both SourceFile AND Version
                    var sourceFileFilter = Builders<ProcessingState>.Filter.Eq(x => x.SourceFile, state.SourceFile);
                    var versionFilter = Builders<ProcessingState>.Filter.Eq(x => x.Version, state.Version);
                    filter = Builders<ProcessingState>.Filter.And(sourceFileFilter, versionFilter);

                    _logger.LogDebug("Saving processing state for: {SourceFile} (version: {Version})", state.SourceFile, state.Version);
                }
                else
                {
                    // Filter by SourceFile only (backward compatibility)
                    filter = Builders<ProcessingState>.Filter.Eq(x => x.SourceFile, state.SourceFile);
                    _logger.LogDebug("Saving processing state for: {SourceFile} (no version specified)", state.SourceFile);
                }

                var existingState = await _processingStateCollection.Find(filter).FirstOrDefaultAsync();

                if (existingState != null)
                {
                    state.MongoId = existingState.MongoId;
                    await _processingStateCollection.ReplaceOneAsync(filter, state);

                    if (!string.IsNullOrEmpty(state.Version))
                        _logger.LogDebug("Updated processing state for: {SourceFile} (version: {Version})", state.SourceFile, state.Version);
                    else
                        _logger.LogDebug("Updated processing state for: {SourceFile}", state.SourceFile);
                }
                else
                {
                    await _processingStateCollection.InsertOneAsync(state);

                    if (!string.IsNullOrEmpty(state.Version))
                        _logger.LogDebug("Created new processing state for: {SourceFile} (version: {Version})", state.SourceFile, state.Version);
                    else
                        _logger.LogDebug("Created new processing state for: {SourceFile}", state.SourceFile);
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving processing state for: {SourceFile}", state.SourceFile);
                return false;
            }
        }

        public async Task<IEnumerable<ProjectInfo>> SearchProjectsByNameAsync(string name)
        {
            try
            {
                var filter = Builders<ProjectInfo>.Filter.Regex(x => x.ProjectName, 
                    new MongoDB.Bson.BsonRegularExpression(name, "i"));
                
                var projects = await _projectsCollection.Find(filter).ToListAsync();
                
                _logger.LogInformation("Found {Count} projects matching name: {Name}", projects.Count, name);
                return projects;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching projects by name: {Name}", name);
                return Enumerable.Empty<ProjectInfo>();
            }
        }

        public async Task<IEnumerable<GraphNode>> SearchNodesByProjectAsync(string projectId)
        {
            try
            {
                var project = await GetProjectByIdAsync(projectId);
                if (project != null)
                {
                    _logger.LogInformation("Found {Count} nodes for project: {ProjectId}", 
                        project.Nodes.Count, projectId);
                    return project.Nodes;
                }

                return Enumerable.Empty<GraphNode>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting nodes for project: {ProjectId}", projectId);
                return Enumerable.Empty<GraphNode>();
            }
        }

        public async Task<IEnumerable<GraphEdge>> GetEdgesByProjectAsync(string projectId)
        {
            try
            {
                var project = await GetProjectByIdAsync(projectId);
                if (project != null)
                {
                    _logger.LogInformation("Found {Count} edges for project: {ProjectId}", 
                        project.Edges.Count, projectId);
                    return project.Edges;
                }

                return Enumerable.Empty<GraphEdge>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting edges for project: {ProjectId}", projectId);
                return Enumerable.Empty<GraphEdge>();
            }
        }

        public async Task<bool> DeleteProjectsBySourceFileAsync(string sourceFile)
        {
            try
            {
                var filter = Builders<ProjectInfo>.Filter.Eq(x => x.SourceFile, sourceFile);
                var result = await _projectsCollection.DeleteManyAsync(filter);
                
                _logger.LogInformation("Deleted {Count} projects for source file: {SourceFile}", 
                    result.DeletedCount, sourceFile);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting projects for source file: {SourceFile}", sourceFile);
                return false;
            }
        }

        public async Task<long> GetTotalProjectCountAsync()
        {
            try
            {
                var count = await _projectsCollection.CountDocumentsAsync(_ => true);
                return count;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting total project count");
                return 0;
            }
        }

        public async Task<Dictionary<string, int>> GetProjectCountsByLayerAsync()
        {
            try
            {
                var pipeline = new[]
                {
                    new MongoDB.Bson.BsonDocument("$group", new MongoDB.Bson.BsonDocument
                    {
                        { "_id", "$Layer" },
                        { "count", new MongoDB.Bson.BsonDocument("$sum", 1) }
                    })
                };

                var result = await _projectsCollection.Aggregate<MongoDB.Bson.BsonDocument>(pipeline).ToListAsync();

                var counts = result.ToDictionary(
                    doc => doc["_id"].AsString,
                    doc => doc["count"].AsInt32
                );

                return counts;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting project counts by layer");
                return new Dictionary<string, int>();
            }
        }

        /// <summary>
        /// Estimates the BSON document size for a ProjectInfo object.
        /// Returns the approximate size in bytes.
        /// </summary>
        private long EstimateDocumentSize(ProjectInfo project)
        {
            try
            {
                // Serialize to JSON first (as a proxy for BSON size)
                // BSON is typically slightly larger than JSON due to type information
                var json = Newtonsoft.Json.JsonConvert.SerializeObject(project);
                var jsonSizeBytes = System.Text.Encoding.UTF8.GetByteCount(json);

                // BSON is typically 10-20% larger than JSON, so multiply by 1.2 for safety
                return (long)(jsonSizeBytes * 1.2);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not estimate document size for project: {ProjectName}, using approximate calculation", project.ProjectName);

                // Fallback: rough estimate based on node and edge counts
                // Average node: ~500 bytes, average edge: ~200 bytes
                const int avgNodeSize = 500;
                const int avgEdgeSize = 200;
                const int metadataOverhead = 10000; // Base metadata

                return metadataOverhead + (project.Nodes.Count * avgNodeSize) + (project.Edges.Count * avgEdgeSize);
            }
        }

        /// <summary>
        /// Creates fragments (chunks) for a large project.
        /// Each fragment targets ~10MB to stay well under the 16MB limit.
        /// </summary>
        private async Task<List<ProjectFragment>> CreateProjectFragmentsAsync(ProjectInfo project)
        {
            return await Task.Run(() =>
            {
                var fragments = new List<ProjectFragment>();
                var allNodes = project.Nodes;
                var allEdges = project.Edges;

                // Calculate how many items per fragment based on target size
                var estimatedTotalSize = EstimateDocumentSize(project);
                var estimatedFragmentCount = Math.Max(1, (int)Math.Ceiling((double)estimatedTotalSize / TargetFragmentSizeBytes));

                var nodesPerFragment = (int)Math.Ceiling((double)allNodes.Count / estimatedFragmentCount);
                var edgesPerFragment = (int)Math.Ceiling((double)allEdges.Count / estimatedFragmentCount);

                _logger.LogDebug("Splitting project into ~{Count} fragments ({NodesPerFragment} nodes, {EdgesPerFragment} edges each)",
                    estimatedFragmentCount, nodesPerFragment, edgesPerFragment);

                var chunkIndex = 0;
                for (int nodeOffset = 0; nodeOffset < allNodes.Count; nodeOffset += nodesPerFragment)
                {
                    var nodeChunk = allNodes.Skip(nodeOffset).Take(nodesPerFragment).ToList();
                    var edgeOffset = chunkIndex * edgesPerFragment;
                    var edgeChunk = edgeOffset < allEdges.Count
                        ? allEdges.Skip(edgeOffset).Take(edgesPerFragment).ToList()
                        : new List<GraphEdge>();

                    var fragment = new ProjectFragment
                    {
                        FragmentId = $"{project.ProjectId}:chunk:{chunkIndex}",
                        ParentProjectId = project.ProjectId,
                        ChunkIndex = chunkIndex,
                        TotalChunks = estimatedFragmentCount,
                        Nodes = nodeChunk,
                        Edges = edgeChunk,
                        CreatedAt = DateTime.UtcNow,
                        EstimatedSizeBytes = EstimateFragmentSize(nodeChunk, edgeChunk)
                    };

                    fragments.Add(fragment);
                    chunkIndex++;
                }

                // Update total chunks in all fragments
                foreach (var fragment in fragments)
                {
                    fragment.TotalChunks = fragments.Count;
                }

                _logger.LogInformation("Created {Count} fragments (avg {AvgNodes} nodes, {AvgEdges} edges per fragment)",
                    fragments.Count,
                    fragments.Average(f => f.Nodes.Count),
                    fragments.Average(f => f.Edges.Count));

                return fragments;
            });
        }

        /// <summary>
        /// Estimates the size of a fragment
        /// </summary>
        private long EstimateFragmentSize(List<GraphNode> nodes, List<GraphEdge> edges)
        {
            const int avgNodeSize = 500;
            const int avgEdgeSize = 200;
            const int fragmentOverhead = 5000;

            return fragmentOverhead + (nodes.Count * avgNodeSize) + (edges.Count * avgEdgeSize);
        }

        /// <summary>
        /// Deletes all fragments associated with a project
        /// </summary>
        private async Task DeleteProjectFragmentsAsync(string projectId)
        {
            var filter = Builders<ProjectFragment>.Filter.Eq(f => f.ParentProjectId, projectId);
            var result = await _fragmentsCollection.DeleteManyAsync(filter);

            if (result.DeletedCount > 0)
            {
                _logger.LogDebug("Deleted {Count} old fragments for project: {ProjectId}", result.DeletedCount, projectId);
            }
        }

        /// <summary>
        /// Assembles a complete ProjectInfo from its fragments
        /// </summary>
        private async Task<ProjectInfo> AssembleFragmentedProjectAsync(ProjectInfo metadata)
        {
            if (!metadata.IsFragmented || metadata.FragmentIds == null || !metadata.FragmentIds.Any())
            {
                _logger.LogWarning("Project {ProjectId} is marked as fragmented but has no fragment IDs", metadata.ProjectId);
                return metadata;
            }

            // Fetch all fragments
            var filter = Builders<ProjectFragment>.Filter.In(f => f.FragmentId, metadata.FragmentIds);
            var fragments = await _fragmentsCollection.Find(filter).ToListAsync();

            if (fragments.Count != metadata.FragmentCount)
            {
                _logger.LogWarning("Expected {Expected} fragments for project {ProjectId}, but found {Actual}",
                    metadata.FragmentCount, metadata.ProjectId, fragments.Count);
            }

            // Sort by chunk index and combine
            var sortedFragments = fragments.OrderBy(f => f.ChunkIndex).ToList();

            var allNodes = new List<GraphNode>();
            var allEdges = new List<GraphEdge>();

            foreach (var fragment in sortedFragments)
            {
                allNodes.AddRange(fragment.Nodes);
                allEdges.AddRange(fragment.Edges);
            }

            // Populate the metadata with complete data
            metadata.Nodes = allNodes;
            metadata.Edges = allEdges;

            _logger.LogDebug("Assembled project {ProjectName} from {Count} fragments ({Nodes} nodes, {Edges} edges)",
                metadata.ProjectName, fragments.Count, allNodes.Count, allEdges.Count);

            return metadata;
        }
    }
}
