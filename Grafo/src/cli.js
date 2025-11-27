#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import { promises as fs } from 'fs';
import { IndexerHandler } from './handlers/indexer.js';
import { IndexerDbHandler } from './handlers/indexerdb.js';
import { QueryHandler } from './handlers/query.js';
import { RepoHandler } from './handlers/repo.js';
import { TestHandler } from './handlers/test.js';
import { SetupHandler } from './handlers/setup.js';
import { MongoDBHandler } from './handlers/mongodb.js';
import { MCPHandler } from './handlers/mcp.js';
import SystemUtils from './utils/system.js';
import { displayBanner, displayHelp, displaySeparator, displayWarning, displaySuccess, displayError, displayInfo } from './utils/display.js';

const program = new Command();
const systemUtils = new SystemUtils();
const indexerHandler = new IndexerHandler(systemUtils);
const indexerDbHandler = new IndexerDbHandler(systemUtils);
const queryHandler = new QueryHandler(systemUtils);
const repoHandler = new RepoHandler(systemUtils);
const testHandler = new TestHandler(systemUtils, indexerHandler, repoHandler);
const setupHandler = new SetupHandler(systemUtils, repoHandler, indexerHandler);
const mongodbHandler = new MongoDBHandler(systemUtils);
const mcpHandler = new MCPHandler(systemUtils, mongodbHandler);

// Helper function to load environment configuration from Repo/.env
async function loadRepoEnvConfig() {
  const envPath = path.resolve('./Repo/.env');
  const config = {};

  try {
    const exists = await systemUtils.exists(envPath);
    if (!exists) {
      return config;
    }

    const content = await fs.readFile(envPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse key=value
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        let value = trimmed.substring(equalIndex + 1).trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (value) {
          config[key] = value;
        }
      }
    }
  } catch (error) {
    // Failed to read .env file, continue with defaults
  }

  return config;
}

program
  .name('grafo')
  .description('CLI unificada para el proyecto Grafo - Indexer y Repository management')
  .version('1.0.0');

// Comandos Indexer
program
  .command('indexer')
  .description('Gestionar el RoslynIndexer (C# Code Analysis Tool)')
  .argument('[action]', 'Acción a realizar: build, clean, test, analyze, run', 'help')
  .option('-s, --solution <path>', 'Ruta al archivo de solución (.sln)')
  .option('-o, --output <path>', 'Directorio de salida (default: Indexer/output)')
  .option('-v, --verbose', 'Salida detallada')
  .option('--no-graph', 'Omitir generación de grafos')
  .option('--no-stats', 'Omitir generación de estadísticas')
  .option('--format <format>', 'Formato de salida (json, xml)', 'json')
  .option('--filter-types <types>', 'Filtrar tipos de símbolos (separados por coma)')
  .option('--exclude-projects <regex>', 'Excluir proyectos que coincidan con regex')
  .option('--output-mongodb', 'Exportar directamente a MongoDB (v2.1)')
  .option('--mongodb-connection <string>', 'Connection string de MongoDB', 'mongodb://localhost:27019/')
  .option('--mongodb-database <name>', 'Nombre de base de datos MongoDB', 'GraphDB')
  .option('--mongodb-clean', 'Limpiar datos existentes de la solución antes de importar')
  .action(async (action, options) => {
    displayBanner('GRAFO - Indexer');
    
    switch (action) {
      case 'build':
        await indexerHandler.build();
        break;
      case 'clean':
        await indexerHandler.clean();
        break;
      case 'test':
        await indexerHandler.test();
        break;
      case 'analyze':
        await indexerHandler.analyze(options);
        break;
      case 'run':
        await indexerHandler.run(options);
        break;
      case 'status':
        await indexerHandler.status();
        break;
      case 'list-solutions':
        await indexerHandler.listSolutions();
        break;
      default:
        console.log(chalk.yellow('Comandos disponibles para indexer:'));
        console.log('  build    - Compila el RoslynIndexer');
        console.log('  clean    - Limpia los artefactos de compilación');
        console.log('  test     - Ejecuta las pruebas unitarias');
        console.log('  analyze  - Analiza una solución (auto-descubre si no se especifica -s)');
        console.log('  list-solutions - Lista todas las soluciones disponibles en Grafo/Repo/Cloned/');
        console.log('  run      - Ejecuta el indexer con opciones interactivas');
        console.log('  status   - Muestra el estado del indexer');
        console.log('');
        console.log(chalk.yellow('Opciones para analyze:'));
        console.log('  -s, --solution <path>        - Ruta al archivo .sln');
        console.log('  -o, --output <path>          - Directorio de salida');
        console.log('  -v, --verbose                - Salida detallada');
        console.log('  --filter-types <types>       - Filtrar tipos de símbolos');
        console.log('  --exclude-projects <regex>   - Excluir proyectos por regex');
        console.log('');
        console.log(chalk.cyan('🗄️  MongoDB Direct Export (v2.1):'));
        console.log('  --output-mongodb             - Exportar directamente a MongoDB');
        console.log('  --mongodb-connection <str>   - Connection string (default: mongodb://localhost:27019/)');
        console.log('  --mongodb-database <name>    - Database name (default: GraphDB)');
        console.log('  --mongodb-clean              - Limpiar datos existentes antes de importar');
        console.log('');
        console.log(chalk.yellow('Ejemplos:'));
        console.log(chalk.gray('  # Análisis con selección interactiva'));
        console.log(chalk.gray('  grafo indexer analyze'));
        console.log('');
        console.log(chalk.gray('  # Análisis directo a archivo'));
        console.log(chalk.gray('  grafo indexer analyze -s ./MySolution.sln'));
        console.log('');
        console.log(chalk.gray('  # Exportar directamente a MongoDB'));
        console.log(chalk.gray('  grafo indexer analyze -s ./MySolution.sln --output-mongodb'));
        console.log('');
        console.log(chalk.gray('  # MongoDB con limpieza previa'));
        console.log(chalk.gray('  grafo indexer analyze -s ./MySolution.sln --output-mongodb --mongodb-clean'));
    }
  });

// Comandos IndexerDb
program
  .command('indexerdb')
  .description('Gestionar el IndexerDb (Graph Data Processor)')
  .argument('[action]', 'Acción a realizar: build, clean, run, status', 'help')
  .option('-f, --file <path>', 'Ruta al archivo de grafo específico')
  .option('--all', 'Procesar todos los archivos automáticamente')
  .option('-i, --interactive', 'Modo query interactivo')
  .option('-p, --production', 'Ejecutar en modo PRODUCCIÓN (MongoDB remoto con TLS)')
  .option('-v, --version <version>', 'Versión del grafo (ej: 1.0.0, 7.8.0, 7.9.2)')
  .option('-n, --export-nodes', 'Exportar a colección nodes (v2.1 para graph traversal)')
  .option('--clean-nodes', 'Limpiar nodos existentes antes de exportar')
  .action(async (action, options) => {
    displayBanner('GRAFO - IndexerDb');

    switch (action) {
      case 'build':
        await indexerDbHandler.build();
        break;
      case 'clean':
        await indexerDbHandler.clean();
        break;
      case 'run':
        // Si hay opciones de línea de comandos, ejecutar directamente
        if (options.file || options.all || options.production !== undefined || options.version || options.exportNodes) {
          await indexerDbHandler.run({
            file: options.file,
            noInteractive: options.all,
            interactive: options.interactive,
            production: options.production,
            version: options.version,
            exportNodes: options.exportNodes,
            cleanNodes: options.cleanNodes
          });
        } else {
          // Modo interactivo con selección de ambiente
          await indexerDbHandler.runInteractive();
        }
        break;
      case 'status':
        await indexerDbHandler.status();
        break;
      default:
        console.log(chalk.yellow('Comandos disponibles para indexerdb:'));
        console.log('  build    - Compila el IndexerDb');
        console.log('  clean    - Limpia los artefactos de compilación');
        console.log('  run      - Ejecuta IndexerDb (modo interactivo si no se especifican opciones)');
        console.log('  status   - Muestra el estado del servicio');
        console.log('');
        console.log(chalk.yellow('Gestión de versiones:'));
        console.log(chalk.gray('  Para ver o eliminar versiones de la base de datos, usa:'));
        console.log(chalk.cyan('  grafo mongodb shell'));
        console.log('');
        console.log(chalk.yellow('Opciones para run:'));
        console.log('  -f, --file <path>     - Procesa un archivo específico');
        console.log('  --all                 - Procesa todos los archivos automáticamente');
        console.log('  -i, --interactive     - Modo query interactivo (solo consultas)');
        console.log('  -p, --production      - Ejecutar en modo PRODUCCIÓN');
        console.log('  -v, --version <ver>   - Versión del grafo (ej: 1.0.0, 7.8.0)');
        console.log('');
        console.log(chalk.cyan('🗄️  Export Nodes (v2.1):'));
        console.log('  -n, --export-nodes    - Exportar a colección nodes (para graph traversal)');
        console.log('  --clean-nodes         - Limpiar nodos existentes antes de exportar');
        console.log('');
        console.log(chalk.yellow('Ejemplos:'));
        console.log(chalk.gray('  # Modo interactivo (seleccionar ambiente y modo)'));
        console.log(chalk.gray('  grafo indexerdb run'));
        console.log('');
        console.log(chalk.gray('  # Development: procesar todos los archivos'));
        console.log(chalk.gray('  grafo indexerdb run --all'));
        console.log('');
        console.log(chalk.gray('  # Production: procesar todos con versión 7.8.0'));
        console.log(chalk.gray('  grafo indexerdb run --all --production --version 7.8.0'));
        console.log('');
        console.log(chalk.gray('  # Development: procesar con versión 1.0.0'));
        console.log(chalk.gray('  grafo indexerdb run --all --version 1.0.0'));
        console.log('');
        console.log(chalk.gray('  # Production: modo query interactivo'));
        console.log(chalk.gray('  grafo indexerdb run --interactive --production'));
        console.log('');
        console.log(chalk.gray('  # Procesar y exportar a nodes collection (v2.1)'));
        console.log(chalk.gray('  grafo indexerdb run --all --export-nodes'));
        console.log('');
        console.log(chalk.gray('  # Export nodes con limpieza previa'));
        console.log(chalk.gray('  grafo indexerdb run --all --export-nodes --clean-nodes'));
        console.log('');
        console.log(chalk.gray('  # Gestión de versiones en la base de datos'));
        console.log(chalk.gray('  grafo mongodb shell'));
        console.log('');
    }
  });

// Comandos Query
program
  .command('query')
  .description('Gestionar el Query Service (Graph Query API)')
  .argument('[action]', 'Acción a realizar: build, run, stop, delete, restart, logs, status, test, push', 'help')
  .option('-f, --follow', 'Seguir logs en tiempo real', true)
  .option('--tail <n>', 'Número de líneas de log a mostrar')
  .option('--detached', 'Ejecutar en modo detached (background)', true)
  .action(async (action, options) => {
    displayBanner('GRAFO - Query Service');
    
    switch (action) {
      case 'build':
        await queryHandler.build();
        break;
      case 'run':
      case 'start':
        await queryHandler.run(options);
        break;
      case 'stop':
        await queryHandler.stop();
        break;
      case 'delete':
      case 'down':
        await queryHandler.delete(options);
        break;
      case 'restart':
        await queryHandler.restart();
        break;
      case 'logs':
        await queryHandler.logs(options);
        break;
      case 'status':
        await queryHandler.status();
        break;
      case 'clean':
        await queryHandler.clean();
        break;
      case 'test':
        await queryHandler.test();
        break;
      case 'shell':
        await queryHandler.shell();
        break;
      case 'exec':
        if (!options.command) {
          displayError('Se requiere especificar un comando con --command');
          process.exit(1);
        }
        await queryHandler.exec(options.command);
        break;
      case 'push':
        await queryHandler.push(options);
        break;
      default:
        console.log(chalk.yellow('Comandos disponibles para query:'));
        console.log('  build    - Construye la imagen Docker');
        console.log('  run      - Inicia el servicio con Docker Compose');
        console.log('  start    - Alias de run');
        console.log('  stop     - Detiene el servicio');
        console.log('  delete   - Elimina contenedores y recursos (docker-compose down)');
        console.log('  down     - Alias de delete');
        console.log('  restart  - Reinicia el servicio');
        console.log('  logs     - Muestra los logs del servicio');
        console.log('  status   - Muestra el estado del servicio');
        console.log('  clean    - Limpia todos los recursos');
        console.log('  test     - Ejecuta los tests del servicio');
        console.log('  shell    - Abre una shell interactiva en el contenedor');
        console.log('  push     - Construye y sube imágenes a Docker Hub');
        console.log('');
        console.log(chalk.yellow('Opciones:'));
        console.log('  --tail <n>  - Muestra las últimas n líneas de logs');
        console.log('  --follow    - Sigue los logs en tiempo real (default: true)');
    }
  });

// Comando Setup - Flujo completo
program
  .command('setup')
  .description('Ejecutar el flujo completo: Repo → Indexer → IndexerDb → Query API')
  .option('--skip-repo-update', 'Omitir actualización del repositorio (git reset & pull)')
  .option('--skip-mongo-check', 'Omitir verificación de MongoDB')
  .action(async (options) => {
    displayBanner('GRAFO - Setup Completo');
    await setupHandler.runFullSetup(options);
  });

// Comandos Repository
program
  .command('repo')
  .description('Gestionar repositorios en /Grafo/Repo/Cloned')
  .argument('[action]', 'Acción a realizar: clone, list, clean, status', 'help')
  .option('-u, --url <url>', 'URL del repositorio de Azure DevOps')
  .option('-n, --name <name>', 'Nombre del repositorio')
  .option('-f, --folder <folder>', 'Nombre personalizado de carpeta')
  .option('-s, --sparse <folders>', 'Carpetas para sparse checkout (separadas por coma)')
  .option('-b, --branch <branch>', 'Rama a clonar', 'main')
  .option('-t, --token <token>', 'Personal Access Token')
  .action(async (action, options) => {
    displayBanner('GRAFO - Repository');
    
    switch (action) {
      case 'clone':
        // Si no se proporciona URL, entrar en modo interactivo
        if (!options.url) {
          // Cargar configuración desde .env
          const envConfig = await loadRepoEnvConfig();

          console.log(chalk.cyan('\n🔧 Modo interactivo - Configuración de clonado\n'));

          // Mostrar configuración cargada desde .env
          if (envConfig.GRAFO_DEFAULT_REPO_URL || envConfig.GRAFO_DEFAULT_BRANCH || envConfig.GRAFO_DEFAULT_SPARSE) {
            console.log(chalk.gray('📄 Configuración desde .env:'));
            if (envConfig.GRAFO_DEFAULT_REPO_URL) {
              console.log(chalk.gray(`   URL: ${envConfig.GRAFO_DEFAULT_REPO_URL}`));
            }
            if (envConfig.GRAFO_DEFAULT_BRANCH) {
              console.log(chalk.gray(`   Branch: ${envConfig.GRAFO_DEFAULT_BRANCH}`));
            }
            if (envConfig.GRAFO_DEFAULT_SPARSE) {
              console.log(chalk.gray(`   Sparse folders: ${envConfig.GRAFO_DEFAULT_SPARSE}`));
            }
            console.log(chalk.gray('   (Presiona Enter para usar estos valores)\n'));
          }

          const cloneOptions = await inquirer.prompt([
            {
              type: 'input',
              name: 'url',
              message: envConfig.GRAFO_DEFAULT_REPO_URL
                ? `🔗 URL del repositorio (${chalk.dim(envConfig.GRAFO_DEFAULT_REPO_URL.substring(0, 50) + (envConfig.GRAFO_DEFAULT_REPO_URL.length > 50 ? '...' : ''))}):`
                : '🔗 URL del repositorio:',
              default: envConfig.GRAFO_DEFAULT_REPO_URL || '',
              validate: (input) => {
                // Si el input está vacío, usar el default si existe
                const value = input.trim() || envConfig.GRAFO_DEFAULT_REPO_URL || '';

                if (!value) {
                  return 'La URL es requerida';
                }
                // Validación básica de URL
                if (!value.includes('github.com') && !value.includes('azure.com') && !value.includes('visualstudio.com') && !value.includes('_git')) {
                  return 'URL no válida. Debe ser de Azure DevOps o GitHub';
                }
                return true;
              }
            },
            {
              type: 'input',
              name: 'branch',
              message: `🌿 Rama a clonar (${chalk.dim(envConfig.GRAFO_DEFAULT_BRANCH || 'main')}):`,
              default: envConfig.GRAFO_DEFAULT_BRANCH || 'main'
            },
            {
              type: 'confirm',
              name: 'useSparse',
              message: '📁 ¿Usar sparse checkout (clonar solo carpetas específicas)?',
              default: !!envConfig.GRAFO_DEFAULT_SPARSE
            },
            {
              type: 'input',
              name: 'sparse',
              message: envConfig.GRAFO_DEFAULT_SPARSE
                ? `📂 Carpetas para sparse checkout (${chalk.dim(envConfig.GRAFO_DEFAULT_SPARSE)}):`
                : '📂 Carpetas para sparse checkout (separadas por coma):',
              default: envConfig.GRAFO_DEFAULT_SPARSE || '',
              when: (answers) => answers.useSparse,
              validate: (input) => {
                // Si el input está vacío, usar el default si existe
                const value = input.trim() || envConfig.GRAFO_DEFAULT_SPARSE || '';

                if (!value) {
                  return 'Ingresa al menos una carpeta (ej: /ICBanking,/Microservices)';
                }
                return true;
              }
            },
            {
              type: 'input',
              name: 'folder',
              message: '📂 Nombre de carpeta personalizado (opcional, presiona Enter para usar el nombre del repo):',
              default: ''
            }
          ]);

          // Ejecutar el comando clone con las opciones recolectadas
          await repoHandler.clone({
            url: cloneOptions.url,
            branch: cloneOptions.branch,
            sparse: cloneOptions.useSparse ? cloneOptions.sparse : undefined,
            folder: cloneOptions.folder || undefined
          });
        } else {
          // Modo no interactivo - usar opciones de línea de comandos
          await repoHandler.clone(options);
        }
        break;
      case 'list':
        await repoHandler.list();
        break;
      case 'clean':
        await repoHandler.clean();
        break;
      case 'status':
        await repoHandler.status();
        break;
      default:
        console.log(chalk.yellow('Comandos disponibles para repo:'));
        console.log('  clone   - Clona un repositorio (sin -u entra en modo interactivo)');
        console.log('  list    - Lista todos los repositorios clonados');
        console.log('  clean   - Limpia repositorios obsoletos');
        console.log('  status  - Muestra el estado de los repositorios');
        console.log('');
        console.log(chalk.yellow('Opciones para clone:'));
        console.log('  -u, --url <url>        - URL del repositorio');
        console.log('  -b, --branch <branch>  - Rama a clonar (default: main)');
        console.log('  -s, --sparse <folders> - Carpetas para sparse checkout (separadas por coma)');
        console.log('  -f, --folder <name>    - Nombre personalizado de carpeta');
        console.log('  -t, --token <token>    - Personal Access Token');
        console.log('');
        console.log(chalk.cyan('💡 Tip: Configura valores por defecto en Grafo/Repo/.env'));
    }
  });

// Comandos Test
program
  .command('test')
  .description('Ejecutar tests y análisis completos')
  .argument('[action]', 'Acción a realizar: setup, run, batch, cleanup', 'help')
  .option('-r, --repo <name>', 'Repositorio específico para analizar')
  .option('-c, --config <path>', 'Archivo de configuración batch')
  .option('-v, --verbose', 'Salida detallada')
  .option('--quick', 'Prueba rápida con configuración mínima')
  .action(async (action, options) => {
    displayBanner('GRAFO - Testing');
    
    switch (action) {
      case 'setup':
        await testHandler.setup();
        break;
      case 'run':
        await testHandler.run(options);
        break;
      case 'batch':
        await testHandler.batch(options);
        break;
      case 'cleanup':
        await testHandler.cleanup();
        break;
      default:
        console.log(chalk.yellow('Comandos disponibles para test:'));
        console.log('  setup   - Configura el entorno de testing');
        console.log('  run     - Ejecuta análisis en repositorios');
        console.log('  batch   - Ejecuta procesamiento por lotes');
        console.log('  cleanup - Limpia archivos de prueba');
    }
  });

// Comandos globales
program
  .command('all')
  .description('Gestionar todas las operaciones de Grafo')
  .argument('[action]', 'Acción a realizar: setup, test, clean, status', 'help')
  .action(async (action) => {
    displayBanner('GRAFO - All Services');
    
    switch (action) {
      case 'setup':
        console.log(chalk.blue('🚀 Configurando todo el entorno Grafo...'));
        console.log(chalk.gray('   Ejecutando: Repository → Indexer → IndexerDb → Query\n'));
        
        // Paso 1: Repository - Verificar estado
        displaySeparator();
        console.log(chalk.bold.cyan('📦 Paso 1: Repository'));
        await repoHandler.status();
        const repositories = await indexerHandler.discoverRepositories();
        if (repositories.length === 0) {
          displayWarning('No se encontraron repositorios clonados');
          console.log(chalk.yellow('   💡 Para clonar un repositorio: grafo repo clone -u <url>'));
        } else {
          displaySuccess(`✓ ${repositories.length} repositorio(s) disponible(s)`);
        }
        
        // Paso 2: Indexer - Build
        displaySeparator();
        console.log(chalk.bold.cyan('🔍 Paso 2: Indexer'));
        const indexerBuilt = await indexerHandler.build();
        if (!indexerBuilt) {
          displayError('Error al compilar Indexer');
          process.exit(1);
        }
        
        // Paso 3: IndexerDb - Build
        displaySeparator();
        console.log(chalk.bold.cyan('💾 Paso 3: IndexerDb'));
        const indexerDbBuilt = await indexerDbHandler.build();
        if (!indexerDbBuilt) {
          displayError('Error al compilar IndexerDb');
          process.exit(1);
        }
        
        // Paso 4: Query - Build y Run
        displaySeparator();
        console.log(chalk.bold.cyan('🌐 Paso 4: Query'));
        const queryBuilt = await queryHandler.build();
        if (!queryBuilt) {
          displayError('Error al construir Query Service');
          process.exit(1);
        }
        
        displayInfo('Iniciando Query Service...');
        const queryRunning = await queryHandler.run({ detached: true });
        if (!queryRunning) {
          displayWarning('No se pudo iniciar Query Service');
          displayInfo('Para iniciar manualmente: grafo query run');
        } else {
          displaySuccess('✓ Query Service iniciado y disponible');
        }
        
        // Paso 5: Testing - Setup (opcional pero útil)
        displaySeparator();
        console.log(chalk.bold.cyan('🧪 Paso 5: Testing Environment'));
        await testHandler.setup();
        
        displaySeparator();
        console.log(chalk.green('✅ Entorno Grafo configurado exitosamente!'));
        console.log('');
        console.log(chalk.cyan('📋 Próximos pasos:'));
        console.log(chalk.gray('   • Para ejecutar el flujo completo: grafo setup'));
        console.log(chalk.gray('   • Para ejecutar Indexer: grafo indexer analyze'));
        console.log(chalk.gray('   • Para ejecutar IndexerDb: grafo indexerdb run'));
        console.log(chalk.gray('   • Para iniciar Query API: grafo query run'));
        break;
      case 'test':
        console.log(chalk.blue('🧪 Ejecutando suite completa de tests...'));
        await indexerHandler.test();
        await testHandler.run({ verbose: true });
        console.log(chalk.green('✅ Suite de tests completada!'));
        break;
      case 'clean':
        console.log(chalk.blue('🧹 Limpiando todos los archivos temporales...'));
        await indexerHandler.clean();
        await repoHandler.clean();
        await testHandler.cleanup();
        console.log(chalk.green('✅ Limpieza completada!'));
        break;
      case 'status':
        await indexerHandler.status();
        displaySeparator();
        await indexerDbHandler.status();
        displaySeparator();
        await repoHandler.status();
        displaySeparator();
        await testHandler.status();
        break;
      default:
        console.log(chalk.yellow('Comandos disponibles para all:'));
        console.log('  setup  - Configura todo el entorno');
        console.log('  test   - Ejecuta todos los tests');
        console.log('  clean  - Limpia todos los archivos temporales');
        console.log('  status - Muestra el estado de todos los componentes');
    }
  });

// Comando de estado general
program
  .command('status')
  .description('Muestra el estado de todos los componentes')
  .action(async () => {
    displayBanner('GRAFO - Status');
    await setupHandler.status();
    displaySeparator();
    await indexerHandler.status();
    displaySeparator();
    await indexerDbHandler.status();
    displaySeparator();
    await queryHandler.status();
    displaySeparator();
    await repoHandler.status();
    displaySeparator();
    await testHandler.status();
  });

// Comando interactivo
program
  .command('interactive')
  .alias('i')
  .description('Modo interactivo para gestionar Grafo')
  .action(async () => {
    displayBanner('GRAFO - Interactive');
    
    const { component, action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'component',
        message: '¿Qué componente quieres gestionar?',
        choices: [
          { name: '🚀 Setup (Flujo completo)', value: 'setup' },
          { name: '🔧 Indexer (RoslynIndexer)', value: 'indexer' },
          { name: '💾 IndexerDb (Graph Data Processor)', value: 'indexerdb' },
          { name: '🔍 Query (Graph Query API)', value: 'query' },
          { name: '📦 Repository (Repo management)', value: 'repo' },
          { name: '🧪 Testing (Test suite)', value: 'test' },
          { name: '🌟 All (Todas las operaciones)', value: 'all' },
          { name: '📊 Status (Ver estado)', value: 'status' }
        ]
      },
      {
        type: 'list',
        name: 'action',
        message: '¿Qué acción quieres realizar?',
        choices: (answers) => {
          const choices = [];
          
          if (answers.component === 'setup') {
            choices.push(
              { name: '🚀 Run (ejecutar flujo completo)', value: 'run' },
              { name: '📊 Status (ver estado)', value: 'status' }
            );
          } else if (answers.component === 'indexer') {
            choices.push(
              { name: '🏗️  Build (compilar)', value: 'build' },
              { name: '🧪 Test (probar)', value: 'test' },
              { name: '🔍 Analyze (analizar solución)', value: 'analyze' },
              { name: '🧹 Clean (limpiar)', value: 'clean' }
            );
          } else if (answers.component === 'indexerdb') {
            choices.push(
              { name: '🏗️  Build (compilar)', value: 'build' },
              { name: '▶️  Run (ejecutar - interactivo)', value: 'run' },
              { name: '🟢 Run Development (dev local)', value: 'run-dev' },
              { name: '🔴 Run Production (MongoDB remoto)', value: 'run-prod' },
              { name: '🧹 Clean (limpiar)', value: 'clean' }
            );
          } else if (answers.component === 'query') {
            choices.push(
              { name: '🏗️  Build (construir imagen)', value: 'build' },
              { name: '▶️  Run (iniciar servicio)', value: 'run' },
              { name: '⏹️  Stop (detener servicio)', value: 'stop' },
              { name: '🔄 Restart (reiniciar servicio)', value: 'restart' },
              { name: '📜 Logs (ver logs)', value: 'logs' },
              { name: '🧪 Test (ejecutar tests)', value: 'test' },
              { name: '🧹 Clean (limpiar recursos)', value: 'clean' },
              { name: '🗑️  Delete (eliminar contenedores)', value: 'delete' }
            );
          } else if (answers.component === 'repo') {
            choices.push(
              { name: '📥 Clone (clonar repositorio)', value: 'clone' },
              { name: '📋 List (listar repositorios)', value: 'list' },
              { name: '🧹 Clean (limpiar)', value: 'clean' }
            );
          } else if (answers.component === 'test') {
            choices.push(
              { name: '⚙️  Setup (configurar)', value: 'setup' },
              { name: '▶️  Run (ejecutar)', value: 'run' },
              { name: '📦 Batch (procesamiento por lotes)', value: 'batch' },
              { name: '🧹 Cleanup (limpiar)', value: 'cleanup' }
            );
          } else if (answers.component === 'all') {
            choices.push(
              { name: '⚙️  Setup (configurar todo)', value: 'setup' },
              { name: '🧪 Test (ejecutar todos los tests)', value: 'test' },
              { name: '🧹 Clean (limpiar todo)', value: 'clean' }
            );
          }
          
          choices.push({ name: '📊 Status (estado)', value: 'status' });
          return choices;
        },
        when: (answers) => answers.component !== 'status'
      }
    ]);

    // Ejecutar comando seleccionado
    if (component === 'status') {
      await program.parseAsync(['node', 'cli.js', 'status']);
    } else if (component === 'setup' && action === 'run') {
      await setupHandler.runFullSetup({});
    } else if (component === 'setup' && action === 'status') {
      await setupHandler.status();
    } else if (component === 'indexerdb' && action === 'run') {
      await indexerDbHandler.runInteractive();
    } else if (component === 'indexerdb' && action === 'run-dev') {
      await indexerDbHandler.run({ production: false });
    } else if (component === 'indexerdb' && action === 'run-prod') {
      await indexerDbHandler.run({ production: true });
    } else if (component === 'query') {
      // Ejecutar directamente las acciones de query
      const args = ['node', 'cli.js', 'query', action];
      await program.parseAsync(args);
    } else if (component === 'repo' && action === 'clone') {
      // Modo interactivo especial para clone - solicitar parámetros
      // Cargar configuración desde .env si existe
      const envConfig = await loadRepoEnvConfig();
      
      const cloneOptions = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: '🔗 URL del repositorio:',
          default: envConfig.GRAFO_DEFAULT_REPO_URL || '',
          validate: (input) => {
            if (!input || input.trim() === '') {
              return 'La URL es requerida';
            }
            // Validación básica de URL
            if (!input.includes('github.com') && !input.includes('azure.com') && !input.includes('visualstudio.com') && !input.includes('_git')) {
              return 'URL no válida. Debe ser de Azure DevOps o GitHub';
            }
            return true;
          }
        },
        {
          type: 'input',
          name: 'branch',
          message: '🌿 Rama a clonar (Enter para usar default):',
          default: envConfig.GRAFO_DEFAULT_BRANCH || 'main'
        },
        {
          type: 'input',
          name: 'sparse',
          message: '📁 Carpetas para sparse checkout (opcional, separadas por coma):',
          default: envConfig.GRAFO_DEFAULT_SPARSE || ''
        },
        {
          type: 'input',
          name: 'folder',
          message: '📂 Nombre de carpeta personalizado (Enter para auto-detectar):',
          default: ''
        }
      ]);

      // Ejecutar el comando clone con las opciones
      await repoHandler.clone({
        url: cloneOptions.url,
        branch: cloneOptions.branch,
        sparse: cloneOptions.sparse || undefined,
        folder: cloneOptions.folder || undefined
      });
    } else {
      const args = ['node', 'cli.js', component];
      if (action) args.push(action);
      await program.parseAsync(args);
    }
  });

// Comandos MongoDB
program
  .command('mongodb')
  .description('Gestionar MongoDB en Docker')
  .argument('[action]', 'Acción: start, stop, restart, status, logs, shell, clean', 'help')
  .action(async (action) => {
    displayBanner('GRAFO - MongoDB');

    switch (action) {
      case 'start':
        await mongodbHandler.start();
        break;
      case 'stop':
        await mongodbHandler.stop();
        break;
      case 'restart':
        await mongodbHandler.restart();
        break;
      case 'status':
        await mongodbHandler.status();
        break;
      case 'logs':
        await mongodbHandler.logs();
        break;
      case 'shell':
        await mongodbHandler.shell();
        break;
      case 'clean':
        await mongodbHandler.clean();
        break;
      case 'help':
      default:
        console.log(chalk.cyan('\n📊 Comandos MongoDB:\n'));
        console.log('  grafo mongodb start    - Inicia MongoDB en Docker');
        console.log('  grafo mongodb stop     - Detiene MongoDB');
        console.log('  grafo mongodb restart  - Reinicia MongoDB');
        console.log('  grafo mongodb status   - Ver estado de MongoDB');
        console.log('  grafo mongodb logs     - Ver logs de MongoDB');
        console.log('  grafo mongodb shell    - Abrir mongosh');
        console.log('  grafo mongodb clean    - Limpiar MongoDB (elimina datos)\n');
        break;
    }
  });

// Comandos MCP
program
  .command('mcp')
  .description('Gestionar MCP Server en Docker')
  .argument('[action]', 'Acción: build, start, stop, restart, status, logs, test, shell, clean', 'help')
  .action(async (action) => {
    displayBanner('GRAFO - MCP Server');

    switch (action) {
      case 'build':
        await mcpHandler.build();
        break;
      case 'start':
        await mcpHandler.start();
        break;
      case 'stop':
        await mcpHandler.stop();
        break;
      case 'restart':
        await mcpHandler.restart();
        break;
      case 'status':
        await mcpHandler.status();
        break;
      case 'logs':
        await mcpHandler.logs();
        break;
      case 'test':
        await mcpHandler.test();
        break;
      case 'shell':
        await mcpHandler.shell();
        break;
      case 'clean':
        await mcpHandler.clean();
        break;
      case 'help':
      default:
        console.log(chalk.cyan('\n🔧 Comandos MCP Server:\n'));
        console.log('  grafo mcp build     - Construir imagen Docker');
        console.log('  grafo mcp start     - Iniciar MCP Server');
        console.log('  grafo mcp stop      - Detener MCP Server');
        console.log('  grafo mcp restart   - Reiniciar MCP Server');
        console.log('  grafo mcp status    - Ver estado del MCP Server');
        console.log('  grafo mcp logs      - Ver logs del MCP Server');
        console.log('  grafo mcp test      - Ejecutar tests');
        console.log('  grafo mcp shell     - Abrir shell en contenedor');
        console.log('  grafo mcp clean     - Limpiar MCP Server\n');
        break;
    }
  });

// Mostrar ayuda por defecto si no hay argumentos
if (process.argv.length <= 2) {
  displayBanner('GRAFO');
  displayHelp();
} else {
  program.parse(process.argv);
}