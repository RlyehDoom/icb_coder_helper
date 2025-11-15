import { spawn } from 'cross-spawn';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MongoDBHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.composeFile = path.resolve(__dirname, '../../docker-compose.yml');
    this.projectName = 'grafo';
    this.serviceName = 'mongodb';
    this.containerName = 'grafo-mongodb';
    this.networkName = 'grafo-network';
  }

  /**
   * Verifica si Docker está instalado y funcionando
   */
  async checkDocker() {
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
   * Abre shell de MongoDB (mongosh)
   */
  async shell() {
    console.log(chalk.blue('\n🐚 Abriendo MongoDB Shell\n'));

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

    console.log(chalk.gray('  Conectando a: mongodb://localhost:27017/'));
    console.log(chalk.gray('  Database: GraphDB'));
    console.log(chalk.gray('  Escribe "exit" para salir\n'));

    const child = spawn('docker', ['exec', '-it', this.containerName, 'mongosh', 'GraphDB'], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
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
