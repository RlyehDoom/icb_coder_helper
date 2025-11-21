#!/usr/bin/env python3
"""
Script para probar el filtrado de versión en MongoDB.
Verifica que el filtro de versión esté funcionando correctamente.
"""
import asyncio
import sys
from pathlib import Path

# Agregar el directorio src al path
sys.path.insert(0, str(Path(__file__).parent.parent / "Query"))

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# Configuración de MongoDB (misma que .env)
MONGODB_CONNECTION_STRING = "mongodb://localhost:27019/"
MONGODB_DATABASE = "GraphDB"


async def test_version_filtering():
    """Prueba el filtrado de versión."""
    client = AsyncIOMotorClient(MONGODB_CONNECTION_STRING)
    db = client[MONGODB_DATABASE]

    print("=" * 70)
    print("TEST: Filtrado de Versión en MongoDB")
    print("=" * 70)
    print()

    # 1. Verificar processing_states
    print("1. Verificando processing_states...")
    print("-" * 70)

    states_col = db.processing_states
    async for state in states_col.find({}, {"Version": 1, "TotalProjects": 1}).limit(10):
        version = state.get("Version", "NULL")
        total = state.get("TotalProjects", 0)
        state_id = state["_id"]
        print(f"  Versión: {version:20s} | Proyectos: {total:3d} | _id: {state_id}")

    print()

    # 2. Verificar si existe versión "7.10.2"
    print("2. Buscando versión '7.10.2'...")
    print("-" * 70)

    state_7_10_2 = await states_col.find_one({"Version": "7.10.2"})
    if state_7_10_2:
        state_id = state_7_10_2["_id"]
        total = state_7_10_2.get("TotalProjects", 0)
        print(f"  [OK] Encontrada: _id = {state_id}")
        print(f"    Total proyectos: {total}")
    else:
        print("  [ERROR] NO ENCONTRADA")
        print("  Versiones disponibles:")
        async for state in states_col.find({}, {"Version": 1}).sort("Version", 1):
            print(f"    - {state.get('Version', 'NULL')}")
        return

    print()

    # 3. Verificar proyectos vinculados
    print("3. Verificando proyectos vinculados a versión '7.10.2'...")
    print("-" * 70)

    projects_col = db.projects

    # Contar proyectos CON ProcessingStateId como ObjectId
    count_with_id = await projects_col.count_documents({
        "ProcessingStateId": state_id  # ObjectId directo
    })
    print(f"  Proyectos con ProcessingStateId (ObjectId): {count_with_id}")

    # Contar proyectos CON ProcessingStateId como string (bug anterior)
    count_with_str = await projects_col.count_documents({
        "ProcessingStateId": str(state_id)  # String
    })
    print(f"  Proyectos con ProcessingStateId (String):   {count_with_str}")

    # Verificar tipo de dato en un proyecto de ejemplo
    sample = await projects_col.find_one(
        {"ProcessingStateId": {"$exists": True}},
        {"ProjectName": 1, "ProcessingStateId": 1}
    )
    if sample:
        print(f"\n  Ejemplo de proyecto:")
        print(f"    Nombre: {sample.get('ProjectName')}")
        print(f"    ProcessingStateId: {sample.get('ProcessingStateId')}")
        print(f"    Tipo: {type(sample.get('ProcessingStateId'))}")

    print()

    # 4. Buscar "ApprovalScheme" sin filtro de versión
    print("4. Buscando 'ApprovalScheme' SIN filtro de versión...")
    print("-" * 70)

    pipeline_no_filter = [
        {"$unwind": "$Nodes"},
        {"$match": {
            "Nodes.Name": {"$regex": "ApprovalScheme", "$options": "i"}
        }},
        {"$limit": 5},
        {"$project": {
            "ProjectName": 1,
            "ProcessingStateId": 1,
            "NodeName": "$Nodes.Name",
            "NodeType": "$Nodes.Type"
        }}
    ]

    count = 0
    async for doc in projects_col.aggregate(pipeline_no_filter):
        count += 1
        print(f"  {count}. {doc.get('NodeName')} ({doc.get('NodeType')})")
        print(f"     Proyecto: {doc.get('ProjectName')}")
        print(f"     StateId: {doc.get('ProcessingStateId')}")

    if count == 0:
        print("  [ERROR] NO se encontraron nodos con 'ApprovalScheme'")
    else:
        print(f"\n  [OK] Total encontrados (sin filtro): {count}")

    print()

    # 5. Buscar "ApprovalScheme" CON filtro de versión (ObjectId)
    print("5. Buscando 'ApprovalScheme' CON filtro de versión '7.10.2' (ObjectId)...")
    print("-" * 70)

    pipeline_with_filter = [
        {"$match": {"ProcessingStateId": state_id}},  # ObjectId
        {"$unwind": "$Nodes"},
        {"$match": {
            "Nodes.Name": {"$regex": "ApprovalScheme", "$options": "i"}
        }},
        {"$limit": 5},
        {"$project": {
            "ProjectName": 1,
            "ProcessingStateId": 1,
            "NodeName": "$Nodes.Name",
            "NodeType": "$Nodes.Type"
        }}
    ]

    count_filtered = 0
    async for doc in projects_col.aggregate(pipeline_with_filter):
        count_filtered += 1
        print(f"  {count_filtered}. {doc.get('NodeName')} ({doc.get('NodeType')})")
        print(f"     Proyecto: {doc.get('ProjectName')}")

    if count_filtered == 0:
        print("  [ERROR] NO se encontraron nodos con filtro de versión")
    else:
        print(f"\n  [OK] Total encontrados (con filtro): {count_filtered}")

    print()

    # 6. Buscar "ApprovalScheme" CON filtro de versión (String - bug anterior)
    print("6. Buscando 'ApprovalScheme' CON filtro de versión '7.10.2' (String - bug)...")
    print("-" * 70)

    pipeline_with_str = [
        {"$match": {"ProcessingStateId": str(state_id)}},  # String (bug)
        {"$unwind": "$Nodes"},
        {"$match": {
            "Nodes.Name": {"$regex": "ApprovalScheme", "$options": "i"}
        }},
        {"$limit": 5},
        {"$project": {
            "ProjectName": 1,
            "NodeName": "$Nodes.Name",
            "NodeType": "$Nodes.Type"
        }}
    ]

    count_str = 0
    async for doc in projects_col.aggregate(pipeline_with_str):
        count_str += 1
        print(f"  {count_str}. {doc.get('NodeName')} ({doc.get('NodeType')})")
        print(f"     Proyecto: {doc.get('ProjectName')}")

    if count_str == 0:
        print("  [ERROR] NO se encontraron nodos (esto confirma el bug)")
    else:
        print(f"\n  [OK] Total encontrados (string): {count_str}")

    print()
    print("=" * 70)
    print("RESUMEN:")
    print("=" * 70)
    print(f"  Proyectos vinculados (ObjectId): {count_with_id}")
    print(f"  Proyectos vinculados (String):   {count_with_str}")
    print(f"  Nodos encontrados sin filtro:    {count}")
    print(f"  Nodos encontrados con ObjectId:  {count_filtered}")
    print(f"  Nodos encontrados con String:    {count_str}")
    print()

    if count_with_id > 0 and count_filtered > 0:
        print("  [OK] FILTRO FUNCIONANDO CORRECTAMENTE")
    elif count_with_id > 0 and count_filtered == 0:
        print("  [WARN] FILTRO TIENE PROBLEMAS - hay proyectos pero no se encuentran nodos")
    elif count_with_id == 0:
        print("  [ERROR] NO HAY PROYECTOS VINCULADOS - necesitas reindexar")

    print()

    client.close()


if __name__ == "__main__":
    asyncio.run(test_version_filtering())
