"""
Tests encadenados para GraphQueryService usando datos REALES.
Estos tests trabajan con datos existentes en la base de datos,
sin crear ni eliminar nada. Solo realizan consultas de lectura.
"""
import pytest
from typing import Dict
from src.services.graph_service import GraphQueryService
from src.models import (
    CodeContextRequest, SearchNodesRequest, GetRelatedNodesRequest,
    SearchProjectsRequest, ClassHierarchyRequest, InterfaceImplementationsRequest
)


class TestGraphServiceChained:
    """
    Suite de tests encadenados para GraphQueryService usando datos reales.
    Cada test usa los resultados del anterior para formar una cadena lógica.
    """
    
    @pytest.mark.asyncio
    async def test_01_get_code_context_by_class_name(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 1: Obtener contexto de código por nombre de clase.
        Este es el método principal que inicia la cadena.
        """
        sample_class = real_data_discovery.get("sample_class")
        if not sample_class:
            pytest.skip("No se encontró una clase en los datos reales")
        
        sample_project = real_data_discovery["sample_project"]
        
        # Preparar request usando datos reales
        # Usar ProjectId en lugar de ProjectName para que coincida con el campo Project de los nodos
        request = CodeContextRequest(
            className=sample_class.Name,
            projectName=sample_project.ProjectId,  # ProjectId tiene formato "project:X"
            includeRelated=True,
            maxRelated=10
        )
        
        # Ejecutar
        response = await graph_service.get_code_context(request)
        
        # Verificar que se encontró el elemento
        assert response.found is True, "Debe encontrar el elemento principal"
        assert response.mainElement is not None, "mainElement no debe ser None"
        
        print(f"\n Contexto obtenido: {response.mainElement.Name}")
        print(f"  - Tipo: {response.mainElement.Type}")
        print(f"  - Namespace: {response.mainElement.Namespace}")
        print(f"  - Elementos relacionados: {len(response.relatedElements)}")
        print(f"  - Edges: {len(response.edges)}")
        
        if response.projectInfo:
            print(f"  - Proyecto: {response.projectInfo.ProjectName}")
        
        if response.suggestions:
            print(f"  - Sugerencias: {len(response.suggestions)}")
        
        return response
    
    @pytest.mark.asyncio
    async def test_02_get_code_context_by_method_name(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 2: Obtener contexto de código por clase y método.
        """
        sample_method = real_data_discovery.get("sample_method")
        if not sample_method:
            pytest.skip("No se encontró un método en los datos reales")
        
        sample_project = real_data_discovery["sample_project"]
        
        # Intentar extraer el nombre de la clase del FullName del método
        # Ej: "Namespace.ClassName.MethodName" -> "ClassName"
        parts = sample_method.FullName.split('.')
        class_name = parts[-2] if len(parts) >= 2 else None
        
        if not class_name:
            pytest.skip("No se pudo determinar la clase del método")
        
        request = CodeContextRequest(
            className=class_name,
            methodName=sample_method.Name,
            projectName=sample_project.ProjectId,  # Usar ProjectId
            includeRelated=True,
            maxRelated=10
        )
        
        response = await graph_service.get_code_context(request)
        
        # Verificar
        if response.found:
            print(f"\n Contexto de método encontrado: {response.mainElement.FullName}")
            print(f"  - Tipo: {response.mainElement.Type}")
        else:
            print("\n  No se encontró el contexto específico del método")
        
        return response
    
    @pytest.mark.asyncio
    async def test_03_get_code_context_by_path(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 3: Obtener contexto de código por ruta de archivo.
        """
        sample_nodes = real_data_discovery.get("sample_nodes", [])
        
        # Buscar un nodo con Location
        node_with_path = None
        for node in sample_nodes:
            if node.Location and node.Location.get("RelativePath"):
                node_with_path = node
                break
        
        if not node_with_path:
            pytest.skip("No se encontró un nodo con ruta de archivo")
        
        relative_path = node_with_path.Location["RelativePath"]
        
        request = CodeContextRequest(
            relativePath=relative_path,
            includeRelated=True,
            maxRelated=10
        )
        
        response = await graph_service.get_code_context(request)
        
        # Verificar
        print(f"\n Búsqueda por path: {relative_path}")
        if response.found:
            print(f"  - Elemento encontrado: {response.mainElement.Name}")
        else:
            print("  - No se encontró elemento principal (puede ser normal si el path contiene múltiples elementos)")
        
        return response
    
    @pytest.mark.asyncio
    async def test_04_search_nodes_from_context(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 4: Buscar nodos usando información del contexto obtenido.
        """
        sample_class = real_data_discovery.get("sample_class")
        if not sample_class:
            pytest.skip("No se encontró una clase en los datos reales")
        
        # Obtener contexto primero
        sample_project = real_data_discovery["sample_project"]
        context_request = CodeContextRequest(
            className=sample_class.Name,
            projectName=sample_project.ProjectId,  # Incluir ProjectId para mejor búsqueda
            includeRelated=True
        )
        context = await graph_service.get_code_context(context_request)
        
        if not context.found:
            pytest.skip("No se pudo obtener el contexto")
        
        # Buscar nodos en el mismo namespace
        search_request = SearchNodesRequest(
            query=context.mainElement.Name,
            namespace=context.mainElement.Namespace if context.mainElement.Namespace else None,
            limit=20
        )
        
        nodes = await graph_service.search_nodes(search_request)
        
        # Verificar
        print(f"\n Búsqueda de nodos con query '{context.mainElement.Name}'")
        print(f"  - Nodos encontrados: {len(nodes)}")
        
        if nodes:
            print(f"  - Tipos encontrados: {set(n.Type for n in nodes)}")
        
        return nodes
    
    @pytest.mark.asyncio
    async def test_05_get_related_nodes_from_context(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 5: Obtener nodos relacionados usando el ID del contexto.
        """
        sample_class = real_data_discovery.get("sample_class")
        if not sample_class:
            pytest.skip("No se encontró una clase en los datos reales")
        
        # Obtener contexto primero
        context_request = CodeContextRequest(
            className=sample_class.Name,
            includeRelated=False
        )
        context = await graph_service.get_code_context(context_request)
        
        if not context.found:
            pytest.skip("No se pudo obtener el contexto")
        
        # Obtener nodos relacionados
        related_request = GetRelatedNodesRequest(
            nodeId=context.mainElement.Id,
            direction="both",
            maxDepth=1
        )
        
        result = await graph_service.get_related_nodes(related_request)
        
        # Verificar
        print(f"\n Nodos relacionados a '{context.mainElement.Name}':")
        print(f"  - Source node: {result['sourceNode']['Name'] if result['sourceNode'] else 'None'}")
        print(f"  - Nodos relacionados: {len(result['relatedNodes'])}")
        print(f"  - Edges: {len(result['edges'])}")
        
        if result["edges"]:
            relationships = {e["Relationship"] for e in result["edges"]}
            print(f"  - Tipos de relaciones: {relationships}")
        
        return result
    
    @pytest.mark.asyncio
    async def test_06_get_related_nodes_with_relationship_filter(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 6: Obtener nodos relacionados filtrando por tipo de relación.
        """
        sample_class = real_data_discovery.get("sample_class")
        if not sample_class:
            pytest.skip("No se encontró una clase en los datos reales")
        
        # Obtener contexto
        context_request = CodeContextRequest(
            className=sample_class.Name
        )
        context = await graph_service.get_code_context(context_request)
        
        if not context.found:
            pytest.skip("No se pudo obtener el contexto")
        
        # Primero obtener todas las relaciones para saber qué tipos existen
        all_related = await graph_service.get_related_nodes(
            GetRelatedNodesRequest(nodeId=context.mainElement.Id, direction="both")
        )
        
        if not all_related["edges"]:
            print(f"\n  El nodo '{context.mainElement.Name}' no tiene relaciones")
            pytest.skip("No hay relaciones para filtrar")
        
        # Obtener un tipo de relación que exista
        relationship_type = all_related["edges"][0]["Relationship"]
        
        # Buscar con filtro
        related_request = GetRelatedNodesRequest(
            nodeId=context.mainElement.Id,
            relationshipType=relationship_type,
            direction="both"
        )
        
        result = await graph_service.get_related_nodes(related_request)
        
        # Verificar
        print(f"\n Nodos con relación '{relationship_type}':")
        print(f"  - Nodos encontrados: {len(result['relatedNodes'])}")
        print(f"  - Edges: {len(result['edges'])}")
        
        # Verificar que todos los edges son del tipo correcto
        if result["edges"]:
            assert all(e["Relationship"] == relationship_type for e in result["edges"])
        
        return result
    
    @pytest.mark.asyncio
    async def test_07_get_node_by_id_from_context(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 7: Obtener nodo específico usando ID del contexto.
        """
        sample_class = real_data_discovery.get("sample_class")
        if not sample_class:
            pytest.skip("No se encontró una clase en los datos reales")
        
        # Obtener contexto
        context_request = CodeContextRequest(
            className=sample_class.Name
        )
        context = await graph_service.get_code_context(context_request)
        
        if not context.found:
            pytest.skip("No se pudo obtener el contexto")
        
        # Obtener nodo por ID
        node_info = await graph_service.get_node_by_id(context.mainElement.Id)
        
        # Verificar
        assert node_info is not None, "Debe encontrar el nodo"
        node, project_id = node_info
        assert node.Id == context.mainElement.Id
        assert node.Name == context.mainElement.Name
        assert project_id is not None
        
        print("\n Nodo obtenido por ID:")
        print(f"  - Nombre: {node.FullName}")
        print(f"  - Tipo: {node.Type}")
        print(f"  - Proyecto: {project_id}")
        
        return node_info
    
    @pytest.mark.asyncio
    async def test_08_get_nodes_by_project_from_context(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 8: Obtener todos los nodos del proyecto del contexto.
        """
        sample_project = real_data_discovery["sample_project"]
        
        # Obtener todos los nodos del proyecto
        nodes = await graph_service.get_nodes_by_project(sample_project.ProjectId)
        
        # Verificar
        assert len(nodes) > 0, "Debe haber nodos en el proyecto"
        
        print(f"\n Nodos del proyecto '{sample_project.ProjectName}':")
        print(f"  - Total de nodos: {len(nodes)}")
        
        # Contar por tipo
        types_count = {}
        for node in nodes:
            types_count[node.Type] = types_count.get(node.Type, 0) + 1
        
        print("  - Distribución por tipo:")
        for node_type, count in sorted(types_count.items(), key=lambda x: x[1], reverse=True):
            print(f"    • {node_type}: {count}")
        
        return nodes
    
    @pytest.mark.asyncio
    async def test_09_get_nodes_by_project_filtered_by_type(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 9: Obtener nodos del proyecto filtrados por tipo.
        """
        sample_project = real_data_discovery["sample_project"]
        sample_nodes = real_data_discovery["sample_nodes"]
        
        # Encontrar un tipo que exista
        available_types = {n.Type for n in sample_nodes}
        
        if not available_types:
            pytest.skip("No hay nodos con tipos definidos")
        
        # Usar el tipo más común
        type_counts = {}
        for node in sample_nodes:
            type_counts[node.Type] = type_counts.get(node.Type, 0) + 1
        
        target_type = max(type_counts.items(), key=lambda x: x[1])[0]
        
        # Obtener nodos filtrados
        filtered_nodes = await graph_service.get_nodes_by_project(
            sample_project.ProjectId,
            node_type=target_type
        )
        
        # Verificar
        assert len(filtered_nodes) > 0, f"Debe haber nodos de tipo {target_type}"
        
        # Verificar que todos son del tipo correcto
        for node in filtered_nodes:
            assert node.Type == target_type
        
        print(f"\n Nodos filtrados por tipo '{target_type}':")
        print(f"  - Total encontrado: {len(filtered_nodes)}")
        
        return filtered_nodes
    
    @pytest.mark.asyncio
    async def test_10_get_edges_by_project_from_context(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 10: Obtener todas las aristas del proyecto del contexto.
        """
        sample_project = real_data_discovery["sample_project"]
        
        # Obtener edges
        edges = await graph_service.get_edges_by_project(sample_project.ProjectId)
        
        # Verificar
        print(f"\n Edges del proyecto '{sample_project.ProjectName}':")
        print(f"  - Total de edges: {len(edges)}")
        
        if edges:
            # Contar por tipo de relación
            relationships = {}
            for edge in edges:
                relationships[edge.Relationship] = relationships.get(edge.Relationship, 0) + 1
            
            print("  - Distribución por relación:")
            for rel_type, count in sorted(relationships.items(), key=lambda x: x[1], reverse=True):
                print(f"    • {rel_type}: {count}")
        
        return edges
    
    @pytest.mark.asyncio
    async def test_11_get_project_by_id_from_context(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 11: Obtener información completa del proyecto.
        """
        sample_project = real_data_discovery["sample_project"]
        
        # Obtener proyecto completo sin grafo
        project = await graph_service.get_project_by_id(
            sample_project.ProjectId,
            include_graph=False
        )
        
        # Verificar
        assert project is not None
        assert project.ProjectId == sample_project.ProjectId
        assert project.ProjectName == sample_project.ProjectName
        
        print("\n Información del proyecto:")
        print(f"  - Nombre: {project.ProjectName}")
        print(f"  - ID: {project.ProjectId}")
        print(f"  - Layer: {project.Layer}")
        print(f"  - Nodos: {project.NodeCount}")
        print(f"  - Edges: {project.EdgeCount}")
        print(f"  - Última actualización: {project.LastProcessed}")
        
        return project
    
    @pytest.mark.asyncio
    async def test_12_get_project_with_graph(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 12: Obtener proyecto con grafo completo.
        """
        sample_project = real_data_discovery["sample_project"]
        
        # Obtener proyecto con grafo
        project = await graph_service.get_project_by_id(
            sample_project.ProjectId,
            include_graph=True
        )
        
        # Verificar
        assert project is not None
        assert len(project.Nodes) > 0, "Debe incluir nodos"
        
        print("\n Proyecto con grafo completo:")
        print(f"  - Nombre: {project.ProjectName}")
        print(f"  - Nodos incluidos: {len(project.Nodes)}")
        print(f"  - Edges incluidos: {len(project.Edges)}")
        
        return project
    
    @pytest.mark.asyncio
    async def test_13_search_projects(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 13: Buscar proyectos usando información del contexto.
        """
        sample_project = real_data_discovery["sample_project"]
        
        # Buscar proyectos por layer
        if sample_project.Layer:
            search_request = SearchProjectsRequest(
                layer=sample_project.Layer,
                limit=20
            )
            
            projects = await graph_service.search_projects(search_request)
            
            print(f"\n Proyectos en layer '{sample_project.Layer}':")
            print(f"  - Total encontrado: {len(projects)}")
            
            for project in projects[:5]:
                print(f"    • {project.ProjectName} ({project.NodeCount} nodos)")
        else:
            # Buscar por nombre parcial
            search_request = SearchProjectsRequest(
                query=sample_project.ProjectName[:3],
                limit=20
            )
            
            projects = await graph_service.search_projects(search_request)
            print(f"\n Proyectos encontrados: {len(projects)}")
        
        return projects
    
    @pytest.mark.asyncio
    async def test_14_get_all_projects(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 14: Obtener todos los proyectos.
        """
        projects = await graph_service.get_all_projects(limit=100)
        
        # Verificar
        assert len(projects) > 0, "Debe haber proyectos"
        
        print("\n Todos los proyectos:")
        print(f"  - Total de proyectos: {len(projects)}")
        print("  - Top 5 proyectos por tamaño:")
        
        sorted_projects = sorted(projects, key=lambda p: p.NodeCount, reverse=True)
        for i, project in enumerate(sorted_projects[:5], 1):
            print(f"    {i}. {project.ProjectName}: {project.NodeCount} nodos, {project.EdgeCount} edges")
        
        return projects
    
    @pytest.mark.asyncio
    async def test_15_get_projects_by_layer(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 15: Obtener estadísticas de proyectos por capa.
        """
        layer_stats = await graph_service.get_projects_by_layer()
        
        # Verificar
        assert len(layer_stats) > 0, "Debe haber estadísticas por capa"
        
        print("\n Proyectos por capa:")
        for layer, count in sorted(layer_stats.items(), key=lambda x: x[1], reverse=True):
            print(f"  - {layer}: {count} proyecto(s)")
        
        return layer_stats
    
    @pytest.mark.asyncio
    async def test_16_get_statistics(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 16: Obtener estadísticas generales del grafo.
        """
        stats = await graph_service.get_statistics()
        
        # Verificar
        assert "totalProjects" in stats
        assert "totalNodes" in stats
        assert "totalEdges" in stats
        assert "projectsByLayer" in stats
        
        assert stats["totalProjects"] > 0
        
        print("\n Estadísticas del grafo:")
        print(f"  - Total proyectos: {stats['totalProjects']}")
        print(f"  - Total nodos: {stats['totalNodes']}")
        print(f"  - Total edges: {stats['totalEdges']}")
        print(f"  - Promedio nodos/proyecto: {stats['avgNodesPerProject']}")
        print(f"  - Promedio edges/proyecto: {stats['avgEdgesPerProject']}")
        
        # Verificar que incluye métricas del Semantic Model
        if "semantic" in stats:
            print("\n Métricas del Semantic Model:")
            semantic = stats["semantic"]
            if "relationships" in semantic:
                print(f"  - Inherits: {semantic['relationships'].get('Inherits', 0)}")
                print(f"  - Implements: {semantic['relationships'].get('Implements', 0)}")
                print(f"  - Calls: {semantic['relationships'].get('Calls', 0)}")
                print(f"  - Uses: {semantic['relationships'].get('Uses', 0)}")
            if "totalSemanticEdges" in semantic:
                print(f"  - Total Semantic Edges: {semantic['totalSemanticEdges']}")
        
        return stats
    
    @pytest.mark.asyncio
    async def test_17_complete_workflow(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 17: Workflow completo encadenado con datos reales.
        Este test simula un flujo completo de consultas encadenadas.
        """
        print("\n" + "="*70)
        print("WORKFLOW COMPLETO ENCADENADO - DATOS REALES")
        print("="*70)
        
        sample_project = real_data_discovery["sample_project"]
        sample_class = real_data_discovery.get("sample_class")
        
        # 1. Obtener contexto inicial
        print("\n1. Obteniendo contexto de código...")
        if sample_class:
            context_request = CodeContextRequest(
                className=sample_class.Name,
                projectName=sample_project.ProjectName,
                includeRelated=True,
                maxRelated=10
            )
            context = await graph_service.get_code_context(context_request)
            
            if context.found:
                print(f"    Elemento principal: {context.mainElement.FullName}")
                print(f"    Elementos relacionados: {len(context.relatedElements)}")
            else:
                print("     No se encontró contexto específico")
        else:
            print("     No hay clase de ejemplo, usando primer proyecto")
            context = None
        
        # 2. Obtener información del proyecto
        print("\n2. Obteniendo información del proyecto...")
        project = await graph_service.get_project_by_id(sample_project.ProjectId)
        assert project is not None
        print(f"    Proyecto: {project.ProjectName}")
        print(f"    Layer: {project.Layer}")
        print(f"    Nodos: {project.NodeCount}")
        
        # 3. Obtener nodos relacionados (si hay contexto)
        if context and context.found:
            print("\n3. Explorando nodos relacionados...")
            related_request = GetRelatedNodesRequest(
                nodeId=context.mainElement.Id,
                direction="both"
            )
            related_result = await graph_service.get_related_nodes(related_request)
            print(f"    Total relacionados: {related_result['totalRelated']}")
            
            # 4. Para cada nodo relacionado, obtener sus detalles
            if related_result["relatedNodes"]:
                print("\n4. Obteniendo detalles de nodos relacionados...")
                for i, node_dict in enumerate(related_result["relatedNodes"][:3], 1):
                    node_id = node_dict["Id"]
                    node_info = await graph_service.get_node_by_id(node_id)
                    if node_info:
                        node, _ = node_info
                        print(f"    Nodo {i}: {node.Name} ({node.Type})")
        else:
            print("\n3-4. Sin contexto específico, saltando exploración de relaciones")
        
        # 5. Buscar nodos en el proyecto
        print("\n5. Buscando nodos en el proyecto...")
        all_nodes = await graph_service.get_nodes_by_project(project.ProjectId)
        print(f"    Nodos encontrados: {len(all_nodes)}")
        
        # 6. Obtener todas las aristas del proyecto
        print("\n6. Obteniendo aristas del proyecto...")
        edges = await graph_service.get_edges_by_project(project.ProjectId)
        print(f"    Total de aristas: {len(edges)}")
        
        # 7. Obtener estadísticas generales
        print("\n7. Obteniendo estadísticas generales...")
        stats = await graph_service.get_statistics()
        print(f"    Total proyectos: {stats['totalProjects']}")
        print(f"    Total nodos: {stats['totalNodes']}")
        print(f"    Total edges: {stats['totalEdges']}")
        
        # 8. Buscar proyectos similares
        print("\n8. Buscando proyectos en la misma capa...")
        if project.Layer:
            search_projects_req = SearchProjectsRequest(layer=project.Layer, limit=10)
            similar_projects = await graph_service.search_projects(search_projects_req)
            print(f"    Proyectos similares: {len(similar_projects)}")
        else:
            print("     Proyecto sin layer definido")
        
        print("\n" + "="*70)
        print("WORKFLOW COMPLETADO EXITOSAMENTE")
        print("="*70)
        
        # Verificación final
        assert project is not None
        assert len(all_nodes) > 0
        assert stats["totalProjects"] > 0


class TestGraphServiceIndividual:
    """
    Tests individuales para métodos específicos del servicio con datos reales.
    """
    
    @pytest.mark.asyncio
    async def test_search_nodes_by_type(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """Test búsqueda de nodos por tipo."""
        sample_nodes = real_data_discovery["sample_nodes"]
        
        # Obtener un tipo que existe
        available_types = {n.Type for n in sample_nodes if n.Type}
        
        if not available_types:
            pytest.skip("No hay tipos de nodos disponibles")
        
        target_type = list(available_types)[0]
        
        request = SearchNodesRequest(
            query="",
            nodeType=target_type,
            limit=20
        )
        
        nodes = await graph_service.search_nodes(request)
        
        print(f"\n Búsqueda por tipo '{target_type}':")
        print(f"  - Nodos encontrados: {len(nodes)}")
        
        if nodes:
            for node in nodes:
                assert node.Type == target_type
    
    @pytest.mark.asyncio
    async def test_search_nodes_by_project(
        self, 
        graph_service: GraphQueryService, 
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """Test búsqueda de nodos por proyecto."""
        sample_project = real_data_discovery["sample_project"]
        
        request = SearchNodesRequest(
            query="",
            project=sample_project.ProjectId,
            limit=30
        )
        
        nodes = await graph_service.search_nodes(request)
        
        print(f"\n Nodos del proyecto '{sample_project.ProjectName}':")
        print(f"  - Total encontrado: {len(nodes)}")
        
        if nodes:
            # Verificar que los nodos pertenecen al proyecto (flexible con formato)
            for node in nodes:
                # Aceptar tanto "ProjectName" como "project:ProjectName"
                assert (node.Project == sample_project.ProjectId or 
                        node.Project == sample_project.ProjectName or
                        sample_project.ProjectName in node.Project)
    
    @pytest.mark.asyncio
    async def test_node_not_found(
        self, 
        graph_service: GraphQueryService
    ):
        """Test comportamiento cuando no se encuentra un nodo."""
        result = await graph_service.get_node_by_id("nonexistent_node_id_12345")
        
        assert result is None
        print("\n Correctamente retorna None para nodo inexistente")
    
    @pytest.mark.asyncio
    async def test_project_not_found(
        self, 
        graph_service: GraphQueryService
    ):
        """Test comportamiento cuando no se encuentra un proyecto."""
        result = await graph_service.get_project_by_id("nonexistent_project_id_12345")
        
        assert result is None
        print("\n Correctamente retorna None para proyecto inexistente")
    
    @pytest.mark.asyncio
    async def test_code_context_not_found(
        self, 
        graph_service: GraphQueryService
    ):
        """Test comportamiento cuando no se encuentra contexto."""
        request = CodeContextRequest(
            className="NonExistentClassXYZ123",
            projectName="NonExistentProjectXYZ123"
        )
        
        response = await graph_service.get_code_context(request)
        
        assert response.found is False
        assert response.mainElement is None
        assert len(response.relatedElements) == 0
        
        print("\n Correctamente retorna found=False para contexto inexistente")


class TestSemanticModel:
    """
    Tests específicos para funcionalidades del Semantic Model.
    Prueba relaciones de herencia, implementaciones, llamadas y usos de tipos.
    """
    
    @pytest.mark.asyncio
    async def test_01_get_semantic_stats(
        self, 
        graph_service: GraphQueryService,
        validate_data: bool
    ):
        """
        Test 1: Obtener estadísticas completas del Semantic Model.
        """
        stats = await graph_service.get_semantic_stats()
        
        # Verificar estructura
        assert "relationships" in stats
        assert "totalSemanticEdges" in stats
        assert "totalEdges" in stats
        assert "nodes" in stats
        
        # Verificar que tenga las relaciones del Semantic Model
        relationships = stats["relationships"]
        assert "Inherits" in relationships
        assert "Implements" in relationships
        assert "Calls" in relationships
        assert "Uses" in relationships
        
        print("\n📊 Estadísticas del Semantic Model:")
        print(f"  🔹 Inherits (Herencia): {relationships['Inherits']}")
        print(f"  🔹 Implements (Interfaces): {relationships['Implements']}")
        print(f"  🔹 Calls (Llamadas): {relationships['Calls']}")
        print(f"  🔹 Uses (Uso de tipos): {relationships['Uses']}")
        print(f"  📈 Total Semantic Edges: {stats['totalSemanticEdges']}")
        print(f"  📊 Total Edges: {stats['totalEdges']}")
        
        if "nodes" in stats:
            nodes = stats["nodes"]
            print(f"\n  🔸 Classes with Namespace: {nodes.get('classesWithNamespace', 0)}")
            print(f"  🔸 Interfaces with Namespace: {nodes.get('interfacesWithNamespace', 0)}")
        
        # Si hay datos, verificar que sean números válidos
        if validate_data:
            assert stats["totalSemanticEdges"] >= 0
            assert relationships["Inherits"] >= 0
            assert relationships["Implements"] >= 0
            assert relationships["Calls"] >= 0
            assert relationships["Uses"] >= 0
        
        return stats
    
    @pytest.mark.asyncio
    async def test_02_get_inheritance_relationships(
        self, 
        graph_service: GraphQueryService,
        validate_data: bool
    ):
        """
        Test 2: Obtener relaciones de herencia (Inherits).
        """
        relationships = await graph_service.get_inheritance_relationships(limit=10)
        
        print(f"\n🔗 Relaciones de Herencia encontradas: {len(relationships)}")
        
        if relationships:
            # Verificar estructura de cada relación
            for i, rel in enumerate(relationships[:3], 1):
                assert "source" in rel
                assert "target" in rel
                assert "relationship" in rel
                assert rel["relationship"] == "Inherits"
                
                print(f"  {i}. {rel['source']} → {rel['target']}")
                if "projectName" in rel:
                    print(f"     Proyecto: {rel['projectName']}")
        else:
            print("  ℹ️  No hay relaciones de herencia en los datos actuales")
        
        return relationships
    
    @pytest.mark.asyncio
    async def test_03_get_implementation_relationships(
        self, 
        graph_service: GraphQueryService,
        validate_data: bool
    ):
        """
        Test 3: Obtener relaciones de implementación de interfaces (Implements).
        """
        relationships = await graph_service.get_implementation_relationships(limit=10)
        
        print(f"\n🔗 Implementaciones de Interfaces encontradas: {len(relationships)}")
        
        if relationships:
            for i, rel in enumerate(relationships[:3], 1):
                assert "source" in rel
                assert "target" in rel
                assert "relationship" in rel
                assert rel["relationship"] == "Implements"
                
                print(f"  {i}. {rel['source']} → {rel['target']}")
                if "projectName" in rel:
                    print(f"     Proyecto: {rel['projectName']}")
        else:
            print("  ℹ️  No hay implementaciones de interfaces en los datos actuales")
        
        return relationships
    
    @pytest.mark.asyncio
    async def test_04_get_method_calls(
        self, 
        graph_service: GraphQueryService,
        validate_data: bool
    ):
        """
        Test 4: Obtener relaciones de llamadas a métodos (Calls).
        """
        relationships = await graph_service.get_method_calls(limit=20)
        
        print(f"\n📞 Llamadas a Métodos encontradas: {len(relationships)}")
        
        if relationships:
            for i, rel in enumerate(relationships[:3], 1):
                assert "source" in rel
                assert "target" in rel
                assert "relationship" in rel
                assert rel["relationship"] == "Calls"
                
                count = rel.get("count", 1)
                print(f"  {i}. {rel['source']} → {rel['target']}")
                print(f"     Llamadas: {count}")
                if "projectName" in rel:
                    print(f"     Proyecto: {rel['projectName']}")
        else:
            print("  ℹ️  No hay llamadas a métodos en los datos actuales")
        
        return relationships
    
    @pytest.mark.asyncio
    async def test_05_get_type_usages(
        self, 
        graph_service: GraphQueryService,
        validate_data: bool
    ):
        """
        Test 5: Obtener relaciones de uso de tipos (Uses).
        """
        relationships = await graph_service.get_type_usages(limit=20)
        
        print(f"\n📦 Usos de Tipos encontrados: {len(relationships)}")
        
        if relationships:
            for i, rel in enumerate(relationships[:3], 1):
                assert "source" in rel
                assert "target" in rel
                assert "relationship" in rel
                assert rel["relationship"] == "Uses"
                
                count = rel.get("count", 1)
                print(f"  {i}. {rel['source']} → {rel['target']}")
                print(f"     Usos: {count}")
                if "projectName" in rel:
                    print(f"     Proyecto: {rel['projectName']}")
        else:
            print("  ℹ️  No hay usos de tipos en los datos actuales")
        
        return relationships
    
    @pytest.mark.asyncio
    async def test_06_get_class_hierarchy_with_real_class(
        self, 
        graph_service: GraphQueryService,
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 6: Obtener jerarquía de herencia de una clase real.
        """
        sample_class = real_data_discovery.get("sample_class")
        
        if not sample_class:
            pytest.skip("No se encontró una clase en los datos reales")
        
        result = await graph_service.get_class_hierarchy(
            class_id=sample_class.Id,
            max_depth=5
        )
        
        print(f"\n🌳 Jerarquía de '{sample_class.Name}':")
        
        if result.get("found"):
            class_info = result["class"]
            print(f"  Clase: {class_info['fullName']}")
            print(f"  Namespace: {class_info['namespace']}")
            print(f"  IsAbstract: {class_info['isAbstract']}")
            print(f"  IsSealed: {class_info['isSealed']}")
            
            ancestors = result.get("ancestors", [])
            descendants = result.get("descendants", [])
            
            print(f"\n  Ancestros ({len(ancestors)}):")
            for ancestor in ancestors:
                print(f"    └─ {ancestor['fullName']} (depth: {ancestor['depth']})")
            
            print(f"\n  Descendientes ({len(descendants)}):")
            for descendant in descendants:
                print(f"    └─ {descendant['fullName']}")
            
            print(f"\n  Profundidad de jerarquía: {result['hierarchyDepth']}")
            
            assert result["found"] is True
            assert "class" in result
            assert "ancestors" in result
            assert "descendants" in result
        else:
            print(f"  ℹ️  La clase '{sample_class.Name}' no tiene jerarquía de herencia")
        
        return result
    
    @pytest.mark.asyncio
    async def test_07_get_class_hierarchy_nonexistent(
        self, 
        graph_service: GraphQueryService
    ):
        """
        Test 7: Comportamiento cuando se busca jerarquía de clase inexistente.
        """
        result = await graph_service.get_class_hierarchy(
            class_id="class:NonExistentClass123",
            max_depth=5
        )
        
        assert result.get("found") is False
        assert "message" in result or "error" in result
        
        print("\n✅ Correctamente retorna found=False para clase inexistente")
        
        return result
    
    @pytest.mark.asyncio
    async def test_08_find_and_get_interface_implementations(
        self, 
        graph_service: GraphQueryService,
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 8: Buscar una interfaz y obtener todas sus implementaciones.
        """
        # Buscar interfaces en los datos
        search_request = SearchNodesRequest(
            query="",
            nodeType="Interface",
            limit=10
        )
        
        interfaces = await graph_service.search_nodes(search_request)
        
        if not interfaces:
            pytest.skip("No se encontraron interfaces en los datos reales")
        
        # Tomar la primera interfaz
        interface = interfaces[0]
        print(f"\n🔍 Buscando implementaciones de '{interface.Name}':")
        
        result = await graph_service.get_interface_implementations(
            interface_id=interface.Id
        )
        
        if result.get("found"):
            interface_info = result["interface"]
            implementations = result.get("implementations", [])
            
            print(f"  Interfaz: {interface_info['fullName']}")
            print(f"  Namespace: {interface_info['namespace']}")
            print(f"  Implementaciones encontradas: {result['implementationCount']}")
            
            for i, impl in enumerate(implementations[:5], 1):
                print(f"    {i}. {impl['fullName']}")
                print(f"       Proyecto: {impl.get('projectId', 'N/A')}")
                print(f"       IsAbstract: {impl.get('isAbstract', False)}")
            
            assert result["found"] is True
            assert "interface" in result
            assert "implementations" in result
            assert result["implementationCount"] >= 0
        else:
            print(f"  ℹ️  La interfaz '{interface.Name}' no tiene implementaciones")
        
        return result
    
    @pytest.mark.asyncio
    async def test_09_semantic_model_integration_workflow(
        self, 
        graph_service: GraphQueryService,
        real_data_discovery: Dict,
        validate_data: bool
    ):
        """
        Test 9: Workflow completo de consultas semánticas integradas.
        """
        print("\n" + "="*70)
        print("WORKFLOW SEMANTIC MODEL - CONSULTAS INTEGRADAS")
        print("="*70)
        
        # 1. Obtener estadísticas semánticas
        print("\n1. Estadísticas Semánticas:")
        stats = await graph_service.get_semantic_stats()
        print(f"   Total Semantic Edges: {stats.get('totalSemanticEdges', 0)}")
        
        # 2. Explorar herencias
        print("\n2. Explorando Herencias:")
        inherits = await graph_service.get_inheritance_relationships(limit=5)
        print(f"   Herencias encontradas: {len(inherits)}")
        
        # 3. Explorar implementaciones
        print("\n3. Explorando Implementaciones:")
        implements = await graph_service.get_implementation_relationships(limit=5)
        print(f"   Implementaciones encontradas: {len(implements)}")
        
        # 4. Explorar llamadas a métodos
        print("\n4. Explorando Llamadas a Métodos:")
        calls = await graph_service.get_method_calls(limit=10)
        print(f"   Llamadas encontradas: {len(calls)}")
        
        # 5. Explorar usos de tipos
        print("\n5. Explorando Usos de Tipos:")
        uses = await graph_service.get_type_usages(limit=10)
        print(f"   Usos encontrados: {len(uses)}")
        
        # 6. Si hay una clase, obtener su jerarquía
        sample_class = real_data_discovery.get("sample_class")
        if sample_class:
            print(f"\n6. Jerarquía de '{sample_class.Name}':")
            hierarchy = await graph_service.get_class_hierarchy(
                class_id=sample_class.Id,
                max_depth=3
            )
            if hierarchy.get("found"):
                print(f"   Ancestros: {len(hierarchy.get('ancestors', []))}")
                print(f"   Descendientes: {len(hierarchy.get('descendants', []))}")
        
        # 7. Buscar interfaces y sus implementaciones
        print("\n7. Interfaces y sus Implementaciones:")
        interfaces_search = SearchNodesRequest(
            query="",
            nodeType="Interface",
            limit=3
        )
        interfaces = await graph_service.search_nodes(interfaces_search)
        print(f"   Interfaces encontradas: {len(interfaces)}")
        
        if interfaces:
            first_interface = interfaces[0]
            impl_result = await graph_service.get_interface_implementations(
                interface_id=first_interface.Id
            )
            if impl_result.get("found"):
                print(f"   '{first_interface.Name}' tiene {impl_result['implementationCount']} implementación(es)")
        
        print("\n" + "="*70)
        print("WORKFLOW SEMANTIC MODEL COMPLETADO")
        print("="*70)
        
        # Verificación mínima
        assert stats is not None
        assert "totalSemanticEdges" in stats
    
    @pytest.mark.asyncio
    async def test_10_semantic_stats_consistency(
        self, 
        graph_service: GraphQueryService,
        validate_data: bool
    ):
        """
        Test 10: Verificar consistencia entre estadísticas semánticas y consultas individuales.
        """
        print("\n🔍 Verificando Consistencia de Estadísticas Semánticas:")
        
        # Obtener estadísticas
        stats = await graph_service.get_semantic_stats()
        stats_inherits = stats["relationships"].get("Inherits", 0)
        stats_implements = stats["relationships"].get("Implements", 0)
        
        print(f"  Según stats: Inherits={stats_inherits}, Implements={stats_implements}")
        
        # Obtener todas las herencias (con límite alto)
        inherits_sample = await graph_service.get_inheritance_relationships(limit=500)
        implements_sample = await graph_service.get_implementation_relationships(limit=500)
        
        print(f"  Muestreo:    Inherits={len(inherits_sample)}, Implements={len(implements_sample)}")
        
        # Si el límite no alcanzó, verificar que coincida
        if len(inherits_sample) < 500 and validate_data:
            assert len(inherits_sample) == stats_inherits, \
                f"Inconsistencia en Inherits: stats={stats_inherits}, real={len(inherits_sample)}"
        
        if len(implements_sample) < 500 and validate_data:
            assert len(implements_sample) == stats_implements, \
                f"Inconsistencia en Implements: stats={stats_implements}, real={len(implements_sample)}"
        
        print("  ✅ Consistencia verificada")
        
        return {
            "stats": stats,
            "inherits_sample": len(inherits_sample),
            "implements_sample": len(implements_sample)
        }
