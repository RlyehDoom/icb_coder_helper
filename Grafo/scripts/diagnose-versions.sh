#!/bin/bash

###############################################################################
# Script para Diagnosticar Versiones en MongoDB
# Verifica qué versiones existen y cómo están vinculados los proyectos
###############################################################################

set -e

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Diagnóstico de Versiones en MongoDB    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# MongoDB connection details (ajustar según configuración)
MONGO_HOST="localhost"
MONGO_PORT="28101"
MONGO_USER="sonata"
MONGO_PASS="qwertY.!1982"
MONGO_DB="GraphDB"
MONGO_AUTH_DB="admin"

echo -e "${BLUE}▶ Conectando a MongoDB en ${MONGO_HOST}:${MONGO_PORT}...${NC}"
echo ""

# 1. Listar todas las versiones en processing_states
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}Versiones en collection 'processing_states':${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"

mongosh "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --eval "
    db.processing_states.aggregate([
      {
        \$group: {
          _id: '\$Version',
          count: { \$sum: 1 },
          firstProcessed: { \$min: '\$LastProcessed' },
          lastProcessed: { \$max: '\$LastProcessed' }
        }
      },
      {
        \$sort: { _id: 1 }
      }
    ]).forEach(doc => {
      print('');
      print('Versión: ' + (doc._id || 'null'));
      print('  Proyectos: ' + doc.count);
      print('  Primera procesada: ' + doc.firstProcessed);
      print('  Última procesada: ' + doc.lastProcessed);
    });
  " 2>/dev/null

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}Proyectos en collection 'projects':${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"

# 2. Contar proyectos por ProcessingStateId
mongosh "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --eval "
    var totalProjects = db.projects.countDocuments();
    var withStateId = db.projects.countDocuments({ ProcessingStateId: { \$exists: true, \$ne: null } });
    var withoutStateId = totalProjects - withStateId;

    print('');
    print('Total de proyectos: ' + totalProjects);
    print('  Con ProcessingStateId: ' + withStateId);
    print('  Sin ProcessingStateId: ' + withoutStateId);
    print('');

    if (withStateId > 0) {
      print('Ejemplos de proyectos con ProcessingStateId:');
      db.projects.find(
        { ProcessingStateId: { \$exists: true, \$ne: null } },
        { ProjectName: 1, ProcessingStateId: 1, _id: 0 }
      ).limit(5).forEach(p => {
        print('  - ' + p.ProjectName + ' (StateId: ' + p.ProcessingStateId + ')');
      });
    }
  " 2>/dev/null

echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}Relación projects ↔ processing_states:${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"

# 3. Join projects con processing_states para ver versiones
mongosh "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_DB}&tls=true&tlsInsecure=true" \
  --eval "
    db.projects.aggregate([
      {
        \$lookup: {
          from: 'processing_states',
          localField: 'ProcessingStateId',
          foreignField: '_id',
          as: 'state'
        }
      },
      {
        \$unwind: {
          path: '\$state',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        \$group: {
          _id: '\$state.Version',
          count: { \$sum: 1 },
          examples: {
            \$push: {
              \$cond: [
                { \$lte: [{ \$size: { \$ifNull: ['\$examples', []] } }, 3] },
                '\$ProjectName',
                '\$\$REMOVE'
              ]
            }
          }
        }
      },
      {
        \$project: {
          _id: 1,
          count: 1,
          examples: { \$slice: ['\$examples', 3] }
        }
      },
      {
        \$sort: { _id: 1 }
      }
    ]).forEach(doc => {
      print('');
      print('Versión: ' + (doc._id || 'SIN VERSION'));
      print('  Proyectos: ' + doc.count);
      if (doc.examples && doc.examples.length > 0) {
        print('  Ejemplos: ' + doc.examples.join(', '));
      }
    });
  " 2>/dev/null

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Diagnóstico completo${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}RECOMENDACIONES:${NC}"
echo ""
echo "1. Si ves proyectos 'SIN VERSION', necesitas:"
echo "   - Reindexar con IndexerDb para crear processing_states"
echo "   - O vincular manualmente los proyectos con processing_states"
echo ""
echo "2. Para usar una versión en el MCP Server:"
echo "   - Usa una de las versiones listadas arriba"
echo "   - Configura en Cursor mcp.json:"
echo "     \"url\": \"https://your-domain.com/api/grafo/mcp/sse?version=X.X.X\""
echo ""
echo "3. Si no especificas versión:"
echo "   - El servidor consultará TODOS los proyectos"
echo "   - Esto puede ser más lento pero más completo"
echo ""
