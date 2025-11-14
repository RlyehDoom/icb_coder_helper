#!/usr/bin/env python
"""
Script simple para probar la conexión a MongoDB usando el .env
"""
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
import os

# Cargar variables de entorno
load_dotenv()

# Obtener configuración
conn_str = os.getenv('MONGODB_CONNECTION_STRING', 'mongodb://localhost:27017/')
db_name = os.getenv('MONGODB_DATABASE', 'GraphDB')
projects_col = os.getenv('MONGODB_PROJECTS_COLLECTION', 'projects')

# Ocultar password en el output
display_conn = conn_str.split('@')[-1] if '@' in conn_str else conn_str

print(f"[*] Conectando a: {display_conn}")
print(f"[*] Base de datos: {db_name}")
print(f"[*] Coleccion: {projects_col}")
print()

try:
    # Intentar conectar
    client = MongoClient(conn_str, serverSelectionTimeoutMS=5000)
    info = client.server_info()
    
    print("[OK] Conexion exitosa!")
    print(f"     MongoDB version: {info.get('version', 'unknown')}")
    print()
    
    # Verificar base de datos y colecciones
    db = client[db_name]
    collections = db.list_collection_names()
    print(f"[*] Colecciones encontradas: {len(collections)}")
    for col in collections:
        print(f"    - {col}")
    print()
    
    # Contar proyectos
    if projects_col in collections:
        count = db[projects_col].count_documents({})
        print(f"[*] Proyectos en la BD: {count}")
        
        if count > 0:
            # Mostrar un ejemplo
            sample = db[projects_col].find_one({}, {"ProjectName": 1, "NodeCount": 1, "EdgeCount": 1, "_id": 0})
            if sample:
                print(f"    Ejemplo: {sample.get('ProjectName', 'N/A')} "
                      f"({sample.get('NodeCount', 0)} nodos, {sample.get('EdgeCount', 0)} edges)")
        else:
            print("    [!] La base de datos esta vacia")
            print("    Ejecuta IndexerDb para poblar datos")
    else:
        print(f"[!] Coleccion '{projects_col}' no encontrada en la BD")
        print("    Colecciones disponibles:", collections)
    
    client.close()
    sys.exit(0)
    
except Exception as e:
    print(f"[ERROR] Error al conectar a MongoDB:")
    print(f"        {str(e)}")
    print()
    print("[!] Verifica que:")
    print("    1. MongoDB este corriendo")
    print("    2. Las credenciales en .env sean correctas")
    print("    3. El puerto de MongoDB este accesible")
    sys.exit(1)

