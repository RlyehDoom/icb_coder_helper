using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using RoslynIndexer.Models;

namespace RoslynIndexer.Walkers
{
    /// <summary>
    /// Advanced semantic walker that uses Roslyn's SemanticModel for accurate symbol resolution
    /// Replaces syntax-only analysis with full semantic understanding
    /// </summary>
    public class SemanticWalker : CSharpSyntaxWalker
    {
        private readonly string _projectName;
        private readonly string _filePath;
        private readonly SemanticModel _semanticModel;
        
        public List<Models.SymbolInfo> Symbols { get; } = new();
        public List<MethodInvocationInfo> MethodInvocations { get; } = new();
        public List<TypeUsageInfo> TypeUsages { get; } = new();
        public List<InheritanceInfo> InheritanceRelations { get; } = new();
        public List<ImplementationInfo> InterfaceImplementations { get; } = new();
        
        private string _currentMethodFullName = "";
        private string _currentTypeFullName = "";
        private INamedTypeSymbol? _currentTypeSymbol = null;

        public SemanticWalker(string projectName, string filePath, SemanticModel semanticModel)
        {
            _projectName = projectName;
            _filePath = filePath;
            _semanticModel = semanticModel;
        }

        public override void VisitClassDeclaration(ClassDeclarationSyntax node)
        {
            var previousType = _currentTypeFullName;
            var previousTypeSymbol = _currentTypeSymbol;
            
            var symbol = _semanticModel.GetDeclaredSymbol(node);
            if (symbol != null)
            {
                _currentTypeSymbol = symbol;
                _currentTypeFullName = GetFullyQualifiedName(symbol);
                
                var symbolInfo = CreateSymbolInfo(node, symbol, "Class");
                Symbols.Add(symbolInfo);
                
                // Capture inheritance
                if (symbol.BaseType != null && symbol.BaseType.SpecialType != SpecialType.System_Object)
                {
                    InheritanceRelations.Add(new InheritanceInfo
                    {
                        DerivedType = _currentTypeFullName,
                        BaseType = GetFullyQualifiedName(symbol.BaseType),
                        DerivedProject = _projectName,
                        BaseProject = GetProjectName(symbol.BaseType),
                        File = _filePath,
                        Line = GetLine(node)
                    });
                }
                
                // Capture interface implementations
                // Use AllInterfaces instead of Interfaces to ensure we get all implemented interfaces
                // symbol.Interfaces only returns directly declared interfaces
                // symbol.AllInterfaces includes both direct and inherited interfaces

                // DEBUG: Log when processing specific classes
                bool isApprovalSchemeExecution = symbol.Name.Contains("ApprovalSchemeExecution");
                if (isApprovalSchemeExecution)
                {
                    Console.WriteLine($"DEBUG: Processing class {symbol.Name}");
                    Console.WriteLine($"  - Interfaces count: {symbol.Interfaces.Length}");
                    Console.WriteLine($"  - AllInterfaces count: {symbol.AllInterfaces.Length}");
                    foreach (var iface in symbol.AllInterfaces)
                    {
                        Console.WriteLine($"  - Interface: {GetFullyQualifiedName(iface)}");
                    }
                }

                foreach (var iface in symbol.AllInterfaces)
                {
                    InterfaceImplementations.Add(new ImplementationInfo
                    {
                        ImplementingType = _currentTypeFullName,
                        InterfaceType = GetFullyQualifiedName(iface),
                        ImplementingProject = _projectName,
                        InterfaceProject = GetProjectName(iface),
                        File = _filePath,
                        Line = GetLine(node)
                    });
                }
            }
            
            base.VisitClassDeclaration(node);
            
            _currentTypeFullName = previousType;
            _currentTypeSymbol = previousTypeSymbol;
        }

        public override void VisitInterfaceDeclaration(InterfaceDeclarationSyntax node)
        {
            var previousType = _currentTypeFullName;
            var previousTypeSymbol = _currentTypeSymbol;
            
            var symbol = _semanticModel.GetDeclaredSymbol(node);
            if (symbol != null)
            {
                _currentTypeSymbol = symbol;
                _currentTypeFullName = GetFullyQualifiedName(symbol);
                
                var symbolInfo = CreateSymbolInfo(node, symbol, "Interface");
                Symbols.Add(symbolInfo);
                
                // Capture interface inheritance
                // Use AllInterfaces to get all inherited interfaces
                foreach (var iface in symbol.AllInterfaces)
                {
                    InheritanceRelations.Add(new InheritanceInfo
                    {
                        DerivedType = _currentTypeFullName,
                        BaseType = GetFullyQualifiedName(iface),
                        DerivedProject = _projectName,
                        BaseProject = GetProjectName(iface),
                        File = _filePath,
                        Line = GetLine(node)
                    });
                }
            }
            
            base.VisitInterfaceDeclaration(node);
            
            _currentTypeFullName = previousType;
            _currentTypeSymbol = previousTypeSymbol;
        }

        public override void VisitMethodDeclaration(MethodDeclarationSyntax node)
        {
            var previousMethod = _currentMethodFullName;

            var symbol = _semanticModel.GetDeclaredSymbol(node);
            if (symbol != null)
            {
                _currentMethodFullName = GetFullyQualifiedName(symbol);

                var symbolInfo = CreateSymbolInfo(node, symbol, "Method");

                // Add parameters with semantic information
                symbolInfo.Parameters = symbol.Parameters
                    .Select(p => new ParameterInfo
                    {
                        Name = p.Name,
                        Type = GetFullyQualifiedName(p.Type),
                        IsOptional = p.IsOptional,
                        DefaultValue = p.HasExplicitDefaultValue ? p.ExplicitDefaultValue?.ToString() : null
                    }).ToList();
                
                Symbols.Add(symbolInfo);
                
                // Capture parameter types as TypeUsages (for cross-project references)
                foreach (var parameter in symbol.Parameters)
                {
                    if (!IsSystemType(parameter.Type))
                    {
                        TypeUsages.Add(new TypeUsageInfo
                        {
                            UsageType = "ParameterType",
                            TypeName = GetFullyQualifiedName(parameter.Type),
                            UsedInMethod = _currentMethodFullName,
                            UsedInType = _currentTypeFullName,
                            UsedInProject = _projectName,
                            ReferencedProject = GetProjectName(parameter.Type),
                            File = _filePath,
                            Line = GetLine(node)
                        });
                    }
                }
                
                // Capture return type as TypeUsage (for cross-project references)
                if (!IsSystemType(symbol.ReturnType) && symbol.ReturnType.SpecialType != SpecialType.System_Void)
                {
                    TypeUsages.Add(new TypeUsageInfo
                    {
                        UsageType = "ReturnType",
                        TypeName = GetFullyQualifiedName(symbol.ReturnType),
                        UsedInMethod = _currentMethodFullName,
                        UsedInType = _currentTypeFullName,
                        UsedInProject = _projectName,
                        ReferencedProject = GetProjectName(symbol.ReturnType),
                        File = _filePath,
                        Line = GetLine(node)
                    });
                }
                
                // Detect method overrides
                if (symbol.IsOverride && symbol.OverriddenMethod != null)
                {
                    MethodInvocations.Add(new MethodInvocationInfo
                    {
                        CallerMethod = _currentMethodFullName,
                        CallerType = _currentTypeFullName,
                        CallerProject = _projectName,
                        InvocationExpression = GetFullyQualifiedName(symbol.OverriddenMethod),
                        File = _filePath,
                        Line = GetLine(node),
                        IsOverride = true
                    });
                }
            }
            
            base.VisitMethodDeclaration(node);
            
            _currentMethodFullName = previousMethod;
        }

        public override void VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            var symbol = _semanticModel.GetDeclaredSymbol(node);
            if (symbol != null)
            {
                var symbolInfo = CreateSymbolInfo(node, symbol, "Property");
                Symbols.Add(symbolInfo);
            }
            base.VisitPropertyDeclaration(node);
        }

        public override void VisitEnumDeclaration(EnumDeclarationSyntax node)
        {
            var symbol = _semanticModel.GetDeclaredSymbol(node);
            if (symbol != null)
            {
                var symbolInfo = CreateSymbolInfo(node, symbol, "Enum");
                Symbols.Add(symbolInfo);
            }
            base.VisitEnumDeclaration(node);
        }

        public override void VisitStructDeclaration(StructDeclarationSyntax node)
        {
            var symbol = _semanticModel.GetDeclaredSymbol(node);
            if (symbol != null)
            {
                var symbolInfo = CreateSymbolInfo(node, symbol, "Struct");
                Symbols.Add(symbolInfo);
            }
            base.VisitStructDeclaration(node);
        }

        public override void VisitFieldDeclaration(FieldDeclarationSyntax node)
        {
            foreach (var variable in node.Declaration.Variables)
            {
                var symbol = _semanticModel.GetDeclaredSymbol(variable);
                if (symbol != null)
                {
                    var symbolInfo = CreateSymbolInfo(node, symbol, "Field");
                    Symbols.Add(symbolInfo);
                    
                    // Capture type usage
                    var fieldSymbol = symbol as IFieldSymbol;
                    if (fieldSymbol != null && !IsSystemType(fieldSymbol.Type))
                    {
                        TypeUsages.Add(new TypeUsageInfo
                        {
                            UsageType = "FieldType",
                            TypeName = GetFullyQualifiedName(fieldSymbol.Type),
                            UsedInType = _currentTypeFullName,
                            UsedInProject = _projectName,
                            ReferencedProject = GetProjectName(fieldSymbol.Type),
                            File = _filePath,
                            Line = GetLine(node)
                        });
                    }
                }
            }
            base.VisitFieldDeclaration(node);
        }

        public override void VisitInvocationExpression(InvocationExpressionSyntax node)
        {
            if (!string.IsNullOrEmpty(_currentMethodFullName))
            {
                var symbolInfo = _semanticModel.GetSymbolInfo(node);
                var methodSymbol = symbolInfo.Symbol as IMethodSymbol;
                
                if (methodSymbol != null)
                {
                    // Skip system methods unless verbose
                    if (!IsSystemType(methodSymbol.ContainingType))
                    {
                        var invocationInfo = new MethodInvocationInfo
                        {
                            CallerMethod = _currentMethodFullName,
                            CallerType = _currentTypeFullName,
                            CallerProject = _projectName,
                            InvocationExpression = GetFullyQualifiedName(methodSymbol),
                            TargetMethod = GetFullyQualifiedName(methodSymbol),
                            TargetType = GetFullyQualifiedName(methodSymbol.ContainingType),
                            TargetProject = GetProjectName(methodSymbol.ContainingType),
                            File = _filePath,
                            Line = GetLine(node),
                            IsVirtual = methodSymbol.IsVirtual,
                            IsAbstract = methodSymbol.IsAbstract,
                            IsOverride = methodSymbol.IsOverride
                        };
                        
                        MethodInvocations.Add(invocationInfo);
                    }
                }
            }
            
            base.VisitInvocationExpression(node);
        }

        public override void VisitObjectCreationExpression(ObjectCreationExpressionSyntax node)
        {
            if (!string.IsNullOrEmpty(_currentMethodFullName) || !string.IsNullOrEmpty(_currentTypeFullName))
            {
                var symbolInfo = _semanticModel.GetSymbolInfo(node);
                var constructorSymbol = symbolInfo.Symbol as IMethodSymbol;
                
                if (constructorSymbol != null)
                {
                    var typeSymbol = constructorSymbol.ContainingType;
                    
                    if (!IsSystemType(typeSymbol))
                    {
                        var typeUsage = new TypeUsageInfo
                        {
                            UsageType = "ObjectCreation",
                            TypeName = GetFullyQualifiedName(typeSymbol),
                            UsedInMethod = _currentMethodFullName,
                            UsedInType = _currentTypeFullName,
                            UsedInProject = _projectName,
                            ReferencedProject = GetProjectName(typeSymbol),
                            File = _filePath,
                            Line = GetLine(node)
                        };
                        
                        TypeUsages.Add(typeUsage);
                    }
                }
            }
            
            base.VisitObjectCreationExpression(node);
        }

        public override void VisitIdentifierName(IdentifierNameSyntax node)
        {
            // Capture property/field access
            if (node.Parent is MemberAccessExpressionSyntax)
            {
                var symbolInfo = _semanticModel.GetSymbolInfo(node);
                var symbol = symbolInfo.Symbol;
                
                if (symbol is IPropertySymbol propertySymbol)
                {
                    if (!IsSystemType(propertySymbol.ContainingType))
                    {
                        MethodInvocations.Add(new MethodInvocationInfo
                        {
                            CallerMethod = _currentMethodFullName,
                            CallerType = _currentTypeFullName,
                            CallerProject = _projectName,
                            InvocationExpression = GetFullyQualifiedName(propertySymbol),
                            TargetMethod = GetFullyQualifiedName(propertySymbol),
                            TargetType = GetFullyQualifiedName(propertySymbol.ContainingType),
                            TargetProject = GetProjectName(propertySymbol.ContainingType),
                            File = _filePath,
                            Line = GetLine(node),
                            IsPropertyAccess = true
                        });
                    }
                }
            }
            
            base.VisitIdentifierName(node);
        }

        private Models.SymbolInfo CreateSymbolInfo(SyntaxNode node, ISymbol symbol, string symbolType)
        {
            var location = node.GetLocation();
            var lineSpan = location.GetLineSpan();

            var symbolInfo = new Models.SymbolInfo
            {
                Name = symbol.Name,
                FullName = GetFullyQualifiedName(symbol),
                Type = symbolType,
                Project = _projectName,
                File = _filePath,
                Line = lineSpan.StartLinePosition.Line + 1,
                Column = lineSpan.StartLinePosition.Character + 1,
                Accessibility = symbol.DeclaredAccessibility.ToString(),
                Signature = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                Documentation = symbol.GetDocumentationCommentXml() ?? "",
                Namespace = symbol.ContainingNamespace?.ToDisplayString() ?? "Global"
            };

            // For methods, properties, and fields: capture the containing type
            // This enables direct lookup of methods by their parent class
            if (symbolType == "Method" || symbolType == "Property" || symbolType == "Field")
            {
                if (symbol.ContainingType != null)
                {
                    symbolInfo.ContainingType = GetFullyQualifiedName(symbol.ContainingType);
                }
                else if (!string.IsNullOrEmpty(_currentTypeFullName))
                {
                    // Fallback to tracked current type
                    symbolInfo.ContainingType = _currentTypeFullName;
                }
            }

            // Extract modifiers
            symbolInfo.Modifiers = new List<string>();
            if (symbol.IsStatic) symbolInfo.Modifiers.Add("static");
            if (symbol.IsAbstract) symbolInfo.Modifiers.Add("abstract");
            if (symbol.IsSealed) symbolInfo.Modifiers.Add("sealed");
            if (symbol.IsVirtual) symbolInfo.Modifiers.Add("virtual");

            if (symbol is IMethodSymbol methodSymbol)
            {
                if (methodSymbol.IsOverride) symbolInfo.Modifiers.Add("override");
                if (methodSymbol.IsAsync) symbolInfo.Modifiers.Add("async");
            }

            // Extract attributes
            symbolInfo.Attributes = symbol.GetAttributes()
                .Select(attr => attr.AttributeClass?.Name ?? "")
                .Where(name => !string.IsNullOrEmpty(name))
                .ToList();

            return symbolInfo;
        }

        private string GetFullyQualifiedName(ISymbol symbol)
        {
            return symbol.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat)
                .Replace("global::", "");
        }

        private string GetProjectName(ISymbol symbol)
        {
            // Try to determine project from assembly name
            var assembly = symbol.ContainingAssembly;
            if (assembly != null)
            {
                return assembly.Name;
            }
            return _projectName;
        }

        private bool IsSystemType(ITypeSymbol typeSymbol)
        {
            if (typeSymbol == null) return true;
            
            var fullName = GetFullyQualifiedName(typeSymbol);
            return fullName.StartsWith("System.") || 
                   fullName.StartsWith("Microsoft.") ||
                   typeSymbol.ContainingAssembly?.Name == "mscorlib" ||
                   typeSymbol.ContainingAssembly?.Name.StartsWith("System") == true;
        }

        private int GetLine(SyntaxNode node)
        {
            return node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
        }
    }
}

