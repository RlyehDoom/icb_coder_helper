import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
import inquirer from 'inquirer';
import http from 'node:http';
import { 
  displayProgressStart, 
  displayProgressEnd, 
  displayError, 
  displaySuccess, 
  displayInfo, 
  displayWarning,
  displaySeparator 
} from '../utils/display.js';

export class SetupHandler {
  constructor(systemUtils, repoHandler, indexerHandler) {
    this.systemUtils = systemUtils;
    this.repoHandler = repoHandler;
    this.indexerHandler = indexerHandler;
    this.indexerDbDir = path.resolve('./IndexerDb');
    this.queryDir = path.resolve('./Query');
    this.startTime = null;
  }

  /**
   * Main orchestration method - runs the complete setup workflow
   */
  async runFullSetup(options = {}) {
    this.startTime = Date.now();
    
    console.log(chalk.bold.cyan('\n🚀 Iniciando Setup Completo de Grafo\n'));
    displaySeparator();
    
    const steps = [
      { name: 'Selección y actualización de repositorio', skip: options.skipRepoUpdate },
      { name: 'Ejecución del Indexer', skip: false },
      { name: 'Verificación de MongoDB', skip: options.skipMongoCheck },
      { name: 'Ejecución del IndexerDb', skip: false },
      { name: 'Despliegue de Query API', skip: false }
    ];
    
    console.log(chalk.bold('Pasos a ejecutar:'));
    steps.forEach((step, index) => {
      const status = step.skip ? chalk.gray('(omitido)') : chalk.green('✓');
      console.log(`  ${index + 1}. ${step.name} ${status}`);
    });
    
    displaySeparator();
    console.log('');

    try {
      // Step 1: Repository selection and update
      let repoPath, solutionPath;
      if (!options.skipRepoUpdate) {
        const result = await this.selectAndUpdateRepo();
        if (!result) {
          displayError('No se pudo seleccionar o actualizar el repositorio');
          return false;
        }
        repoPath = result.repoPath;
        solutionPath = result.solutionPath;
      } else {
        displayInfo('⏭️  Omitiendo actualización de repositorio');
        const result = await this.selectRepository();
        if (!result) {
          displayError('No se pudo seleccionar el repositorio');
          return false;
        }
        repoPath = result.repoPath;
        solutionPath = result.solutionPath;
      }

      displaySeparator();

      // Step 2: Run Indexer
      if (!(await this.runIndexer(repoPath, solutionPath))) {
        displayError('Error en la ejecución del Indexer');
        return false;
      }

      displaySeparator();

      // Step 3: Check/Start MongoDB
      if (!options.skipMongoCheck) {
        if (!(await this.ensureMongoDBRunning())) {
          displayError('No se pudo asegurar que MongoDB esté ejecutándose');
          return false;
        }
      } else {
        displayInfo('⏭️  Omitiendo verificación de MongoDB');
      }

      displaySeparator();

      // Step 4: Run IndexerDb
      if (!(await this.runIndexerDb())) {
        displayError('Error en la ejecución del IndexerDb');
        return false;
      }

      displaySeparator();

      // Step 5: Start Query API
      if (!(await this.startQueryAPI())) {
        displayError('Error al iniciar Query API');
        return false;
      }

      // Success summary
      this.displaySuccessSummary();
      return true;

    } catch (error) {
      displayError(`Error durante el setup: ${error.message}`);
      console.error(error);
      return false;
    }
  }

  /**
   * Step 1: Select and update repository
   */
  async selectAndUpdateRepo() {
    console.log(chalk.bold.blue('\n📦 Paso 1: Selección y Actualización de Repositorio\n'));
    
    // Discover repositories
    const repositories = await this.indexerHandler.discoverRepositories();
    
    if (repositories.length === 0) {
      displayError('No se encontraron repositorios clonados');
      console.log('');
      console.log(chalk.yellow('Para clonar un repositorio, ejecuta:'));
      console.log(chalk.cyan('  grafo repo clone -u <repository-url>'));
      console.log('');
      return null;
    }

    // Select repository
    const repoPath = await this.selectRepositoryFromList(repositories);
    if (!repoPath) {
      return null;
    }

    const repoName = path.basename(repoPath);
    
    // Update repository (git reset & pull)
    if (!(await this.updateRepository(repoPath))) {
      displayWarning(`No se pudo actualizar ${repoName}, continuando con la versión actual`);
    }

    // Find solution in repository
    const solutions = await this.indexerHandler.findSolutionsInRepo(repoPath);
    
    if (solutions.length === 0) {
      displayError(`No se encontraron archivos .sln en ${repoName}`);
      return null;
    }

    const solutionPath = await this.indexerHandler.selectSolutionInteractive(solutions);
    
    if (!solutionPath) {
      displayError('No se seleccionó ninguna solución');
      return null;
    }

    displaySuccess(`Repositorio listo: ${repoName}`);
    displayInfo(`Solución seleccionada: ${path.basename(solutionPath)}`);

    return { repoPath, solutionPath };
  }

  /**
   * Select repository without updating
   */
  async selectRepository() {
    const repositories = await this.indexerHandler.discoverRepositories();
    
    if (repositories.length === 0) {
      displayError('No se encontraron repositorios clonados');
      return null;
    }

    const repoPath = await this.selectRepositoryFromList(repositories);
    if (!repoPath) {
      return null;
    }

    const solutions = await this.indexerHandler.findSolutionsInRepo(repoPath);
    
    if (solutions.length === 0) {
      displayError(`No se encontraron archivos .sln en ${path.basename(repoPath)}`);
      return null;
    }

    const solutionPath = await this.indexerHandler.selectSolutionInteractive(solutions);
    
    if (!solutionPath) {
      return null;
    }

    return { repoPath, solutionPath };
  }

  /**
   * Helper to select repository from list
   */
  async selectRepositoryFromList(repositories) {
    if (repositories.length === 1) {
      const repoName = path.basename(repositories[0]);
      displaySuccess(`Único repositorio encontrado: ${repoName}`);
      return repositories[0];
    }

    const choices = repositories.map(repo => ({
      name: path.basename(repo),
      value: repo
    }));

    const { selectedRepo } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedRepo',
      message: 'Selecciona un repositorio:',
      choices: choices
    }]);

    return selectedRepo;
  }

  /**
   * Update repository with git reset & pull
   */
  async updateRepository(repoPath) {
    const repoName = path.basename(repoPath);
    displayProgressStart(`Actualizando repositorio: ${repoName}`);

    try {
      // Check if it's a git repository
      const gitDir = path.join(repoPath, '.git');
      if (!(await this.systemUtils.exists(gitDir))) {
        displayWarning('No es un repositorio Git válido');
        return false;
      }

      // Get current branch
      const branchResult = await this.systemUtils.executeShell('git branch --show-current', {
        cwd: repoPath,
        silent: true
      });

      const branch = branchResult.success ? branchResult.stdout.trim() : 'main';
      displayInfo(`Rama actual: ${branch}`);

      // Fetch latest changes
      displayInfo('Obteniendo cambios del remoto...');
      const fetchResult = await this.systemUtils.execute('git', ['fetch', 'origin'], {
        cwd: repoPath
      });

      if (!fetchResult.success) {
        displayWarning('No se pudo hacer fetch del remoto');
        return false;
      }

      // Reset to remote branch
      displayInfo(`Reseteando a origin/${branch}...`);
      const resetResult = await this.systemUtils.execute('git', ['reset', '--hard', `origin/${branch}`], {
        cwd: repoPath
      });

      if (!resetResult.success) {
        displayWarning(`No se pudo resetear a origin/${branch}`);
        return false;
      }

      // Pull latest changes
      displayInfo('Actualizando código...');
      const pullResult = await this.systemUtils.execute('git', ['pull', 'origin', branch], {
        cwd: repoPath
      });

      if (!pullResult.success) {
        displayWarning('No se pudo hacer pull del remoto');
        return false;
      }

      displayProgressEnd('Repositorio actualizado exitosamente');
      return true;

    } catch (error) {
      displayError(`Error actualizando repositorio: ${error.message}`);
      return false;
    }
  }

  /**
   * Step 2: Run Indexer
   */
  async runIndexer(repoPath, solutionPath) {
    console.log(chalk.bold.blue('\n🔍 Paso 2: Ejecución del Indexer\n'));
    
    displayInfo(`Analizando: ${path.basename(solutionPath)}`);
    
    // Use the indexer handler's analyze method
    const result = await this.indexerHandler.analyze({
      solution: solutionPath,
      verbose: false,
      format: 'json'
    });

    if (result) {
      displaySuccess('Indexer ejecutado exitosamente');
      return true;
    } else {
      displayError('Error al ejecutar el Indexer');
      return false;
    }
  }

  /**
   * Step 3: Ensure MongoDB is running
   */
  async ensureMongoDBRunning() {
    console.log(chalk.bold.blue('\n💾 Paso 3: Verificación de MongoDB\n'));

    // Read MongoDB configuration
    const mongoConfig = await this.readMongoDBConfig();
    
    if (!mongoConfig) {
      displayError('No se pudo leer la configuración de MongoDB');
      return false;
    }

    displayInfo(`Host: ${mongoConfig.host}:${mongoConfig.port}`);
    displayInfo(`Base de datos: ${mongoConfig.database}`);

    // Check if MongoDB is running
    displayProgressStart('Verificando conexión a MongoDB');
    
    const isRunning = await this.checkMongoDBConnection(mongoConfig);

    if (isRunning) {
      displayProgressEnd('MongoDB está ejecutándose y responde correctamente');
      return true;
    }

    displayProgressEnd('MongoDB no está accesible', false);
    displayWarning('Intentando iniciar MongoDB con Docker...');

    // Try to start MongoDB with Docker
    return await this.startMongoDBDocker(mongoConfig);
  }

  /**
   * Read MongoDB configuration from appsettings.json
   */
  async readMongoDBConfig() {
    try {
      const configPath = path.join(this.indexerDbDir, 'appsettings.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);

      const connectionString = config.MongoDB?.ConnectionString || '';
      
      // Parse connection string
      // Format: mongodb://username:password@host:port/
      const match = connectionString.match(/mongodb:\/\/(?:([^:]+):([^@]+)@)?([^:/]+):?(\d+)?/);
      
      if (!match) {
        displayError('Formato de connection string no válido');
        return null;
      }

      return {
        username: match[1] || config.MongoDB?.Username || 'InfocorpAI',
        password: match[2] || config.MongoDB?.Password || 'InfocorpAI2025',
        host: match[3] || 'localhost',
        port: match[4] || '27017',
        database: config.MongoDB?.DatabaseName || 'GraphDB',
        authDatabase: config.MongoDB?.AuthDatabase || 'admin'
      };
    } catch (error) {
      displayError(`Error leyendo configuración: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if MongoDB is accessible
   */
  async checkMongoDBConnection(mongoConfig) {
    try {
      // Try using docker exec if mongodb-grafo container exists
      const containerCheck = await this.systemUtils.executeShell(
        'docker ps --filter "name=mongodb-grafo" --format "{{.Names}}"',
        { silent: true }
      );

      if (containerCheck.success && containerCheck.stdout.includes('mongodb-grafo')) {
        // Container exists, try to connect
        const testResult = await this.systemUtils.executeShell(
          `docker exec mongodb-grafo mongosh --username ${mongoConfig.username} --password ${mongoConfig.password} --authenticationDatabase ${mongoConfig.authDatabase} --eval "db.adminCommand('ping')" --quiet`,
          { silent: true }
        );

        return testResult.success;
      }

      // Try connecting via mongosh if available
      if (await this.systemUtils.isCommandAvailable('mongosh')) {
        const testResult = await this.systemUtils.executeShell(
          `mongosh "mongodb://${mongoConfig.username}:${mongoConfig.password}@${mongoConfig.host}:${mongoConfig.port}/${mongoConfig.database}?authSource=${mongoConfig.authDatabase}" --eval "db.adminCommand('ping')" --quiet`,
          { silent: true }
        );

        return testResult.success;
      }

      // Fallback: try using docker to test connection
      const dockerTestResult = await this.systemUtils.executeShell(
        `docker run --rm mongo:8.0 mongosh "mongodb://${mongoConfig.username}:${mongoConfig.password}@host.docker.internal:${mongoConfig.port}/${mongoConfig.database}?authSource=${mongoConfig.authDatabase}" --eval "db.adminCommand('ping')" --quiet`,
        { silent: true, timeout: 10000 }
      );

      return dockerTestResult.success;

    } catch (error) {
      // Connection test failed
      console.debug('MongoDB connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Start MongoDB using Docker
   */
  async startMongoDBDocker(mongoConfig) {
    displayProgressStart('Iniciando MongoDB con Docker');

    try {
      // Check if Docker is available
      if (!(await this.systemUtils.isCommandAvailable('docker'))) {
        displayError('Docker no está instalado o no está en PATH');
        return false;
      }

      // Check if container already exists (stopped)
      const existsCheck = await this.systemUtils.executeShell(
        'docker ps -a --filter "name=mongodb-grafo" --format "{{.Names}}"',
        { silent: true }
      );

      if (existsCheck.success && existsCheck.stdout.includes('mongodb-grafo')) {
        displayInfo('Contenedor mongodb-grafo ya existe, iniciándolo...');
        
        const startResult = await this.systemUtils.execute('docker', ['start', 'mongodb-grafo'], {});
        
        if (startResult.success) {
          // Wait a bit for MongoDB to start
          displayInfo('Esperando a que MongoDB esté listo...');
          await this.sleep(5000);
          
          displayProgressEnd('MongoDB iniciado exitosamente');
          return true;
        } else {
          displayWarning('No se pudo iniciar el contenedor existente, recreando...');
          await this.systemUtils.execute('docker', ['rm', 'mongodb-grafo'], {});
        }
      }

      // Create and start new container
      displayInfo('Creando nuevo contenedor de MongoDB...');
      
      const runResult = await this.systemUtils.execute('docker', [
        'run',
        '-d',
        '--name', 'mongodb-grafo',
        '-p', `${mongoConfig.port}:27017`,
        '-e', `MONGO_INITDB_ROOT_USERNAME=${mongoConfig.username}`,
        '-e', `MONGO_INITDB_ROOT_PASSWORD=${mongoConfig.password}`,
        'mongo:8.0'
      ], {});

      if (!runResult.success) {
        displayProgressEnd('Error al crear el contenedor de MongoDB', false);
        return false;
      }

      // Wait for MongoDB to be ready
      displayInfo('Esperando a que MongoDB esté listo...');
      await this.sleep(8000);

      // Verify connection
      const isRunning = await this.checkMongoDBConnection(mongoConfig);
      
      if (isRunning) {
        displayProgressEnd('MongoDB iniciado y verificado exitosamente');
        return true;
      } else {
        displayProgressEnd('MongoDB iniciado pero no responde', false);
        displayWarning('Intenta verificar manualmente: docker logs mongodb-grafo');
        return false;
      }

    } catch (error) {
      displayError(`Error iniciando MongoDB: ${error.message}`);
      return false;
    }
  }

  /**
   * Step 4: Run IndexerDb
   */
  async runIndexerDb() {
    console.log(chalk.bold.blue('\n💽 Paso 4: Ejecución del IndexerDb\n'));

    displayProgressStart('Procesando y subiendo grafo a MongoDB');

    // Check if .NET is available
    if (!(await this.systemUtils.isCommandAvailable('dotnet'))) {
      displayError('.NET SDK no está instalado o no está en PATH');
      return false;
    }

    // Check if IndexerDb directory exists
    if (!(await this.systemUtils.exists(this.indexerDbDir))) {
      displayError(`Directorio IndexerDb no encontrado: ${this.indexerDbDir}`);
      return false;
    }

    try {
      displayInfo('Ejecutando IndexerDb con --all...');
      
      const result = await this.systemUtils.execute('dotnet', ['run', '--', '--all'], {
        cwd: this.indexerDbDir
      });

      if (result.success) {
        displayProgressEnd('IndexerDb ejecutado exitosamente');
        displaySuccess('Grafo subido a MongoDB');
        return true;
      } else {
        displayProgressEnd('Error al ejecutar IndexerDb', false);
        return false;
      }

    } catch (error) {
      displayError(`Error durante la ejecución del IndexerDb: ${error.message}`);
      return false;
    }
  }

  /**
   * Step 5: Start Query API with docker-compose
   */
  async startQueryAPI() {
    console.log(chalk.bold.blue('\n🌐 Paso 5: Despliegue de Query API\n'));

    displayProgressStart('Iniciando Query API con docker-compose');

    // Check if docker-compose is available
    const hasDockerCompose = await this.systemUtils.isCommandAvailable('docker-compose');
    const hasDockerComposeV2 = await this.systemUtils.isCommandAvailable('docker') && 
                                 (await this.systemUtils.executeShell('docker compose version', { silent: true })).success;

    if (!hasDockerCompose && !hasDockerComposeV2) {
      displayError('docker-compose no está instalado o no está en PATH');
      return false;
    }

    // Check if Query directory exists
    if (!(await this.systemUtils.exists(this.queryDir))) {
      displayError(`Directorio Query no encontrado: ${this.queryDir}`);
      return false;
    }

    try {
      // Stop existing containers if running
      displayInfo('Deteniendo contenedores existentes si los hay...');
      
      const composeCommand = hasDockerComposeV2 ? 'docker' : 'docker-compose';
      const composeArgs = hasDockerComposeV2 ? ['compose', 'down'] : ['down'];
      
      await this.systemUtils.execute(composeCommand, composeArgs, {
        cwd: this.queryDir
      });

      // Start with docker-compose up
      displayInfo('Construyendo e iniciando Query API...');
      
      const upArgs = hasDockerComposeV2 ? ['compose', 'up', '-d', '--build'] : ['up', '-d', '--build'];
      
      const result = await this.systemUtils.execute(composeCommand, upArgs, {
        cwd: this.queryDir
      });

      if (!result.success) {
        displayProgressEnd('Error al iniciar Query API', false);
        return false;
      }

      // Wait for service to be ready
      displayInfo('Esperando a que Query API esté lista...');
      await this.sleep(3000);

      // Health check with retries
      displayInfo('Verificando salud del servicio...');
      const healthCheck = await this.checkQueryAPIHealthWithRetries(10, 2000);
      
      if (healthCheck) {
        displayProgressEnd('Query API iniciada y verificada exitosamente');
        displaySuccess('Query API disponible en: http://localhost:8081');
        displayInfo('Documentación Swagger: http://localhost:8081/docs');
        displayInfo('Health check: http://localhost:8081/health');
        return true;
      } else {
        displayProgressEnd('Query API iniciada pero no responde', false);
        displayWarning('Verifica los logs: docker logs grafo-query-service');
        return false;
      }

    } catch (error) {
      displayError(`Error iniciando Query API: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if Query API is responding with retries
   */
  async checkQueryAPIHealthWithRetries(maxRetries = 10, delayMs = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      if (i > 0) {
        displayInfo(`Intento ${i + 1}/${maxRetries}...`);
        await this.sleep(delayMs);
      }

      const isHealthy = await this.checkQueryAPIHealth();
      if (isHealthy) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if Query API is responding (single attempt)
   */
  async checkQueryAPIHealth() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 8081,
        path: '/health',
        method: 'GET',
        timeout: 5000 // 5 segundos de timeout
      };

      const req = http.request(options, (res) => {
        // Aceptar respuestas 2xx y 404 (algunos endpoints sin /health)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else if (res.statusCode === 404) {
          // Si /health no existe, intentar endpoint raíz
          this.checkQueryAPIRootEndpoint().then(resolve).catch(() => resolve(false));
        } else {
          resolve(false);
        }
      });

      req.on('error', () => {
        // Si falla, intentar endpoint raíz como fallback
        this.checkQueryAPIRootEndpoint().then(resolve).catch(() => resolve(false));
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Check if Query API root endpoint is responding
   */
  async checkQueryAPIRootEndpoint() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 8081,
        path: '/',
        method: 'GET',
        timeout: 3000
      };

      const req = http.request(options, (res) => {
        // Cualquier respuesta del servidor significa que está activo
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Display success summary with timing
   */
  displaySuccessSummary() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    displaySeparator();
    console.log('');
    console.log(chalk.bold.green('✅ Setup Completo Exitoso!'));
    console.log('');
    console.log(chalk.gray(`Tiempo total: ${minutes}m ${seconds}s`));
    console.log('');
    console.log(chalk.bold('📊 Servicios Disponibles:'));
    console.log('');
    console.log(chalk.cyan('  MongoDB:'));
    console.log(chalk.gray('    • Host: localhost:27017'));
    console.log(chalk.gray('    • Base de datos: GraphDB'));
    console.log('');
    console.log(chalk.cyan('  Query API:'));
    console.log(chalk.gray('    • API: http://localhost:8081'));
    console.log(chalk.gray('    • Docs: http://localhost:8081/docs'));
    console.log(chalk.gray('    • Health: http://localhost:8081/health'));
    console.log('');
    console.log(chalk.bold('🎯 Próximos pasos:'));
    console.log(chalk.gray('  • Prueba la API en: http://localhost:8081/docs'));
    console.log(chalk.gray('  • Consulta estadísticas: http://localhost:8081/api/context/statistics'));
    console.log(chalk.gray('  • Revisa logs de Query: docker logs grafo-query-service'));
    console.log('');
    displaySeparator();
  }

  /**
   * Helper to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Status check for setup components
   */
  async status() {
    console.log(chalk.cyan('🔧 Estado del Setup:'));
    
    // Check MongoDB
    const mongoConfig = await this.readMongoDBConfig();
    if (mongoConfig) {
      const mongoRunning = await this.checkMongoDBConnection(mongoConfig);
      console.log(chalk.gray('  MongoDB:'), mongoRunning ? chalk.green('✓ Ejecutándose') : chalk.red('✗ No disponible'));
    } else {
      console.log(chalk.gray('  MongoDB:'), chalk.yellow('? No se pudo verificar'));
    }

    // Check Query API
    const queryRunning = await this.checkQueryAPIHealth();
    console.log(chalk.gray('  Query API:'), queryRunning ? chalk.green('✓ Ejecutándose') : chalk.red('✗ No disponible'));

    // Check Docker
    const dockerAvailable = await this.systemUtils.isCommandAvailable('docker');
    console.log(chalk.gray('  Docker:'), dockerAvailable ? chalk.green('✓ Disponible') : chalk.red('✗ No disponible'));

    // Check .NET
    const dotnetAvailable = await this.systemUtils.isCommandAvailable('dotnet');
    console.log(chalk.gray('  .NET SDK:'), dotnetAvailable ? chalk.green('✓ Disponible') : chalk.red('✗ No disponible'));

    return true;
  }
}

