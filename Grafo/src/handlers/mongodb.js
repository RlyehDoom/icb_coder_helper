import { spawn } from 'cross-spawn';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MongoDBHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.projectRoot = null; // Se inicializará en init()
    this.composeFile = null;
    this.projectName = 'grafo';
    this.serviceName = 'mongodb';
    this.containerName = 'grafo-mongodb';
    this.networkName = 'grafo-network';
  }

  /**
   * Inicializa las rutas del handler basándose en la raíz del proyecto
   */
  async init() {
    if (this.projectRoot) {
      return; // Ya inicializado
    }

    this.projectRoot = await this.systemUtils.getProjectRoot();
    this.composeFile = path.join(this.projectRoot, 'docker-compose.yml');
  }

  /**
   * Verifica si Docker está instalado y funcionando
   */
  async checkDocker() {
    await this.init();

    const spinner = ora('Verificando Docker...').start();

    try {
      const result = await this.systemUtils.execute('docker', ['--version'], { silent: true });
      if (!result.success) {
        spinner.fail('Docker no está instalado');
        console.log(chalk.yellow('\n💡 Instala Docker Desktop desde: https://www.docker.com/products/docker-desktop/'));
        return false;
      }

      // Verificar que Docker daemon esté corriendo
      const infoResult = await this.systemUtils.execute('docker', ['info'], { silent: true });
      if (!infoResult.success) {
        spinner.fail('Docker no está corriendo');
        console.log(chalk.yellow('\n💡 Inicia Docker Desktop'));
        return false;
      }

      spinner.succeed('Docker está listo');
      return true;
    } catch (error) {
      spinner.fail('Error verificando Docker');
      console.error(chalk.red(error.message));
      return false;
    }
  }

  /**
   * Verifica el estado de MongoDB
   */
  async status() {
    console.log(chalk.blue('\n📊 Estado de MongoDB\n'));

    try {
      // Verificar contenedor
      const containerCheck = await this.systemUtils.execute(
        'docker',
        ['ps', '-a', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'],
        { silent: true }
      );

      if (!containerCheck.success || !containerCheck.stdout.trim()) {
        console.log(chalk.yellow('⚠️  Contenedor MongoDB no existe'));
        console.log(chalk.gray('   Ejecuta: grafo mongodb start\n'));
        return;
      }

      const [name, status, ports] = containerCheck.stdout.trim().split('\t');
      const isRunning = status.toLowerCase().includes('up');

      if (isRunning) {
        console.log(chalk.green('✓ MongoDB está CORRIENDO'));
        console.log(chalk.gray(`  Estado: ${status}`));
        console.log(chalk.gray(`  Puerto: ${ports || '27017'}`));

        // Health check
        const healthResult = await this.systemUtils.execute(
          'docker',
          ['inspect', '--format', '{{.State.Health.Status}}', this.containerName],
          { silent: true }
        );

        if (healthResult.stdout.trim() && healthResult.stdout.trim() !== '<no value>') {
          const health = healthResult.stdout.trim();
          if (health === 'healthy') {
            console.log(chalk.green(`  Health: ${health}`));
          } else {
            console.log(chalk.yellow(`  Health: ${health}`));
          }
        }

        // Conexión
        console.log(chalk.gray('\n  Conexión: mongodb://localhost:27019/'));
        console.log(chalk.gray('  Database: GraphDB\n'));

        // Datos (intento de consultar proyectos indexados)
        try {
          const dataResult = await this.systemUtils.execute(
            'docker',
            ['exec', this.containerName, 'mongosh', '--quiet', '--eval', 'db.getSiblingDB("GraphDB").projects.countDocuments()'],
            { silent: true }
          ).catch(() => ({ success: false })); // Capturar error si falla

          if (dataResult.success && dataResult.stdout && dataResult.stdout.trim()) {
            const count = parseInt(dataResult.stdout.trim());
            if (!isNaN(count)) {
              console.log(chalk.cyan(`  📦 Proyectos indexados: ${count}`));
            }
          }
        } catch (error) {
          // Silenciosamente ignorar si la consulta falla (DB puede estar vacía)
        }
      } else {
        console.log(chalk.yellow('⚠️  MongoDB está DETENIDO'));
        console.log(chalk.gray(`  Estado: ${status}`));
        console.log(chalk.gray('  Ejecuta: grafo mongodb start\n'));
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Error verificando estado: ${error.error || error.message}`));
      if (error.stderr) {
        console.error(chalk.gray(`   Detalles: ${error.stderr}\n`));
      }
      console.log();
    }
  }

  /**
   * Inicia MongoDB en Docker
   */
  async start() {
    console.log(chalk.blue('\n🚀 Iniciando MongoDB\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    try {
      // Verificar si ya está corriendo
      const checkResult = await this.systemUtils.execute(
        'docker',
        ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
        { silent: true }
      );

      if (checkResult.stdout.trim() === this.containerName) {
        console.log(chalk.yellow('⚠️  MongoDB ya está corriendo'));
        await this.status();
        return;
      }

      // Crear red si no existe
      const networkSpinner = ora('Creando red Docker...').start();
      await this.systemUtils.execute(
        'docker',
        ['network', 'create', this.networkName],
        { silent: true }
      ).catch(() => {}); // Ignorar si ya existe
      networkSpinner.succeed('Red Docker lista');

      // Iniciar con docker-compose
      const spinner = ora('Iniciando MongoDB...').start();

      const result = await this.systemUtils.execute(
        'docker-compose',
        ['-f', this.composeFile, '-p', this.projectName, 'up', '-d', this.serviceName],
        { silent: false }
      );

      if (!result.success) {
        spinner.fail('Error iniciando MongoDB');
        return;
      }

      spinner.succeed('MongoDB iniciado');

      // Esperar health check
      const healthSpinner = ora('Esperando health check...').start();
      await this.systemUtils.wait(5000); // Esperar 5 segundos

      const healthResult = await this.systemUtils.execute(
        'docker',
        ['inspect', '--format', '{{.State.Health.Status}}', this.containerName],
        { silent: true }
      );

      const health = healthResult.stdout.trim();
      if (health === 'healthy') {
        healthSpinner.succeed('MongoDB está saludable');
      } else if (health === 'starting') {
        healthSpinner.info('MongoDB está iniciando (health check en progreso)');
      } else {
        healthSpinner.warn('Health check pendiente');
      }

      console.log(chalk.green('\n✅ MongoDB listo para usar'));
      console.log(chalk.gray('\n  Conexión: mongodb://localhost:27019/'));
      console.log(chalk.gray('  Database: GraphDB'));
      console.log(chalk.gray('  Container: grafo-mongodb\n'));
      console.log(chalk.cyan('  Comandos útiles:'));
      console.log(chalk.gray('    grafo mongodb status  - Ver estado'));
      console.log(chalk.gray('    grafo mongodb logs    - Ver logs'));
      console.log(chalk.gray('    grafo mongodb shell   - Abrir mongosh\n'));
    } catch (error) {
      console.error(chalk.red(`\n❌ Error iniciando MongoDB: ${error.error || error.message}\n`));
    }
  }

  /**
   * Detiene MongoDB
   */
  async stop() {
    console.log(chalk.blue('\n🛑 Deteniendo MongoDB\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    const spinner = ora('Deteniendo MongoDB...').start();

    const result = await this.systemUtils.execute(
      'docker-compose',
      ['-f', this.composeFile, '-p', this.projectName, 'stop', this.serviceName],
      { silent: true }
    );

    if (!result.success) {
      spinner.fail('Error deteniendo MongoDB');
      return;
    }

    spinner.succeed('MongoDB detenido');
    console.log(chalk.gray('\n  Para volver a iniciar: grafo mongodb start\n'));
  }

  /**
   * Reinicia MongoDB
   */
  async restart() {
    console.log(chalk.blue('\n🔄 Reiniciando MongoDB\n'));
    await this.stop();
    await this.systemUtils.wait(2000);
    await this.start();
  }

  /**
   * Muestra logs de MongoDB
   */
  async logs() {
    console.log(chalk.blue('\n📋 Logs de MongoDB (Ctrl+C para salir)\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    // Verificar que esté corriendo
    const checkResult = await this.systemUtils.execute(
      'docker',
      ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
      { silent: true }
    );

    if (checkResult.stdout.trim() !== this.containerName) {
      console.log(chalk.yellow('⚠️  MongoDB no está corriendo'));
      return;
    }

    // Mostrar logs
    const child = spawn('docker-compose', ['-f', this.composeFile, '-p', this.projectName, 'logs', '-f', '--tail=100', this.serviceName], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  }

  /**
   * Carga la configuración de MongoDB desde el .env de IndexerDb
   */
  async loadIndexerDbConfig() {
    await this.init();

    const indexerDbDir = path.join(this.projectRoot, 'IndexerDb');
    const envPath = path.join(indexerDbDir, '.env');

    let config = {
      connectionString: 'mongodb://localhost:27019/',
      database: 'GraphDB',
      tlsCertPath: null,
      isRemote: false
    };

    try {
      // Intentar cargar desde .env
      const envExists = await this.systemUtils.exists(envPath);
      if (envExists) {
        const envContent = await fs.readFile(envPath, 'utf-8');
        const lines = envContent.split('\n');

        for (const line of lines) {
          if (line.trim() && !line.trim().startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();

            if (key && value) {
              if (key.trim() === 'MongoDB__ConnectionString') {
                config.connectionString = value;
                config.isRemote = !value.includes('localhost') && !value.includes('127.0.0.1');
              } else if (key.trim() === 'MongoDB__DatabaseName') {
                config.database = value;
              } else if (key.trim() === 'MongoDB__TlsCertificateFile') {
                config.tlsCertPath = value;
              }
            }
          }
        }

        // Si TLS está habilitado pero no hay certificado explícito, usar el default
        if (config.isRemote && !config.tlsCertPath && config.connectionString.includes('tls=true')) {
          config.tlsCertPath = path.join(this.projectRoot, 'Certs', 'prod', 'client.pem');
        }
      }
    } catch (error) {
      console.error(chalk.yellow(`⚠️  No se pudo leer .env, usando localhost: ${error.message || error}`));
    }

    return config;
  }

  /**
   * Abre shell de MongoDB (mongosh) o menú de gestión
   */
  async shell(options = {}) {
    console.log(chalk.blue('\n🐚 MongoDB Shell & Gestión\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    // Verificar que esté corriendo
    const checkResult = await this.systemUtils.execute(
      'docker',
      ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
      { silent: true }
    );

    if (checkResult.stdout.trim() !== this.containerName) {
      console.log(chalk.yellow('⚠️  MongoDB no está corriendo'));
      console.log(chalk.gray('   Ejecuta: grafo mongodb start\n'));
      return;
    }

    // Si se pasó --direct, abrir mongosh directamente
    if (options.direct) {
      await this.openMongosh();
      return;
    }

    // Menú interactivo
    const inquirer = (await import('inquirer')).default;

    while (true) {
      console.log('');
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '¿Qué deseas hacer?',
          choices: [
            { name: '🐚 Abrir MongoDB Shell (mongosh)', value: 'mongosh' },
            { name: '📋 Ver versiones disponibles', value: 'list' },
            { name: '🗑️  Eliminar una versión específica', value: 'delete' },
            { name: '❌ Salir', value: 'exit' }
          ]
        }
      ]);

      if (action === 'exit') {
        break;
      }

      switch (action) {
        case 'mongosh':
          await this.openMongosh();
          break;
        case 'list':
          await this.listVersions();
          break;
        case 'delete':
          await this.deleteVersion();
          break;
      }
    }
  }

  /**
   * Abre mongosh directamente
   */
  async openMongosh() {
    console.log(chalk.gray('\n  Conectando a: mongodb://localhost:27019/'));
    console.log(chalk.gray('  Database: GraphDB'));
    console.log(chalk.gray('  Escribe "exit" para salir\n'));

    const child = spawn('docker', ['exec', '-it', this.containerName, 'mongosh', '--port', '27019', 'GraphDB'], {
      stdio: 'inherit',
      shell: true
    });

    await new Promise((resolve) => {
      child.on('close', () => resolve());
      child.on('error', (error) => {
        console.error(chalk.red(`Error: ${error.message}`));
        resolve();
      });
    });
  }

  /**
   * Lista las versiones disponibles en la base de datos
   */
  async listVersions() {
    const ora = (await import('ora')).default;

    console.log(chalk.gray('\n  🔍 Diagnóstico de conexión:\n'));

    try {
      // Cargar configuración desde .env
      const config = await this.loadIndexerDbConfig();

      // Mostrar configuración cargada
      console.log(chalk.gray(`  Database: ${config.database}`));
      console.log(chalk.gray(`  Es remoto: ${config.isRemote ? 'Sí' : 'No'}`));

      if (config.isRemote) {
        // Ocultar password en el log
        let connStrLog = config.connectionString.replace(/:[^:@]+@/, ':****@');
        console.log(chalk.gray(`  Connection: ${connStrLog}`));
        console.log(chalk.gray(`  Certificado TLS: ${config.tlsCertPath || 'No configurado'}`));

        // Verificar si mongosh está instalado
        const mongoshCheck = await this.systemUtils.execute('mongosh', ['--version'], { silent: true });
        if (!mongoshCheck.success) {
          console.log(chalk.red('\n  ✖ mongosh no está instalado o no está en PATH'));
          console.log(chalk.yellow('  Instala mongosh desde: https://www.mongodb.com/try/download/shell\n'));
          return;
        }
        console.log(chalk.gray(`  mongosh: ${mongoshCheck.stdout.trim().split('\n')[0]}`));
      } else {
        console.log(chalk.gray(`  Connection: localhost:27019 (Docker)`));
      }

      console.log('');
      const spinner = ora('Consultando versiones disponibles...').start();

      // Script para listar versiones con agregación (single line for Windows compatibility)
      const script = `db.getSiblingDB("${config.database}").processing_states.aggregate([{ $group: { _id: "$Version", count: { $sum: 1 }, totalProjects: { $sum: "$TotalProjects" } } }, { $sort: { _id: 1 } }]).forEach(function(doc) { print(JSON.stringify(doc)); })`;

      // Mostrar a qué BD nos estamos conectando
      const dbInfo = config.isRemote ? chalk.red('PRODUCCIÓN') : chalk.green('LOCAL');
      spinner.text = `Consultando versiones (${dbInfo})...`;

      // Construir comando mongosh
      const mongoshArgs = [];

      // Si es remoto, usar connection string completo
      if (config.isRemote) {
        mongoshArgs.push(config.connectionString);

        // Agregar certificado TLS si existe
        if (config.tlsCertPath && await this.systemUtils.exists(config.tlsCertPath)) {
          mongoshArgs.push('--tlsCertificateKeyFile', config.tlsCertPath);
        }
      } else {
        // Local: ejecutar dentro del contenedor Docker
        const localResult = await this.systemUtils.execute(
          'docker',
          ['exec', this.containerName, 'mongosh', '--port', '27019', config.database, '--quiet', '--eval', script],
          { silent: true }
        );

        if (localResult.success && localResult.stdout) {
          const lines = localResult.stdout.trim().split('\n');
          const versions = lines
            .filter(line => line.trim().startsWith('{'))
            .map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(v => v !== null);

          spinner.succeed('Versiones consultadas (LOCAL)');
          this.displayVersions(versions);
          return;
        } else {
          spinner.fail('Error consultando versiones (LOCAL)');
          console.log(chalk.red('\n  ✖ No se pudo consultar las versiones'));
          console.log(chalk.gray(`  success: ${localResult.success}`));
          if (localResult.stdout) {
            console.log(chalk.gray(`  stdout: ${localResult.stdout.substring(0, 300)}`));
          }
          if (localResult.stderr) {
            console.log(chalk.gray(`  stderr: ${localResult.stderr.substring(0, 300)}`));
          }
          if (localResult.error) {
            console.log(chalk.gray(`  error: ${localResult.error}`));
          }
          console.log('');
          return;
        }
      }

      // Para conexión remota, usar mongosh local
      mongoshArgs.push('--quiet', '--eval', script);

      const result = await this.systemUtils.execute(
        'mongosh',
        mongoshArgs,
        { silent: true }
      );

      if (result.success && result.stdout) {
        const lines = result.stdout.trim().split('\n');
        const versions = lines
          .filter(line => line.trim().startsWith('{'))
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(v => v !== null);

        spinner.succeed('Versiones consultadas (PRODUCCIÓN)');
        this.displayVersions(versions);
      } else {
        spinner.fail('Error consultando versiones');
        console.log(chalk.red('\n  ✖ No se pudo consultar las versiones'));
        console.log(chalk.gray(`  success: ${result.success}`));
        if (result.stdout) {
          console.log(chalk.gray(`  stdout: ${result.stdout.substring(0, 300)}`));
        }
        if (result.stderr) {
          console.log(chalk.gray(`  stderr: ${result.stderr.substring(0, 300)}`));
        }
        if (result.error) {
          console.log(chalk.gray(`  error: ${result.error}`));
        }
        console.log('');
      }
    } catch (error) {
      console.log(chalk.red('\n  ✖ Error consultando versiones'));
      console.log(chalk.gray(`  Error type: ${typeof error}`));
      console.log(chalk.gray(`  Error message: ${error?.message || 'N/A'}`));
      console.log(chalk.gray(`  Error stack: ${error?.stack?.substring(0, 200) || 'N/A'}`));
      console.log(chalk.gray(`  Error object: ${JSON.stringify(error, null, 2).substring(0, 300)}`));
      console.log('');
    }
  }

  /**
   * Muestra las versiones en formato tabla
   */
  displayVersions(versions) {
    console.log('');
    console.log(chalk.cyan('📊 Versiones disponibles:'));
    console.log('');

    if (versions.length === 0) {
      console.log(chalk.yellow('  No hay versiones almacenadas en la base de datos'));
    } else {
      console.log(chalk.gray(`  ${'Versión'.padEnd(20)} ${'Processing States'.padEnd(20)} ${'Total Proyectos'.padEnd(20)}`));
      console.log(chalk.gray('  ' + '-'.repeat(60)));
      for (const v of versions) {
        const version = v._id || 'sin versión';
        console.log(`  ${version.padEnd(20)} ${String(v.count).padEnd(20)} ${String(v.totalProjects).padEnd(20)}`);
      }
    }
    console.log('');
  }

  /**
   * Elimina una versión específica de la base de datos
   */
  async deleteVersion() {
    const inquirer = (await import('inquirer')).default;
    const ora = (await import('ora')).default;

    console.log(chalk.blue('\n🗑️  Eliminar versión de la base de datos\n'));

    try {
      // Cargar configuración desde .env
      const config = await this.loadIndexerDbConfig();

      // Mostrar a qué BD nos estamos conectando
      const dbInfo = config.isRemote ? chalk.red('PRODUCCIÓN') : chalk.green('LOCAL');
      console.log(chalk.gray(`  Conectando a: ${dbInfo}\n`));

      // Script para obtener lista de versiones
      const script = `db.getSiblingDB("${config.database}").processing_states.distinct("Version")`;

      let result;
      if (config.isRemote) {
        // Usar mongosh local para conexión remota
        const mongoshArgs = [config.connectionString];

        if (config.tlsCertPath && await this.systemUtils.exists(config.tlsCertPath)) {
          mongoshArgs.push('--tlsCertificateKeyFile', config.tlsCertPath);
        }

        mongoshArgs.push('--quiet', '--eval', script);

        result = await this.systemUtils.execute('mongosh', mongoshArgs, { silent: true });
      } else {
        // Usar docker exec para conexión local
        result = await this.systemUtils.execute(
          'docker',
          ['exec', this.containerName, 'mongosh', '--port', '27019', config.database, '--quiet', '--eval', script],
          { silent: true }
        );
      }

      let versions = [];
      if (result.success && result.stdout) {
        const output = result.stdout.trim();
        try {
          // Buscar el array JSON en el output
          const jsonMatch = output.match(/\[.*\]/s);
          if (jsonMatch) {
            versions = JSON.parse(jsonMatch[0]).filter(v => v !== null);
          }
        } catch (error) {
          console.error(chalk.red(`Error parseando versiones: ${error.message}\n`));
          return;
        }
      }

      if (versions.length === 0) {
        console.log(chalk.yellow('⚠️  No hay versiones disponibles para eliminar\n'));
        return;
      }

      // Preguntar qué versión eliminar
      const { version } = await inquirer.prompt([
        {
          type: 'list',
          name: 'version',
          message: 'Selecciona la versión a eliminar:',
          choices: versions.map(v => ({ name: v, value: v }))
        }
      ]);

      // Confirmar eliminación
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: chalk.red(`⚠️  ¿Estás seguro de eliminar la versión "${version}"? Esta acción NO se puede deshacer.`),
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.gray('\n  Operación cancelada\n'));
        return;
      }

      const spinner = ora(`Eliminando versión "${version}" (${dbInfo})...`).start();

      // Script para eliminar (single line for Windows compatibility):
      // 1. Buscar processing_states con esa versión
      // 2. Eliminar todos los projects relacionados
      // 3. Eliminar los processing_states
      const deleteScript = `var db = db.getSiblingDB("${config.database}"); var states = db.processing_states.find({ Version: "${version}" }).toArray(); var totalProjects = 0; var totalStates = 0; states.forEach(function(state) { var stateId = state._id.toString(); var deletedProjects = db.projects.deleteMany({ ProcessingStateId: stateId }); totalProjects += deletedProjects.deletedCount; }); var deletedStates = db.processing_states.deleteMany({ Version: "${version}" }); totalStates = deletedStates.deletedCount; print(JSON.stringify({ states: totalStates, projects: totalProjects }));`;

      let deleteResult;
      if (config.isRemote) {
        // Usar mongosh local para conexión remota
        const mongoshArgs = [config.connectionString];

        if (config.tlsCertPath && await this.systemUtils.exists(config.tlsCertPath)) {
          mongoshArgs.push('--tlsCertificateKeyFile', config.tlsCertPath);
        }

        mongoshArgs.push('--quiet', '--eval', deleteScript);

        deleteResult = await this.systemUtils.execute('mongosh', mongoshArgs, { silent: true });
      } else {
        // Usar docker exec para conexión local
        deleteResult = await this.systemUtils.execute(
          'docker',
          ['exec', this.containerName, 'mongosh', '--port', '27019', config.database, '--quiet', '--eval', deleteScript],
          { silent: true }
        );
      }

      if (deleteResult.success && deleteResult.stdout) {
        try {
          // Buscar el JSON en el output
          const jsonMatch = deleteResult.stdout.trim().match(/\{.*\}/);
          if (jsonMatch) {
            const stats = JSON.parse(jsonMatch[0]);
            spinner.succeed('Versión eliminada exitosamente');
            console.log('');
            console.log(chalk.green(`  ✓ Processing States eliminados: ${stats.states}`));
            console.log(chalk.green(`  ✓ Proyectos eliminados: ${stats.projects}`));
            console.log('');
          } else {
            spinner.succeed('Versión eliminada');
          }
        } catch (error) {
          spinner.succeed('Versión eliminada (sin estadísticas)');
        }
      } else {
        spinner.fail('Error eliminando versión');
        console.log(chalk.red('  No se pudo completar la eliminación\n'));
      }
    } catch (error) {
      console.error(chalk.red(`  Error: ${error.message}\n`));
    }
  }

  /**
   * Limpia MongoDB (elimina contenedor y volúmenes)
   */
  async clean() {
    console.log(chalk.blue('\n🧹 Limpiando MongoDB\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    console.log(chalk.yellow('⚠️  Esta operación eliminará:'));
    console.log(chalk.gray('   - Contenedor: grafo-mongodb'));
    console.log(chalk.gray('   - Volúmenes de datos'));
    console.log(chalk.gray('   - TODOS los datos almacenados\n'));

    // Detener y remover
    const spinner = ora('Removiendo contenedor...').start();

    // Detener el servicio
    await this.systemUtils.execute(
      'docker-compose',
      ['-f', this.composeFile, '-p', this.projectName, 'stop', this.serviceName],
      { silent: true }
    );

    // Remover el contenedor
    await this.systemUtils.execute(
      'docker-compose',
      ['-f', this.composeFile, '-p', this.projectName, 'rm', '-f', this.serviceName],
      { silent: true }
    );

    // Remover volúmenes
    await this.systemUtils.execute(
      'docker',
      ['volume', 'rm', 'grafo-mongodb-data', 'grafo-mongodb-config'],
      { silent: true }
    ).catch(() => {}); // Ignorar si no existen

    spinner.succeed('MongoDB limpiado');
    console.log(chalk.gray('\n  Para volver a usar: grafo mongodb start\n'));
  }
}
