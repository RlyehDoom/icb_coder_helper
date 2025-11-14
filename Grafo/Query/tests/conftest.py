"""
Configuración de fixtures para tests del GraphQueryService.
Los tests usan datos REALES de la base de datos, sin crear ni eliminar datos.
"""
import pytest
import asyncio
import os
from typing import AsyncGenerator, Optional, Dict, List
from dotenv import load_dotenv
from src.services.mongodb_service import MongoDBService, get_mongodb_service
from src.services.graph_service import GraphQueryService

# Cargar variables de entorno
load_dotenv()


@pytest.fixture(scope="session")
def event_loop():
    """Crea un event loop para toda la sesión de tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def mongodb_service() -> AsyncGenerator[MongoDBService, None]:
    """
    Fixture que proporciona un MongoDBService conectado a la base de datos real.
    Usa las variables de entorno del .env para conectarse.
    """
    service = get_mongodb_service()
    await service.connect()
    
    yield service
    
    await service.disconnect()


@pytest.fixture(scope="session")
async def graph_service(mongodb_service: MongoDBService) -> GraphQueryService:
    """Fixture que proporciona un GraphQueryService configurado."""
    return GraphQueryService(mongodb_service)


@pytest.fixture(scope="session")
async def real_data_discovery(graph_service: GraphQueryService) -> Dict:
    """
    Fixture que descubre datos reales en la base de datos para usar en los tests.
    No crea ni elimina datos, solo encuentra elementos existentes.
    """
    print("\nDescubriendo datos reales en la base de datos...")
    
    discovery = {
        "projects": [],
        "sample_project": None,
        "sample_class": None,
        "sample_method": None,
        "sample_nodes": [],
        "layers": {},
        "namespaces": set()
    }
    
    # 1. Obtener todos los proyectos
    projects = await graph_service.get_all_projects(limit=100)
    discovery["projects"] = projects
    
    if not projects:
        print("   ADVERTENCIA: No se encontraron proyectos en la base de datos")
        return discovery
    
    print(f"   Encontrados {len(projects)} proyectos")
    
    # 2. Seleccionar un proyecto rico en nodos Y métodos
    # Evaluar cada proyecto para encontrar el más completo
    best_project = None
    best_score = 0
    
    for project in projects[:20]:  # Solo evaluar los primeros 20 para no tardar mucho
        nodes = await graph_service.get_nodes_by_project(project.ProjectId)
        classes = [n for n in nodes if n.Type == "Class"]
        methods = [n for n in nodes if n.Type == "Method"]
        
        # Score: priorizar proyectos con buen balance de clases y métodos
        score = len(classes) + (len(methods) * 2)  # Métodos pesan el doble
        
        if score > best_score:
            best_score = score
            best_project = project
    
    sample_project = best_project if best_project else max(projects, key=lambda p: p.NodeCount)
    discovery["sample_project"] = sample_project
    print(f"   Proyecto seleccionado: {sample_project.ProjectName} ({sample_project.NodeCount} nodos)")
    
    # 3. Obtener estadísticas por capa
    discovery["layers"] = await graph_service.get_projects_by_layer()
    print(f"   Capas encontradas: {list(discovery['layers'].keys())}")
    
    # 4. Obtener nodos del proyecto seleccionado
    nodes = await graph_service.get_nodes_by_project(sample_project.ProjectId)
    discovery["sample_nodes"] = nodes
    
    if nodes:
        print(f"   Encontrados {len(nodes)} nodos en el proyecto")
        
        # 5. Buscar una clase
        classes = [n for n in nodes if n.Type == "Class"]
        if classes:
            discovery["sample_class"] = classes[0]
            print(f"   Clase de ejemplo: {classes[0].Name}")
            
            # Recopilar namespaces
            for node in nodes:
                if node.Namespace:
                    discovery["namespaces"].add(node.Namespace)
        
        # 6. Buscar un método
        methods = [n for n in nodes if n.Type == "Method"]
        if methods:
            discovery["sample_method"] = methods[0]
            print(f"   Metodo de ejemplo: {methods[0].Name}")
    
    # Convertir set a list para serialización
    discovery["namespaces"] = list(discovery["namespaces"])
    
    print("Descubrimiento completado\n")
    
    return discovery


@pytest.fixture(scope="session")
async def validate_data(real_data_discovery: Dict) -> bool:
    """
    Valida que hay suficientes datos en la base de datos para ejecutar los tests.
    """
    if not real_data_discovery["projects"]:
        pytest.skip("No hay proyectos en la base de datos. Ejecuta el indexer primero.")
    
    if not real_data_discovery["sample_project"]:
        pytest.skip("No se encontró un proyecto adecuado para testing.")
    
    if not real_data_discovery["sample_nodes"]:
        pytest.skip("El proyecto seleccionado no tiene nodos.")
    
    return True
