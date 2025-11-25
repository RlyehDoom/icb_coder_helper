using System.Collections.Generic;

namespace RoslynIndexer.Models
{
    public class SymbolInfo
    {
        public string Name { get; set; } = "";
        public string FullName { get; set; } = "";
        public string Type { get; set; } = "";
        public string Project { get; set; } = "";
        public string File { get; set; } = "";
        public int Line { get; set; }
        public int Column { get; set; }
        public string Accessibility { get; set; } = "";
        public List<string> Modifiers { get; set; } = new();
        public List<string> Attributes { get; set; } = new();
        public List<ParameterInfo> Parameters { get; set; } = new();
        public List<ReferenceInfo> References { get; set; } = new();
        public string Documentation { get; set; } = "";
        public string Signature { get; set; } = "";
        public string Namespace { get; set; } = "";

        /// <summary>
        /// For Method symbols: the full name of the containing class/interface.
        /// Example: "Namespace.ClassName" for method "Namespace.ClassName.MethodName"
        /// </summary>
        public string? ContainingType { get; set; }
    }

    public class ParameterInfo
    {
        public string Name { get; set; } = "";
        public string Type { get; set; } = "";
        public bool IsOptional { get; set; }
        public string? DefaultValue { get; set; }
    }

    public class ReferenceInfo
    {
        public string Project { get; set; } = "";
        public string File { get; set; } = "";
        public int Line { get; set; }
        public int Column { get; set; }
        public string Context { get; set; } = "";
    }

    public class IndexResult
    {
        public DateTime GeneratedAt { get; set; }
        public string SolutionPath { get; set; } = "";
        public List<SymbolInfo> Symbols { get; set; } = new();
        public Dictionary<string, int> Statistics { get; set; } = new();
    }

    public class MethodInvocationInfo
    {
        public string CallerMethod { get; set; } = "";
        public string CallerType { get; set; } = "";
        public string CallerProject { get; set; } = "";
        public string InvocationExpression { get; set; } = "";
        public string File { get; set; } = "";
        public int Line { get; set; }
        
        // Semantic model enhancements
        public string TargetMethod { get; set; } = "";
        public string TargetType { get; set; } = "";
        public string TargetProject { get; set; } = "";
        public bool IsVirtual { get; set; }
        public bool IsAbstract { get; set; }
        public bool IsOverride { get; set; }
        public bool IsPropertyAccess { get; set; }
    }

    public class TypeUsageInfo
    {
        public string UsageType { get; set; } = ""; // ObjectCreation, FieldType, PropertyType, MethodParameter, etc.
        public string TypeName { get; set; } = "";
        public string UsedInMethod { get; set; } = "";
        public string UsedInType { get; set; } = "";
        public string UsedInProject { get; set; } = "";
        public string File { get; set; } = "";
        public int Line { get; set; }
        
        // Semantic model enhancements
        public string ReferencedProject { get; set; } = "";
    }
    
    public class InheritanceInfo
    {
        public string DerivedType { get; set; } = "";
        public string BaseType { get; set; } = "";
        public string DerivedProject { get; set; } = "";
        public string BaseProject { get; set; } = "";
        public string File { get; set; } = "";
        public int Line { get; set; }
    }
    
    public class ImplementationInfo
    {
        public string ImplementingType { get; set; } = "";
        public string InterfaceType { get; set; } = "";
        public string ImplementingProject { get; set; } = "";
        public string InterfaceProject { get; set; } = "";
        public string File { get; set; } = "";
        public int Line { get; set; }
    }
}
