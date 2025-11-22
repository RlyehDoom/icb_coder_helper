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

        public async Task<ProcessingState> ProcessGraphFileIncrementallyAsync(string filePath, string? version = null)
        {
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var fileName = Path.GetFileName(filePath);

            _logger.LogInformation("=== Starting Incremental Processing ===");
            _logger.LogInformation("File: {FileName}", fileName);
            _logger.LogInformation("Path: {FilePath}", filePath);
            if (!string.IsNullOrEmpty(version))
            {
                _logger.LogInformation("Version: {Version}", version);
            }

            var processingState = new ProcessingState
            {
                SourceFile = fileName,
                SourceDirectory = GetRelativeSourceDirectory(filePath),
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

                // Extract version from graph metadata
                string? graphVersion = version ?? graphDocument.Metadata?.ToolVersion;
                if (!string.IsNullOrEmpty(graphVersion))
                {
                    processingState.Version = graphVersion;
                    _logger.LogInformation("📌 Graph Version: {Version}", graphVersion);
                }

                // Save processing state BEFORE processing projects to obtain MongoId for relationships
                _logger.LogInformation("📋 Step 3.5/6: Saving initial processing state to establish relationships...");
                await _projectDatabaseService.SaveProcessingStateAsync(processingState);
                _logger.LogInformation("✅ Processing state saved with ID: {StateId}", processingState.MongoId);

                // Step 4: Extract projects
                _logger.LogInformation("📋 Step 4/6: Extracting individual projects...");
                var projects = await ExtractProjectsFromGraphAsync(graphDocument);
                processingState.TotalProjects = projects.Count;

                _logger.LogInformation("✅ Extracted {ProjectCount} projects", projects.Count);

                // Step 5: Process each project incrementally
                _logger.LogInformation("📋 Step 5/6: Processing projects incrementally...");
                await ProcessProjectsIncrementallyAsync(projects, processingState, previousState, processingState.MongoId);

                var summaryParts = new List<string>
                {
                    $"New: {processingState.NewProjects}",
                    $"Updated: {processingState.UpdatedProjects}",
                    $"Skipped: {processingState.SkippedProjects}"
                };

                if (processingState.FailedProjects > 0)
                    summaryParts.Add($"Failed: {processingState.FailedProjects}");

                if (processingState.FragmentedProjects > 0)
                    summaryParts.Add($"Fragmented: {processingState.FragmentedProjects}");

                _logger.LogInformation("✅ Step 5/6: Project processing complete - {Summary}",
                    string.Join(", ", summaryParts));

                // Step 6: Save processing state
                _logger.LogInformation("📋 Step 6/6: Saving processing state...");
                await _projectDatabaseService.SaveProcessingStateAsync(processingState);
                _logger.LogInformation("✅ Step 6/6: Processing state saved successfully");

                stopwatch.Stop();

                var finalSummaryParts = new List<string>
                {
                    $"{processingState.TotalProjects} total",
                    $"{processingState.NewProjects} new",
                    $"{processingState.UpdatedProjects} updated",
                    $"{processingState.SkippedProjects} skipped"
                };

                if (processingState.FailedProjects > 0)
                    finalSummaryParts.Add($"{processingState.FailedProjects} failed");

                if (processingState.FragmentedProjects > 0)
                    finalSummaryParts.Add($"{processingState.FragmentedProjects} fragmented");

                _logger.LogInformation("✅ Processing Complete in {ElapsedTime:mm\\:ss\\.fff} | Projects: {Summary}",
                    stopwatch.Elapsed, string.Join(", ", finalSummaryParts));

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
            ProcessingState? previousState,
            string? processingStateId = null)
        {
            var projectIndex = 0;
            foreach (var project in projects)
            {
                projectIndex++;
                var projectPrefix = $"[{projectIndex}/{projects.Count}]";

                _logger.LogInformation("{Prefix} Processing project: {ProjectName}", projectPrefix, project.ProjectName);

                try
                {
                    // Set relationship to ProcessingState
                    if (!string.IsNullOrEmpty(processingStateId))
                    {
                        project.ProcessingStateId = processingStateId;
                    }

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
                        var saveResult = await _projectDatabaseService.SaveProjectInfoDetailedAsync(project);

                        if (saveResult.Success)
                        {
                            if (saveResult.IsFragmented)
                            {
                                _logger.LogInformation("   📦 {Status} project saved as fragmented ({Count} fragments, too large)",
                                    isNew ? "New" : "Updated", saveResult.FragmentCount);
                                projectProcessingInfo.Status = ProcessingStatus.Fragmented;
                                projectProcessingInfo.ProcessingMessage = $"Saved as {saveResult.FragmentCount} fragments (exceeds 15MB limit)";
                                currentState.FragmentedProjects++;

                                // Still count as new or updated
                                if (isNew)
                                    currentState.NewProjects++;
                                else
                                    currentState.UpdatedProjects++;
                            }
                            else if (isNew)
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
                            _logger.LogWarning("   ⚠️  Failed to save project: {Error}", saveResult.ErrorMessage);
                            projectProcessingInfo.Status = ProcessingStatus.Failed;
                            projectProcessingInfo.ProcessingMessage = $"Failed to save to database: {saveResult.ErrorMessage}";
                            currentState.FailedProjects++;
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

                    currentState.FailedProjects++;
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

                // Extract repository/version identifier from SourceDirectory
                // Example: /Indexer/output/ICB7C_GraphFiles -> ICB7C
                // Example: /Indexer/output/6_5_main_GraphFiles -> 6_5_main
                var repoIdentifier = ExtractRepositoryIdentifier(graphDocument.SourceDirectory, graphDocument.SourceFile);

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

                    // IMPORTANT: Include repository identifier in ProjectId to support multiple versions
                    // This prevents different versions of the same project from overwriting each other
                    var projectId = string.IsNullOrEmpty(repoIdentifier)
                        ? $"project:{projectName}"
                        : $"project:{projectName}::{repoIdentifier}";

                    var project = new ProjectInfo
                    {
                        ProjectId = projectId,
                        ProjectName = projectName,
                        Layer = layer,
                        NodeCount = nodes.Count,
                        EdgeCount = edges.Count,
                        Nodes = nodes,
                        Edges = edges,
                        SourceFile = graphDocument.SourceFile,
                        SourceDirectory = graphDocument.SourceDirectory,
                        LastModified = graphDocument.ImportedAt,
                        Version = graphDocument.Version // Preserve version if available
                    };

                    projects[project.ProjectId] = project;
                }

                return projects.Values.ToList();
            });
        }

        /// <summary>
        /// Extracts a repository/version identifier from the source directory path.
        /// Examples:
        ///   /Indexer/output/ICB7C_GraphFiles -> ICB7C
        ///   /Indexer/output/6_5_main_GraphFiles -> 6_5_main
        ///   /Indexer/output/MyProject_GraphFiles -> MyProject
        /// </summary>
        private static string ExtractRepositoryIdentifier(string sourceDirectory, string sourceFile)
        {
            // Try to extract from directory name first
            if (!string.IsNullOrEmpty(sourceDirectory))
            {
                var dirParts = sourceDirectory.Split('/', '\\');
                var graphFilesDir = dirParts.LastOrDefault(p => p.EndsWith("_GraphFiles", StringComparison.OrdinalIgnoreCase));

                if (!string.IsNullOrEmpty(graphFilesDir))
                {
                    // Remove _GraphFiles suffix
                    return graphFilesDir.Substring(0, graphFilesDir.Length - "_GraphFiles".Length);
                }
            }

            // Fallback: try to extract from source file name
            // Example: Infocorp.Banking-graph.json -> Infocorp.Banking
            if (!string.IsNullOrEmpty(sourceFile))
            {
                var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(sourceFile);
                // Remove -graph, -symbols, or other suffixes
                var baseName = fileNameWithoutExtension
                    .Replace("-graph-structural", "")
                    .Replace("-graph", "")
                    .Replace("-symbols", "")
                    .Replace("-stats", "");

                if (!string.IsNullOrEmpty(baseName))
                {
                    return baseName;
                }
            }

            // If we can't determine the identifier, return empty string
            // This will fallback to the old behavior (project name only)
            return string.Empty;
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

        /// <summary>
        /// Converts absolute path to relative path starting from /Indexer
        /// Example: C:\Program Files\nodejs\node_modules\grafo-cli\Indexer\output\file.json
        ///       -> /Indexer/output
        /// </summary>
        private static string GetRelativeSourceDirectory(string filePath)
        {
            var directory = Path.GetDirectoryName(filePath) ?? string.Empty;

            // Normalize path separators to forward slashes
            var normalizedPath = directory.Replace('\\', '/');

            // Find the position of "/Indexer" or "Indexer" in the path
            var indexerIndex = normalizedPath.LastIndexOf("/Indexer", StringComparison.OrdinalIgnoreCase);
            if (indexerIndex == -1)
            {
                indexerIndex = normalizedPath.LastIndexOf("Indexer", StringComparison.OrdinalIgnoreCase);
                if (indexerIndex == -1)
                {
                    // If Indexer not found, return the full normalized path
                    return normalizedPath;
                }
                // Return from /Indexer onwards
                return "/" + normalizedPath.Substring(indexerIndex);
            }

            // Return from /Indexer onwards (indexerIndex already includes the /)
            return normalizedPath.Substring(indexerIndex);
        }
    }
}
