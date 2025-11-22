# 🚀 Speech: Grafo - Sistema de Análisis de Código con IA

## 🎯 Introducción Rápida

**Grafo** es un sistema revolucionario que transforma tu código C# en un grafo de conocimiento consultable, permitiendo que la IA entienda completamente tu arquitectura, dependencias y patrones para generar código contextualmente inteligente.

---

## ⚡ Tecnologías Utilizadas

### Stack Principal

**Backend de Indexación:**
- **.NET 8** con **Roslyn** - Analiza código C# a nivel de AST (Abstract Syntax Tree)
- Procesa soluciones completas (.sln), proyectos (.csproj) y código fuente (.cs)
- Genera grafos JSON con nodos (clases, métodos, interfaces) y aristas (relaciones)

**Base de Datos:**
- **MongoDB 8.0** - Almacena el grafo completo con índices optimizados
- Colecciones: `projects` (nodos y aristas) y `processing_states` (control incremental)
- Puerto 27019, base de datos `GraphDB`

**Query Service:**
- **Python 3.11** con **FastAPI** - API REST de alto rendimiento
- **Motor** (async MongoDB driver) - Consultas asíncronas optimizadas
- Puerto 8081 con documentación Swagger automática

**MCP Server:**
- **Model Context Protocol** sobre **HTTP/SSE** (Server-Sent Events)
- **FastAPI** con soporte SSE para múltiples clientes simultáneos
- Puerto 8083, endpoint `/sse` para conexión desde Cursor/VSCode

**Infraestructura:**
- **Docker & Docker Compose** - Contenedores orquestados
- **Node.js 18+** con **Commander.js** - CLI unificada (`grafo`)
- Red Docker `grafo-network` para comunicación entre servicios

---

## 🏗️ Patrones Arquitectónicos

### Arquitectura en Capas

```
Código C# → Indexer (Roslyn) → JSON Graph → IndexerDb → MongoDB → Query Service → MCP Server → Cursor/VSCode
```

**1. Capa de Indexación (Offline)**
- **Indexer**: Analiza código con Roslyn, genera grafo JSON
- **IndexerDb**: Procesa JSON, almacena en MongoDB con detección incremental
- **Patrón**: Pipeline de transformación (código → grafo → base de datos)

**2. Capa de Consulta (Online)**
- **Query Service**: REST API stateless para consultas al grafo
- **MCP Server**: Protocolo MCP sobre HTTP/SSE para IDEs
- **Patrón**: Separación de responsabilidades (API vs Protocolo)

**3. Patrón de Procesamiento Incremental**
- Hash de contenido para detectar cambios
- Solo re-procesa proyectos modificados
- Actualización eficiente sin re-indexar todo

**4. Patrón de Versionado del Grafo**
- Múltiples versiones del código en la misma base de datos
- Filtrado por versión en consultas (`?version=7.10.3`)
- Permite comparar código entre releases

**5. Patrón de Herramientas MCP**
- 8 herramientas especializadas que se complementan
- Cada herramienta resuelve un caso de uso específico
- Composición de herramientas para análisis complejos

---

## 💡 Beneficios para la IA

### Contexto Completo del Código

**1. Entendimiento Arquitectónico:**
- La IA conoce TODAS las clases, métodos, interfaces y sus relaciones
- Puede navegar el grafo para entender dependencias
- Identifica patrones y convenciones del proyecto

**2. Generación Contextual:**
- Genera código que sigue los patrones existentes
- Respeta namespaces, capas y estructura del proyecto
- Mantiene consistencia con el código base

**3. Análisis de Impacto:**
- Identifica qué código se afecta con cambios
- Encuentra dependencias transitivas
- Sugiere refactorizaciones seguras

**4. Búsqueda Semántica:**
- Encuentra elementos por nombre, tipo, proyecto
- Navega relaciones (herencia, implementación, llamadas)
- Explora jerarquías completas

**5. Guía Especializada:**
- Herramienta `get_tailored_guidance` para proyectos específicos
- Patrones de extensibilidad (ej: Tailored de ICBanking)
- Validaciones y mejores prácticas

---

## 👤 Beneficios para el Usuario

### Productividad Exponencial

**1. Generación de Código Inteligente:**
- "Crea un servicio de Productos similar a UserService"
- La IA encuentra UserService, analiza su estructura, y genera código consistente
- **Ahorro**: 80% menos tiempo en código boilerplate

**2. Modificación Segura:**
- "Agrega logging al método CreateUser"
- La IA encuentra el método, entiende sus dependencias, y sugiere dónde agregar logging
- **Ahorro**: 60% menos bugs por cambios mal ubicados

**3. Onboarding Rápido:**
- "Explícame la arquitectura del proyecto Banking"
- La IA navega el grafo y explica capas, dependencias, patrones
- **Ahorro**: Días de exploración manual → minutos de consulta

**4. Análisis de Impacto:**
- "¿Qué se rompe si cambio IUserRepository?"
- La IA encuentra todas las implementaciones y usos
- **Ahorro**: Evita romper código en producción

**5. Refactoring Informado:**
- "Refactoriza UserService para usar el patrón Repository"
- La IA entiende el código actual y sugiere cambios seguros
- **Ahorro**: Refactorings más rápidos y seguros

**6. Exploración de Código:**
- "¿Qué clases implementan IPaymentService?"
- Respuesta instantánea con todas las implementaciones
- **Ahorro**: No más búsquedas manuales en el código

---

## 🔗 Cómo se Complementan las Tools MCP

### Flujo de Trabajo en Cascada

Las 8 herramientas MCP trabajan juntas en un flujo inteligente:

**1. `search_code` - Punto de Entrada Universal**
- **Cuándo usar**: "No sé dónde está X"
- **Qué hace**: Busca cualquier elemento (clase, método, interfaz) por nombre
- **Ejemplo**: Buscar "PaymentProcessor" cuando no conoces su ubicación
- **Complementa con**: `get_code_context` para profundizar

**2. `get_code_context` - Análisis Profundo**
- **Cuándo usar**: "Necesito entender X completamente"
- **Qué hace**: Obtiene el elemento + todas sus relaciones + dependencias + impacto
- **Ejemplo**: Después de encontrar PaymentProcessor, obtener su contexto completo
- **Complementa con**: `find_implementations` para ver jerarquías

**3. `list_projects` - Exploración Inicial**
- **Cuándo usar**: "¿Qué proyectos tengo disponibles?"
- **Qué hace**: Lista todos los proyectos indexados con métricas
- **Ejemplo**: Al empezar, ver qué proyectos están en el grafo
- **Complementa con**: `get_project_structure` para profundizar

**4. `get_project_structure` - Arquitectura del Proyecto**
- **Cuándo usar**: "Necesito entender la estructura de X proyecto"
- **Qué hace**: Muestra todas las clases, interfaces, métodos organizados por tipo
- **Ejemplo**: Entender la arquitectura de "Banking.Core"
- **Complementa con**: `get_code_context` para elementos específicos

**5. `find_implementations` - Análisis de Polimorfismo**
- **Cuándo usar**: "¿Qué clases implementan X interfaz?"
- **Qué hace**: Encuentra todas las implementaciones y herencias
- **Ejemplo**: Encontrar todas las implementaciones de IRepository
- **Complementa con**: `analyze_impact` para ver impacto de cambios

**6. `analyze_impact` - Análisis de Cambios**
- **Cuándo usar**: "¿Qué se afecta si cambio X?"
- **Qué hace**: Genera reporte completo de impacto (dependencias, implementaciones, usos)
- **Ejemplo**: Analizar impacto de cambiar IUserService
- **Complementa con**: `get_code_context` para detalles de cada elemento afectado

**7. `get_statistics` - Visión General**
- **Cuándo usar**: "Dame métricas del código"
- **Qué hace**: Estadísticas del grafo (nodos, aristas, proyectos, relaciones)
- **Ejemplo**: Ver cuántas clases, métodos, relaciones hay en total
- **Complementa con**: `list_projects` para desglose por proyecto

**8. `get_tailored_guidance` - Guía Especializada**
- **Cuándo usar**: "Necesito crear/extender X en Tailored"
- **Qué hace**: Guía completa con patrones, código, referencias, configuración
- **Ejemplo**: Crear un nuevo componente BusinessComponent en Tailored
- **Complementa con**: `get_code_context` para ver ejemplos reales del grafo

### Ejemplo de Flujo Completo

**Escenario**: "Crea un servicio de Productos similar a UserService"

**Paso 1**: `search_code("UserService")` → Encuentra la clase
**Paso 2**: `get_code_context("UserService")` → Obtiene estructura completa
**Paso 3**: `find_implementations("IUserService")` → Ve qué interfaces implementa
**Paso 4**: `get_project_structure("Banking.Core")` → Entiende la capa
**Paso 5**: `get_tailored_guidance("extend_business_component", "Products")` → Obtiene guía
**Paso 6**: La IA genera código siguiendo todos los patrones encontrados

**Resultado**: Código generado que es 100% consistente con la arquitectura existente.

---

## ⚙️ Configuración Rápida

### Paso 1: Instalar CLI de Grafo

```bash
cd Grafo
npm install
npm link
grafo --version
```

### Paso 2: Iniciar MongoDB

```bash
grafo mongodb start
grafo mongodb status  # Verificar
```

MongoDB corre en puerto **27019**, base de datos **GraphDB**, red Docker **grafo-network**.

### Paso 3: Indexar tu Código (Primera Vez)

```bash
# Analizar código C#
cd Grafo/Indexer
dotnet run -- --solution "path/to/tu/solution.sln"

# Almacenar en MongoDB
cd ../IndexerDb
dotnet run --all
```

### Paso 4: Iniciar MCP Server

```bash
grafo mcp build
grafo mcp start
```

El comando muestra la configuración JSON para Cursor.

### Paso 5: Configurar Cursor/VSCode

**Archivo**: `~/.cursor/mcp.json` (macOS/Linux) o `%APPDATA%\Cursor\User\mcp.json` (Windows)

**Configuración RECOMENDADA (con versión específica):**

```json
{
  "mcpServers": {
    "grafo-7.10.3": {
      "url": "http://localhost:8083/sse?version=7.10.3",
      "transport": "sse"
    }
  }
}
```

**Alternativa (sin versión específica):**

```json
{
  "mcpServers": {
    "grafo-query-http": {
      "url": "http://localhost:8083/sse",
      "transport": "sse"
    }
  }
}
```

**⚠️ IMPORTANTE**: Reiniciar Cursor completamente después de agregar la configuración.

### Paso 6: Verificar Conexión

En Cursor, deberías ver:
```
🔌 MCP: grafo-query-http (conectado)
```

---

## 💬 Ejemplos de Prompts para Sacar Provecho

### 🎯 Generación de Código

**1. Crear Servicio Similar a Existente:**
```
"Crea un servicio de Productos similar a UserService. 
Analiza UserService primero para entender su estructura, 
dependencias y patrones, luego genera ProductService 
siguiendo los mismos patrones."
```

**2. Crear Componente con Guía Especializada:**
```
"Necesito crear un nuevo BusinessComponent llamado 'Accounts' 
en el proyecto Tailored. Usa get_tailored_guidance para 
obtener los patrones correctos, luego busca ejemplos similares 
en el grafo y genera el código completo."
```

**3. Extender API Existente:**
```
"Extiende la API de Usuarios para agregar un endpoint de 
búsqueda avanzada. Primero analiza la estructura actual 
de la API, luego agrega el nuevo endpoint siguiendo 
los mismos patrones."
```

### 🔍 Exploración y Análisis

**4. Entender Arquitectura:**
```
"Explícame la arquitectura completa del proyecto Banking.Core. 
Lista todos los proyectos relacionados, muestra la estructura 
de cada uno, y explica cómo se relacionan entre sí."
```

**5. Encontrar Implementaciones:**
```
"¿Qué clases implementan IRepository? Muestra todas las 
implementaciones, sus ubicaciones, y explica las diferencias 
entre ellas."
```

**6. Análisis de Dependencias:**
```
"Analiza todas las dependencias de PaymentProcessor. 
Muestra qué clases usa, qué métodos llama, y qué interfaces 
implementa. Luego genera un diagrama de dependencias."
```

### 🔧 Modificación y Refactoring

**7. Agregar Funcionalidad:**
```
"Agrega logging al método CreateUser de UserService. 
Primero obtén el contexto completo del método, incluyendo 
sus dependencias, luego agrega logging usando el mismo 
patrón de logging que se usa en otros métodos del proyecto."
```

**8. Refactoring Seguro:**
```
"Refactoriza UserService para usar el patrón Repository. 
Primero analiza el impacto de este cambio, luego muestra 
todas las clases que se verían afectadas, y finalmente 
genera el código refactorizado."
```

**9. Agregar Validación:**
```
"Agrega validación de email al método CreateUser. 
Busca cómo se hace validación en otros métodos similares 
del proyecto, luego agrega la validación siguiendo el 
mismo patrón."
```

### 📊 Análisis de Impacto

**10. Cambio de Interfaz:**
```
"¿Qué se rompe si cambio la firma de IUserRepository? 
Analiza el impacto completo, muestra todas las implementaciones 
y usos, y genera un reporte de cambios necesarios."
```

**11. Eliminar Clase:**
```
"¿Puedo eliminar la clase LegacyPaymentProcessor? 
Analiza todas sus dependencias, muestra qué código la usa, 
y sugiere una estrategia de migración."
```

**12. Cambio de Namespace:**
```
"Quiero mover UserService a un nuevo namespace. 
Analiza el impacto, muestra todas las referencias, 
y genera un plan de migración paso a paso."
```

### 🏗️ Creación de Componentes Complejos

**13. Crear Capa Completa:**
```
"Crea una nueva capa de acceso a datos para el módulo 
de Productos. Usa get_tailored_guidance para obtener 
los patrones de DataAccess, luego busca ejemplos reales 
en el grafo, y genera el código completo incluyendo 
Repository, Entity, y configuración de Unity."
```

**14. Extender Business Component:**
```
"Extiende AccountsBusinessComponent para agregar funcionalidad 
de transferencias. Primero analiza la estructura actual, 
luego busca cómo se implementan transferencias en otros 
componentes, y finalmente genera el código extendido."
```

**15. Crear Service Agent:**
```
"Crea un nuevo ServiceAgent para integración con sistema 
externo de pagos. Usa get_tailored_guidance para ServiceAgents, 
analiza ServiceAgents existentes en el grafo, y genera 
el código completo con configuración."
```

### 🎓 Aprendizaje y Documentación

**16. Documentar Arquitectura:**
```
"Genera documentación completa de la arquitectura del 
proyecto Banking. Incluye diagramas de capas, explicación 
de cada componente, relaciones entre módulos, y patrones 
utilizados."
```

**17. Entender Flujo Completo:**
```
"Explica el flujo completo de creación de usuario. 
Desde que se llama al API hasta que se guarda en base 
de datos. Muestra todas las clases involucradas, métodos 
llamados, y dependencias."
```

**18. Encontrar Patrones:**
```
"¿Qué patrones de diseño se usan en este proyecto? 
Analiza las relaciones del grafo, identifica patrones 
como Repository, Factory, Strategy, etc., y muestra 
ejemplos de cada uno."
```

### 🚀 Optimización y Mejora

**19. Identificar Code Smells:**
```
"Analiza el código y encuentra posibles code smells. 
Busca clases con demasiadas dependencias, métodos muy 
largos, violaciones de principios SOLID, y sugiere 
mejoras."
```

**20. Optimizar Consultas:**
```
"El método GetUser tiene muchas dependencias. Analiza 
si se puede optimizar, sugiere refactorizaciones, y 
muestra cómo reducir el acoplamiento."
```

---

## 🎯 Tips para Máximo Provecho

### 1. Combina Múltiples Herramientas
No uses una sola herramienta. Combina `search_code` + `get_code_context` + `find_implementations` para análisis completos.

### 2. Especifica Versión del Grafo
Usa `?version=7.10.3` en la URL para consultar versiones específicas del código.

### 3. Usa get_tailored_guidance para Proyectos Específicos
Si trabajas en Tailored o proyectos con patrones especiales, siempre empieza con esta herramienta.

### 4. Analiza Impacto Antes de Cambiar
Siempre usa `analyze_impact` antes de hacer cambios grandes para evitar romper código.

### 5. Explora la Arquitectura Primero
Antes de generar código, usa `list_projects` y `get_project_structure` para entender el contexto.

### 6. Pide Explicaciones Detalladas
No solo pidas código, pide que la IA explique por qué genera ese código basándose en el grafo.

---

## 🚀 Conclusión

**Grafo** transforma la forma en que desarrollas:

- **Para la IA**: Contexto completo del código = generación inteligente
- **Para ti**: Productividad exponencial + código consistente + menos bugs

**Stack Moderno**: .NET 8 + MongoDB + Python + FastAPI + MCP + Docker

**8 Herramientas MCP** que se complementan para análisis completo

**Configuración en 5 minutos**: CLI unificada, Docker automático, integración con Cursor

**Resultado**: Código generado que sigue tus patrones, arquitectura y convenciones al 100%.

---

**¡Empieza ahora y transforma tu desarrollo con IA contextual!** 🚀

