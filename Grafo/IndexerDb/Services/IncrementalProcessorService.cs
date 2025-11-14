using IndexerDb.Models;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Security.Cryptography;
using System.Text;

namespace IndexerDb.Services
{
    public class IncrementalProcessorService : IIncrementalProcessorService
    {
        private readonly ILogger<IncrementalProcessorService> _logger;
        private readonly IFileProcessorService _fileProcessor;
        private readonly IGraphDatabaseService _databaseService;
        private readonly IProjectDatabaseService _projectDatabaseService;

        public IncrementalProcessorService(
            ILogger<IncrementalProcessorService> logger,
            IFileProcessorService fileProcessor,
            IGraphDatabaseService databaseService,
            IProjectDatabaseService projectDatabaseService)
        {
            _logger = logger;
            _fileProcessor = fileProcessor;
            _databaseService = databaseService;
            _projectDatabaseService = projectDatabaseService;
        }

        public async Task<ProcessingState> ProcessGraphFileIncrementallyAsync(string filePath)
        {
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var fileName = Path.GetFileName(filePath);
            
            _logger.LogInformation("=== Starting Incremental Processing ===");
            _logger.LogInformation("File: {FileName}", fileName);
            _logger.LogInformation("Path: {FilePath}", filePath);

            var processingState = new ProcessingState
            {
                SourceFile = fileName,
                SourceDirectory = Path.GetDirectoryName(filePath) ?? string.Empty,
                FileLastModified = File.GetLastWriteTime(filePath),
                FileSize = new FileInfo(filePath).Length
            };

            try
            {
                // Step 1: Calculate file hash for change detection
                _logger.LogInformation("📋 Step 1/6: Calculating file hash...");
                processingState.FileHash = await CalculateFileHashAsync(filePath);
                _logger.LogInformation("✅ File hash: {Hash}", processingState.FileHash[..12] + "...");

                // Step 2: Check if file has changed
                _logger.LogInformation("📋 Step 2/6: Checking for previous processing state...");
                var previousState = await GetProcessingStateAsync(fileName);
                var hasFileChanged = previousState == null || previousState.FileHash != processingState.FileHash;
                
                if (!hasFileChanged)
                {
                    _logger.LogInformation("⏩ File unchanged since last processing. Skipping steps 3-6...");
                    _logger.LogInformation("📋 Step 3/6: Skipping JSON parsing (file unchanged)");
                    _logger.LogInformation("📋 Step 4/6: Skipping project extraction (file unchanged)");
                    _logger.LogInformation("📋 Step 5/6: Skipping project processing (file unchanged)");
                    _logger.LogInformation("📋 Step 6/6: Skipping state save (file unchanged)");
                    
                    processingState.SkippedProjects = previousState?.TotalProjects ?? 0;
                    processingState.TotalProjects = previousState?.TotalProjects ?? 0;
                    
                    stopwatch.Stop();
                    _logger.LogInformation("⏩ No Changes Detected in {ElapsedTime:mm\\:ss\\.fff} | Projects in DB: {Total}, Skipped: {Skipped}", 
                        stopwatch.Elapsed, processingState.TotalProjects, processingState.SkippedProjects);
                    
                    return processingState;
                }

                _logger.LogInformation("🔄 File has changed or is new. Processing...");

                // Step 3: Parse the graph document
                _logger.LogInformation("📋 Step 3/6: Parsing JSON document...");
                var graphDocument = await _fileProcessor.ProcessGraphFileAsync(filePath);
                
                if (graphDocument == null)
                {
                    _logger.LogError("❌ Failed to parse graph document");
                    throw new InvalidOperationException("Failed to parse graph document");
                }

                _logger.LogInformation("✅ Parsed document with {NodeCount} nodes and {EdgeCount} edges", 
                    graphDocument.Nodes.Count, graphDocument.Edges.Count);

                // Step 4: Extract projects
                _logger.LogInformation("📋 Step 4/6: Extracting individual projects...");
                var projects = await ExtractProjectsFromGraphAsync(graphDocument);
                processingState.TotalProjects = projects.Count;
                
                _logger.LogInformation("✅ Extracted {ProjectCount} projects", projects.Count);

                // Step 5: Process each project incrementally
                _logger.LogInformation("📋 Step 5/6: Processing projects incrementally...");
                await ProcessProjectsIncrementallyAsync(projects, processingState, previousState);
                _logger.LogInformation("✅ Step 5/6: Project processing complete - New: {New}, Updated: {Updated}, Skipped: {Skipped}", 
                    processingState.NewProjects, processingState.UpdatedProjects, processingState.SkippedProjects);

                // Step 6: Save processing state
                _logger.LogInformation("📋 Step 6/6: Saving processing state...");
                await _projectDatabaseService.SaveProcessingStateAsync(processingState);
                _logger.LogInformation("✅ Step 6/6: Processing state saved successfully");

                stopwatch.Stop();
                _logger.LogInformation("✅ Processing Complete in {ElapsedTime:mm\\:ss\\.fff} | Projects: {Total} total, {New} new, {Updated} updated, {Skipped} skipped", 
                    stopwatch.Elapsed, processingState.TotalProjects, processingState.NewProjects, 
                    processingState.UpdatedProjects, processingState.SkippedProjects);

                return processingState;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _logger.LogError(ex, "❌ Processing failed after {ElapsedTime:mm\\:ss\\.fff}", stopwatch.Elapsed);
                throw;
            }
        }

        private async Task ProcessProjectsIncrementallyAsync(
            List<ProjectInfo> projects, 
            ProcessingState currentState, 
            ProcessingState? previousState)
        {
            var projectIndex = 0;
            foreach (var project in projects)
            {
                projectIndex++;
                var projectPrefix = $"[{projectIndex}/{projects.Count}]";
                
                _logger.LogInformation("{Prefix} Processing project: {ProjectName}", projectPrefix, project.ProjectName);

                try
                {
                    // Calculate project hash
                    project.ContentHash = await CalculateProjectHashAsync(project);

                    var previousProjectInfo = previousState?.ProjectStates.GetValueOrDefault(project.ProjectId);
                    var hasProjectChanged = previousProjectInfo == null || 
                                          previousProjectInfo.ContentHash != project.ContentHash;

                    var projectProcessingInfo = new ProjectProcessingInfo
                    {
                        ProjectId = project.ProjectId,
                        ProjectName = project.ProjectName,
                        ContentHash = project.ContentHash,
                        LastProcessed = DateTime.UtcNow,
                        NodeCount = project.NodeCount,
                        EdgeCount = project.EdgeCount
                    };

                    if (!hasProjectChanged)
                    {
                        _logger.LogInformation("   ⏩ Project unchanged. Skipping...");
                        projectProcessingInfo.Status = ProcessingStatus.Skipped;
                        projectProcessingInfo.ProcessingMessage = "No changes detected";
                        currentState.SkippedProjects++;
                    }
                    else
                    {
                        var isNew = previousProjectInfo == null;
                        _logger.LogInformation("   🔄 Project {Status} - Nodes: {NodeCount}, Edges: {EdgeCount}", 
                            isNew ? "NEW" : "UPDATED", project.NodeCount, project.EdgeCount);

                        // Save project to database
                        var success = await _projectDatabaseService.SaveProjectInfoAsync(project);
                        
                        if (success)
                        {
                            if (isNew)
                            {
                                _logger.LogInformation("   ✅ New project saved successfully");
                                projectProcessingInfo.Status = ProcessingStatus.New;
                                projectProcessingInfo.ProcessingMessage = "Successfully processed new project";
                                currentState.NewProjects++;
                            }
                            else
                            {
                                _logger.LogInformation("   ✅ Updated project saved successfully");
                                projectProcessingInfo.Status = ProcessingStatus.Updated;
                                projectProcessingInfo.ProcessingMessage = "Successfully updated project";
                                currentState.UpdatedProjects++;
                            }
                        }
                        else
                        {
                            _logger.LogWarning("   ⚠️  Failed to save project");
                            projectProcessingInfo.Status = ProcessingStatus.Failed;
                            projectProcessingInfo.ProcessingMessage = "Failed to save to database";
                        }
                    }

                    currentState.ProjectStates[project.ProjectId] = projectProcessingInfo;
                    currentState.ProcessedProjects++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "   ❌ Error processing project {ProjectName}", project.ProjectName);
                    
                    currentState.ProjectStates[project.ProjectId] = new ProjectProcessingInfo
                    {
                        ProjectId = project.ProjectId,
                        ProjectName = project.ProjectName,
                        Status = ProcessingStatus.Failed,
                        ProcessingMessage = ex.Message,
                        LastProcessed = DateTime.UtcNow
                    };
                }
            }
        }

        public async Task<ProcessingState> GetProcessingStateAsync(string sourceFile)
        {
            return await _projectDatabaseService.GetProcessingStateAsync(sourceFile) ?? new ProcessingState();
        }

        public async Task<bool> HasFileChangedAsync(string filePath)
        {
            var fileName = Path.GetFileName(filePath);
            var currentHash = await CalculateFileHashAsync(filePath);
            var previousState = await GetProcessingStateAsync(fileName);
            
            return previousState == null || previousState.FileHash != currentHash;
        }

        public async Task<List<ProjectInfo>> ExtractProjectsFromGraphAsync(GraphDocument graphDocument)
        {
            return await Task.Run(() =>
            {
                var projects = new Dictionary<string, ProjectInfo>();

                // Group nodes by project
                var projectNodes = graphDocument.Nodes
                    .Where(n => !string.IsNullOrEmpty(n.Project) && n.Type != "Solution" && n.Type != "Layer")
                    .GroupBy(n => n.Project);

                foreach (var projectGroup in projectNodes)
                {
                    var projectName = projectGroup.Key;
                    var nodes = projectGroup.ToList();

                    // Find project layer from node attributes
                    var layer = nodes.FirstOrDefault()?.Attributes?.Layer ?? "unknown";

                    // Get edges related to this project
                    var nodeIds = nodes.Select(n => n.Id).ToHashSet();
                    var edges = graphDocument.Edges
                        .Where(e => nodeIds.Contains(e.Source) || nodeIds.Contains(e.Target))
                        .ToList();

                    var project = new ProjectInfo
                    {
                        ProjectId = $"project:{projectName}",
                        ProjectName = projectName,
                        Layer = layer,
                        NodeCount = nodes.Count,
                        EdgeCount = edges.Count,
                        Nodes = nodes,
                        Edges = edges,
                        SourceFile = graphDocument.SourceFile,
                        SourceDirectory = graphDocument.SourceDirectory,
                        LastModified = graphDocument.ImportedAt
                    };

                    projects[project.ProjectId] = project;
                }

                return projects.Values.ToList();
            });
        }

        public async Task<string> CalculateProjectHashAsync(ProjectInfo project)
        {
            return await Task.Run(() =>
            {
                var content = new
                {
                    ProjectName = project.ProjectName,
                    NodeCount = project.NodeCount,
                    EdgeCount = project.EdgeCount,
                    Nodes = project.Nodes.Select(n => new { n.Id, n.Name, n.Type, n.Accessibility }).OrderBy(x => x.Id),
                    Edges = project.Edges.Select(e => new { e.Id, e.Source, e.Target, e.Relationship }).OrderBy(x => x.Id)
                };

                var json = JsonConvert.SerializeObject(content, Formatting.None);
                return CalculateHash(json);
            });
        }

        public async Task<string> CalculateFileHashAsync(string filePath)
        {
            return await Task.Run(() =>
            {
                using var sha256 = SHA256.Create();
                using var stream = File.OpenRead(filePath);
                var hashBytes = sha256.ComputeHash(stream);
                return Convert.ToBase64String(hashBytes);
            });
        }

        private static string CalculateHash(string input)
        {
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
            return Convert.ToBase64String(hashBytes);
        }
    }
}
