"""
Modelos de datos para el servicio de consultas de grafo.
Estos modelos corresponden a las estructuras de datos en MongoDB.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class Location(BaseModel):
    """Ubicación de un elemento en el código fuente."""
    AbsolutePath: Optional[str] = Field(None, description="Ruta absoluta del archivo")
    RelativePath: Optional[str] = Field(None, description="Ruta relativa del archivo")
    Line: Optional[int] = Field(None, description="Número de línea")
    Column: Optional[int] = Field(None, description="Número de columna")
    
    class Config:
        populate_by_name = True


class NodeAttributes(BaseModel):
    """Atributos adicionales de un nodo."""
    parameters: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    returnType: Optional[str] = None
    baseTypes: Optional[List[str]] = Field(default_factory=list)
    interfaces: Optional[List[str]] = Field(default_factory=list)
    modifiers: Optional[List[str]] = Field(default_factory=list)
    customAttributes: Optional[Dict[str, Any]] = Field(default_factory=dict)


class EdgeAttributes(BaseModel):
    """Atributos adicionales de una arista."""
    customAttributes: Optional[Dict[str, Any]] = Field(default_factory=dict)


class GraphNode(BaseModel):
    """Representa un nodo del grafo de código."""
    Id: str = Field(..., alias="_id", description="Identificador único del nodo")
    Name: str = Field(..., description="Nombre del elemento")
    FullName: str = Field(default="", description="Nombre completo con namespace")
    Type: str = Field(..., description="Tipo del nodo (Class, Method, Property, etc.)")
    Project: str = Field(default="", description="Proyecto al que pertenece")
    Namespace: str = Field(default="", description="Namespace del elemento")
    Accessibility: str = Field(default="", description="Nivel de acceso (public, private, etc.)")
    IsAbstract: bool = Field(default=False)
    IsStatic: bool = Field(default=False)
    IsSealed: bool = Field(default=False)
    Location: Optional[Dict[str, Any]] = None
    Attributes: Optional[Dict[str, Any]] = None
    
    class Config:
        populate_by_name = True
        extra = "allow"  # Permitir campos adicionales


class GraphEdge(BaseModel):
    """Representa una arista (relación) entre nodos del grafo."""
    Id: str = Field(..., alias="_id", description="Identificador único de la arista")
    Source: str = Field(..., description="Nodo origen")
    Target: str = Field(..., description="Nodo destino")
    Relationship: str = Field(..., description="Tipo de relación (Contains, Uses, Inherits, etc.)")
    Strength: float = Field(default=1.0, description="Fuerza de la relación")
    Count: int = Field(default=1, description="Número de veces que ocurre la relación")
    Attributes: EdgeAttributes = Field(default_factory=EdgeAttributes)
    
    class Config:
        populate_by_name = True


class ProjectInfo(BaseModel):
    """Representa un proyecto en el grafo."""
    MongoId: Optional[str] = Field(None, alias="_id", description="ID de MongoDB")
    ProjectId: str = Field(..., alias="Id", description="ID del proyecto")
    ProjectName: str = Field(..., alias="Name", description="Nombre del proyecto")
    Layer: str = Field(default="", description="Capa arquitectónica")
    NodeCount: int = Field(default=0, description="Cantidad de nodos")
    EdgeCount: int = Field(default=0, description="Cantidad de aristas")
    ContentHash: str = Field(default="", description="Hash del contenido para detección de cambios")
    LastProcessed: datetime = Field(default_factory=datetime.utcnow)
    LastModified: datetime = Field(default_factory=datetime.utcnow)
    SourceFile: str = Field(default="", description="Archivo fuente")
    SourceDirectory: str = Field(default="", description="Directorio fuente")
    ProcessingStateId: Optional[str] = Field(None, description="Reference to ProcessingState ObjectId")
    Nodes: List[GraphNode] = Field(default_factory=list)
    Edges: List[GraphEdge] = Field(default_factory=list)

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ProjectSummary(BaseModel):
    """Resumen de un proyecto (sin nodos/aristas para consultas ligeras)."""
    MongoId: Optional[str] = Field(None, alias="_id")
    ProjectId: str
    ProjectName: str
    Layer: str
    NodeCount: int
    EdgeCount: int
    LastProcessed: datetime
    SourceFile: str
    Version: Optional[str] = None

    class Config:
        populate_by_name = True


class SearchNodesRequest(BaseModel):
    """Request para búsqueda de nodos."""
    query: str = Field(..., description="Texto a buscar en nombre o fullName")
    nodeType: Optional[str] = Field(None, description="Filtrar por tipo de nodo")
    project: Optional[str] = Field(None, description="Filtrar por proyecto")
    namespace: Optional[str] = Field(None, description="Filtrar por namespace")
    version: Optional[str] = Field(None, description="Filtrar por versión del grafo (e.g., '1.0.0')")
    limit: int = Field(default=50, ge=1, le=500, description="Límite de resultados")


class SearchProjectsRequest(BaseModel):
    """Request para búsqueda de proyectos."""
    query: Optional[str] = Field(None, description="Texto a buscar en nombre de proyecto")
    layer: Optional[str] = Field(None, description="Filtrar por capa arquitectónica")
    version: Optional[str] = Field(None, description="Filtrar por versión del grafo (e.g., '1.0.0')")
    limit: int = Field(default=50, ge=1, le=200)


class GetRelatedNodesRequest(BaseModel):
    """Request para obtener nodos relacionados."""
    nodeId: str = Field(..., description="ID del nodo")
    relationshipType: Optional[str] = Field(None, description="Tipo de relación a seguir")
    direction: str = Field(default="both", description="Dirección: 'incoming', 'outgoing', 'both'")
    maxDepth: int = Field(default=1, ge=1, le=3, description="Profundidad máxima de búsqueda")


class CodeContextRequest(BaseModel):
    """Request para obtener contexto de código para el MCP."""
    relativePath: Optional[str] = Field(None, description="Ruta relativa del archivo")
    absolutePath: Optional[str] = Field(None, description="Ruta absoluta del archivo (fallback)")
    className: Optional[str] = Field(None, description="Nombre de la clase")
    methodName: Optional[str] = Field(None, description="Nombre del método")
    namespace: Optional[str] = Field(None, description="Namespace")
    projectName: Optional[str] = Field(None, description="Nombre del proyecto")
    version: Optional[str] = Field(None, description="Filtrar por versión del grafo (e.g., '1.0.0')")
    includeRelated: bool = Field(default=True, description="Incluir elementos relacionados")
    maxRelated: int = Field(default=10, ge=1, le=50)
    maxDepth: int = Field(default=2, ge=1, le=5, description="Profundidad máxima de relaciones")


class CodeContextResponse(BaseModel):
    """Response con contexto de código."""
    found: bool
    mainElement: Optional[GraphNode] = None
    relatedElements: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    projectInfo: Optional[ProjectSummary] = None
    suggestions: List[str] = Field(default_factory=list, description="Sugerencias basadas en el contexto")


# ============================================================================
# SEMANTIC MODEL REQUESTS/RESPONSES
# ============================================================================

class SemanticRelationshipRequest(BaseModel):
    """Request para obtener relaciones semánticas específicas."""
    limit: int = Field(default=100, ge=1, le=500, description="Límite de resultados")
    projectId: Optional[str] = Field(None, description="Filtrar por proyecto específico")


class ClassHierarchyRequest(BaseModel):
    """Request para obtener jerarquía de una clase."""
    classId: str = Field(..., description="ID de la clase")
    maxDepth: int = Field(default=5, ge=1, le=10, description="Profundidad máxima de búsqueda")


class InterfaceImplementationsRequest(BaseModel):
    """Request para obtener implementaciones de una interfaz."""
    interfaceId: str = Field(..., description="ID de la interfaz")


class ProcessingState(BaseModel):
    """Estado de procesamiento de un archivo de grafo."""
    MongoId: Optional[str] = Field(None, alias="_id")
    SourceFile: str
    SourceDirectory: str
    FileHash: str
    LastProcessed: datetime
    FileLastModified: datetime
    FileSize: int
    Version: Optional[str] = None
    TotalProjects: int
    ProcessedProjects: int
    SkippedProjects: int
    NewProjects: int
    UpdatedProjects: int

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

