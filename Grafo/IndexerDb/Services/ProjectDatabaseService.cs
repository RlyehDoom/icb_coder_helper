using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace IndexerDb.Services
{
    public class ProjectDatabaseService : IProjectDatabaseService
    {
        private readonly IMongoCollection<ProjectInfo> _projectsCollection;
        private readonly IMongoCollection<ProcessingState> _processingStateCollection;
        private readonly ILogger<ProjectDatabaseService> _logger;

        public ProjectDatabaseService(ILogger<ProjectDatabaseService> logger, IOptions<MongoDbSettings> mongoSettings)
        {
            _logger = logger;

            var settings = mongoSettings.Value;
            
            try
            {
                var client = new MongoClient(settings.ConnectionString);
                var database = client.GetDatabase(settings.DatabaseName);
                
                _projectsCollection = database.GetCollection<ProjectInfo>("projects");
                _processingStateCollection = database.GetCollection<ProcessingState>("processing_states");

                // Test connection
                _ = database.RunCommand<MongoDB.Bson.BsonDocument>(new MongoDB.Bson.BsonDocument("ping", 1));
                
                _logger.LogInformation("✅ Connected to MongoDB: {Database}/projects", settings.DatabaseName);
                
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
            try
            {
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

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving project: {ProjectName}", project.ProjectName);
                return false;
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
                return await _projectsCollection.Find(filter).FirstOrDefaultAsync();
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

        public async Task<ProcessingState?> GetProcessingStateAsync(string sourceFile)
        {
            try
            {
                var filter = Builders<ProcessingState>.Filter.Eq(x => x.SourceFile, sourceFile);
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
                var filter = Builders<ProcessingState>.Filter.Eq(x => x.SourceFile, state.SourceFile);
                var existingState = await _processingStateCollection.Find(filter).FirstOrDefaultAsync();

                if (existingState != null)
                {
                    state.MongoId = existingState.MongoId;
                    await _processingStateCollection.ReplaceOneAsync(filter, state);
                    _logger.LogDebug("Updated processing state for: {SourceFile}", state.SourceFile);
                }
                else
                {
                    await _processingStateCollection.InsertOneAsync(state);
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
    }
}
