using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using RoslynIndexer.Models;
using RoslynIndexer.Services;
using RoslynIndexer.Walkers;

namespace RoslynIndexer.Tests
{
    /// <summary>
    /// Basic integration tests for RoslynIndexer functionality.
    /// These are simple tests to verify core functionality works.
    /// </summary>
    public static class BasicTests
    {
        public static async Task<int> Main(string[] args)
        {
            Console.WriteLine("RoslynIndexer Basic Tests");
            Console.WriteLine("========================");

            var testsPassed = 0;
            var testsTotal = 0;

            // Test 1: AnalysisService basic functionality
            testsTotal++;
            Console.WriteLine($"\nTest {testsTotal}: AnalysisService symbol extraction");
            try
            {
                await TestAnalysisService();
                Console.WriteLine("✓ PASSED: AnalysisService can extract symbols");
                testsPassed++;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ FAILED: AnalysisService test failed - {ex.Message}");
            }

            // Test 2: GraphService basic functionality
            testsTotal++;
            Console.WriteLine($"\nTest {testsTotal}: GraphService graph generation");
            try
            {
                await TestGraphService();
                Console.WriteLine("✓ PASSED: GraphService can generate graphs");
                testsPassed++;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ FAILED: GraphService test failed - {ex.Message}");
            }

            // Test 3: OutputService formatting
            testsTotal++;
            Console.WriteLine($"\nTest {testsTotal}: OutputService formatting");
            try
            {
                await TestOutputService();
                Console.WriteLine("✓ PASSED: OutputService can format output");
                testsPassed++;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ FAILED: OutputService test failed - {ex.Message}");
            }

            // Test 4: SyntaxOnlyWalker
            testsTotal++;
            Console.WriteLine($"\nTest {testsTotal}: SyntaxOnlyWalker parsing");
            try
            {
                TestSyntaxWalker();
                Console.WriteLine("✓ PASSED: SyntaxOnlyWalker can parse code");
                testsPassed++;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ FAILED: SyntaxOnlyWalker test failed - {ex.Message}");
            }

            // Summary
            Console.WriteLine($"\n========================");
            Console.WriteLine($"Test Results: {testsPassed}/{testsTotal} passed");
            
            if (testsPassed == testsTotal)
            {
                Console.WriteLine("🎉 All tests passed!");
                return 0;
            }
            else
            {
                Console.WriteLine("❌ Some tests failed!");
                return 1;
            }
        }

        private static async Task TestAnalysisService()
        {
            var analysisService = new AnalysisService();
            
            // Create a simple test C# file
            var testCode = @"
using System;

namespace TestNamespace
{
    public class TestClass
    {
        public string TestProperty { get; set; }
        
        public void TestMethod()
        {
            Console.WriteLine(""Hello World"");
        }
    }
    
    public interface ITestInterface
    {
        void InterfaceMethod();
    }
}";

            var tempFile = Path.GetTempFileName() + ".cs";
            try
            {
                await File.WriteAllTextAsync(tempFile, testCode);
                
                // Test symbol extraction
                var syntaxTree = Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree.ParseText(testCode, path: tempFile);
                var root = await syntaxTree.GetRootAsync();
                
                var symbols = analysisService.ExtractSymbolsWithoutSemantics(root, "TestProject", tempFile);
                
                if (symbols.Count == 0)
                    throw new Exception("No symbols extracted");
                
                // Verify expected symbols
                var classSymbol = symbols.FirstOrDefault(s => s.Type == "Class" && s.Name == "TestClass");
                if (classSymbol == null)
                    throw new Exception("TestClass not found");
                
                var interfaceSymbol = symbols.FirstOrDefault(s => s.Type == "Interface" && s.Name == "ITestInterface");
                if (interfaceSymbol == null)
                    throw new Exception("ITestInterface not found");
                
                var methodSymbol = symbols.FirstOrDefault(s => s.Type == "Method" && s.Name == "TestMethod");
                if (methodSymbol == null)
                    throw new Exception("TestMethod not found");
                
                // Test statistics calculation
                var stats = analysisService.CalculateStatistics(symbols);
                if (stats["Classes"] == 0 || stats["Interfaces"] == 0)
                    throw new Exception("Statistics calculation failed");
            }
            finally
            {
                if (File.Exists(tempFile))
                    File.Delete(tempFile);
            }
        }

        private static async Task TestGraphService()
        {
            var graphService = new GraphService();
            
            // Create sample symbols
            var symbols = new List<SymbolInfo>
            {
                new SymbolInfo
                {
                    Name = "TestClass",
                    FullName = "TestNamespace.TestClass",
                    Type = "Class",
                    Project = "TestProject",
                    File = "TestFile.cs",
                    Line = 1,
                    Column = 1,
                    Accessibility = "Public"
                },
                new SymbolInfo
                {
                    Name = "ITestInterface",
                    FullName = "TestNamespace.ITestInterface",
                    Type = "Interface",
                    Project = "TestProject",
                    File = "TestFile.cs",
                    Line = 10,
                    Column = 1,
                    Accessibility = "Public"
                }
            };

            // Test graph generation
            var graph = await graphService.GenerateSymbolGraph(symbols, "TestSolution.sln");
            
            if (graph.Nodes.Count == 0)
                throw new Exception("No nodes generated in graph");
            
            if (graph.Statistics.TotalNodes == 0)
                throw new Exception("Graph statistics not calculated");
            
            // Test structural graph generation
            var structuralGraph = graphService.GenerateStructuralOnlyGraph(graph);
            
            if (structuralGraph.Statistics.TotalNodes == 0)
                throw new Exception("Structural graph generation failed");
        }

        private static async Task TestOutputService()
        {
            var outputService = new OutputService();
            
            // Create test data
            var indexResult = new IndexResult
            {
                GeneratedAt = DateTime.UtcNow,
                SolutionPath = "TestSolution.sln",
                Symbols = new List<SymbolInfo>
                {
                    new SymbolInfo
                    {
                        Name = "TestClass",
                        FullName = "Test.TestClass",
                        Type = "Class",
                        Project = "TestProject",
                        File = "TestFile.cs"
                    }
                },
                Statistics = new Dictionary<string, int> { ["Classes"] = 1, ["TotalSymbols"] = 1 }
            };

            var tempDir = Path.GetTempPath();
            var jsonFile = Path.Combine(tempDir, "test-output.json");
            var csvFile = Path.Combine(tempDir, "test-stats.csv");

            try
            {
                // Test JSON output
                await outputService.SaveIndexResult(indexResult, jsonFile, "json");
                if (!File.Exists(jsonFile))
                    throw new Exception("JSON output file not created");

                // Test CSV statistics
                await outputService.SaveStatistics(indexResult.Statistics, csvFile);
                if (!File.Exists(csvFile))
                    throw new Exception("CSV statistics file not created");

                // Verify CSV content
                var csvContent = await File.ReadAllTextAsync(csvFile);
                if (!csvContent.Contains("Classes,1"))
                    throw new Exception("CSV content not correct");
            }
            finally
            {
                if (File.Exists(jsonFile)) File.Delete(jsonFile);
                if (File.Exists(csvFile)) File.Delete(csvFile);
            }
        }

        private static void TestSyntaxWalker()
        {
            var testCode = @"
using System;

namespace TestNamespace
{
    public class TestClass
    {
        private int _field;
        public string Property { get; set; }
        
        public void Method(int parameter)
        {
            // Method body
        }
    }
}";

            var syntaxTree = Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree.ParseText(testCode);
            var root = syntaxTree.GetRoot();
            
            var walker = new SyntaxOnlyWalker("TestProject", "TestFile.cs");
            walker.Visit(root);

            if (walker.Symbols.Count == 0)
                throw new Exception("SyntaxWalker found no symbols");

            var classSymbol = walker.Symbols.FirstOrDefault(s => s.Type == "Class");
            if (classSymbol == null)
                throw new Exception("Class symbol not found");

            var fieldSymbol = walker.Symbols.FirstOrDefault(s => s.Type == "Field");
            if (fieldSymbol == null)
                throw new Exception("Field symbol not found");

            var propertySymbol = walker.Symbols.FirstOrDefault(s => s.Type == "Property");
            if (propertySymbol == null)
                throw new Exception("Property symbol not found");

            var methodSymbol = walker.Symbols.FirstOrDefault(s => s.Type == "Method");
            if (methodSymbol == null)
                throw new Exception("Method symbol not found");

            // Test that method has parameters
            if (methodSymbol.Parameters.Count == 0)
                throw new Exception("Method parameters not extracted");
        }
    }
}
