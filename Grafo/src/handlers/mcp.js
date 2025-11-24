import { spawn } from 'cross-spawn';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MCPHandler {
  constructor(systemUtils, mongodbHandler) {
    this.systemUtils = systemUtils;
    this.mongodbHandler = mongodbHandler;
    this.composeFile = path.resolve(__dirname, '../../docker-compose.yml');
    this.projectName = 'grafo';
    this.serviceName = 'mcp-server';
    this.containerName = 'grafo-mcp-server';
    this.networkName = 'grafo-network';
  }

  /**
   * Muestra la configuración JSON para Cursor/VSCode
   */
  displayMCPConfig() {
    console.log(chalk.cyan('\n📝 Configuración para Cursor/VSCode:\n'));
    console.log(chalk.gray('  El servidor MCP está ejecutándose en HTTP/SSE en el puerto 8082.'));
    console.log(chalk.gray('  Múltiples clientes pueden conectarse simultáneamente.\n'));
    console.log(chalk.gray('  Copia este JSON en ~/.cursor/mcp.json (o %APPDATA%\\Cursor\\User\\mcp.json en Windows):\n'));

    const config = {
      mcpServers: {
        "grafo-query-http": {
          url: "http://localhost:8082/sse",
          transport: "sse"
        }
      }
    };

    console.log(chalk.white(JSON.stringify(config, null, 2)));
    console.log();
    console.log(chalk.cyan('  📡 Endpoints disponibles:'));
    console.log(chalk.gray('    SSE:    http://localhost:8082/sse'));
    console.log(chalk.gray('    Health: http://localhost:8082/health'));
    console.log(chalk.gray('    Info:   http://localhost:8082/'));
    console.log();
    console.log(chalk.gray('  💡 Nota: Múltiples clientes Cursor pueden usar el mismo servidor simultáneamente.'));
    console.log();
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
   * Verifica el estado del MCP Server
   */
  async status() {
    console.log(chalk.blue('\n📊 Estado del MCP Server\n'));

    try {
      const containerCheck = await this.systemUtils.execute(
        'docker',
        ['ps', '-a', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}\t{{.Status}}'],
        { silent: true }
      );

      if (!containerCheck.success || !containerCheck.stdout.trim()) {
        console.log(chalk.yellow('⚠️  Contenedor MCP Server no existe'));
        console.log(chalk.gray('   Ejecuta: grafo mcp build && grafo mcp start\n'));
        return;
      }

      const [name, status] = containerCheck.stdout.trim().split('\t');
      const isRunning = status.toLowerCase().includes('up');

      if (isRunning) {
        console.log(chalk.green('✓ MCP Server está CORRIENDO'));
        console.log(chalk.gray(`  Estado: ${status}`));

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

        this.displayMCPConfig();
      } else {
        console.log(chalk.yellow('⚠️  MCP Server está DETENIDO'));
        console.log(chalk.gray(`  Estado: ${status}`));
        console.log(chalk.gray('  Ejecuta: grafo mcp start\n'));
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Error verificando estado: ${error.error || error.message}\n`));
    }
  }

  /**
   * Build de la imagen Docker del MCP Server
   */
  async build() {
    console.log(chalk.blue('\n🔨 Building MCP Server Image\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    const spinner = ora('Construyendo imagen Docker...').start();

    try {
      const result = await this.systemUtils.execute(
        'docker-compose',
        ['-f', this.composeFile, '-p', this.projectName, 'build', this.serviceName],
        { silent: false }
      );

      if (!result.success) {
        spinner.fail('Error construyendo imagen');
        return;
      }

      spinner.succeed('Imagen construida');
      console.log(chalk.gray('\n  Siguiente paso: grafo mcp start\n'));
    } catch (error) {
      spinner.fail('Error construyendo imagen');
      console.error(chalk.red(`\n  ${error.error || error.message}\n`));
    }
  }

  /**
   * Inicia el MCP Server
   */
  async start() {
    console.log(chalk.blue('\n🚀 Iniciando MCP Server\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    try {
      // Verificar MongoDB primero
      console.log(chalk.cyan('📡 Verificando MongoDB...'));
      const mongoCheck = await this.systemUtils.execute(
        'docker',
        ['ps', '--filter', 'name=grafo-mongodb', '--format', '{{.Names}}'],
        { silent: true }
      );

      if (mongoCheck.stdout.trim() !== 'grafo-mongodb') {
        console.log(chalk.yellow('⚠️  MongoDB no está corriendo'));
        console.log(chalk.gray('   Iniciando MongoDB automáticamente...\n'));
        await this.mongodbHandler.start();
        await this.systemUtils.wait(3000);
      } else {
        console.log(chalk.green('✓ MongoDB está corriendo\n'));
      }

      // Verificar si ya está corriendo
      const checkResult = await this.systemUtils.execute(
        'docker',
        ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
        { silent: true }
      );

      if (checkResult.stdout.trim() === this.containerName) {
        console.log(chalk.yellow('⚠️  MCP Server ya está corriendo'));
        await this.status();
        return;
      }

      // Crear red si no existe
      await this.systemUtils.execute(
        'docker',
        ['network', 'create', this.networkName],
        { silent: true }
      ).catch(() => {}); // Ignorar si ya existe

      // Iniciar con docker-compose
      const spinner = ora('Iniciando MCP Server...').start();

      const result = await this.systemUtils.execute(
        'docker-compose',
        ['-f', this.composeFile, '-p', this.projectName, 'up', '-d', this.serviceName],
        { silent: false }
      );

      if (!result.success) {
        spinner.fail('Error iniciando MCP Server');
        return;
      }

      spinner.succeed('MCP Server iniciado');

      // Esperar health check
      const healthSpinner = ora('Esperando health check...').start();
      await this.systemUtils.wait(5000);

      const healthResult = await this.systemUtils.execute(
        'docker',
        ['inspect', '--format', '{{.State.Health.Status}}', this.containerName],
        { silent: true }
      );

      const health = healthResult.stdout.trim();
      if (health === 'healthy') {
        healthSpinner.succeed('MCP Server está saludable');
      } else if (health === 'starting') {
        healthSpinner.info('MCP Server está iniciando (health check en progreso)');
      } else {
        healthSpinner.warn('Health check pendiente');
      }

      console.log(chalk.green('\n✅ MCP Server listo para usar'));

      this.displayMCPConfig();

      console.log(chalk.cyan('  Comandos útiles:'));
      console.log(chalk.gray('    grafo mcp status  - Ver estado'));
      console.log(chalk.gray('    grafo mcp logs    - Ver logs'));
      console.log(chalk.gray('    grafo mcp test    - Ejecutar tests\n'));
    } catch (error) {
      console.error(chalk.red(`\n❌ Error iniciando MCP Server: ${error.error || error.message}\n`));
    }
  }

  /**
   * Detiene el MCP Server
   */
  async stop() {
    console.log(chalk.blue('\n🛑 Deteniendo MCP Server\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    const spinner = ora('Deteniendo MCP Server...').start();

    const result = await this.systemUtils.execute(
      'docker-compose',
      ['-f', this.composeFile, '-p', this.projectName, 'stop', this.serviceName],
      { silent: true }
    );

    if (!result.success) {
      spinner.fail('Error deteniendo MCP Server');
      return;
    }

    spinner.succeed('MCP Server detenido');
    console.log(chalk.gray('\n  Para volver a iniciar: grafo mcp start\n'));
  }

  /**
   * Reinicia el MCP Server
   */
  async restart() {
    console.log(chalk.blue('\n🔄 Reiniciando MCP Server\n'));
    await this.stop();
    await this.systemUtils.wait(2000);
    await this.start();
  }

  /**
   * Muestra logs del MCP Server
   */
  async logs() {
    console.log(chalk.blue('\n📋 Logs del MCP Server (Ctrl+C para salir)\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    const checkResult = await this.systemUtils.execute(
      'docker',
      ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
      { silent: true }
    );

    if (checkResult.stdout.trim() !== this.containerName) {
      console.log(chalk.yellow('⚠️  MCP Server no está corriendo'));
      return;
    }

    const child = spawn('docker-compose', ['-f', this.composeFile, '-p', this.projectName, 'logs', '-f', '--tail=100', this.serviceName], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  }

  /**
   * Ejecuta tests del MCP Server
   */
  async test() {
    console.log(chalk.blue('\n🧪 Ejecutando tests del MCP Server\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    const checkResult = await this.systemUtils.execute(
      'docker',
      ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
      { silent: true }
    );

    if (checkResult.stdout.trim() !== this.containerName) {
      console.log(chalk.yellow('⚠️  MCP Server no está corriendo'));
      console.log(chalk.gray('   Ejecuta: grafo mcp start\n'));
      return;
    }

    const child = spawn('docker', ['exec', '-it', this.containerName, 'python', 'test_mcp.py'], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  }

  /**
   * Abre shell en el contenedor
   */
  async shell() {
    console.log(chalk.blue('\n🐚 Abriendo Shell en MCP Server\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    const checkResult = await this.systemUtils.execute(
      'docker',
      ['ps', '--filter', `name=${this.containerName}`, '--format', '{{.Names}}'],
      { silent: true }
    );

    if (checkResult.stdout.trim() !== this.containerName) {
      console.log(chalk.yellow('⚠️  MCP Server no está corriendo'));
      console.log(chalk.gray('   Ejecuta: grafo mcp start\n'));
      return;
    }

    const child = spawn('docker', ['exec', '-it', this.containerName, '/bin/bash'], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(chalk.red(`Error: ${error.message}`));
    });
  }

  /**
   * Limpia el MCP Server (elimina contenedor)
   */
  async clean() {
    console.log(chalk.blue('\n🧹 Limpiando MCP Server\n'));

    if (!(await this.checkDocker())) {
      return;
    }

    console.log(chalk.yellow('⚠️  Esta operación eliminará:'));
    console.log(chalk.gray('   - Contenedor: grafo-mcp-server'));
    console.log(chalk.gray('   - Imagen: grafo-mcp-server:latest\n'));

    const spinner = ora('Removiendo contenedor e imagen...').start();

    try {
      // Detener el servicio (ignorar error si no existe)
      try {
        await this.systemUtils.execute(
          'docker-compose',
          ['-f', this.composeFile, '-p', this.projectName, 'stop', this.serviceName],
          { silent: true }
        );
      } catch (e) {
        // Ignorar si el servicio no está corriendo
      }

      // Remover el contenedor (ignorar error si no existe)
      try {
        await this.systemUtils.execute(
          'docker-compose',
          ['-f', this.composeFile, '-p', this.projectName, 'rm', '-f', this.serviceName],
          { silent: true }
        );
      } catch (e) {
        // Ignorar si el contenedor no existe
      }

      // Remover la imagen (ignorar error si no existe)
      try {
        await this.systemUtils.execute(
          'docker',
          ['rmi', 'query-mcp-server'],
          { silent: true }
        );
      } catch (e) {
        // Ignorar si la imagen no existe
      }

      spinner.succeed('MCP Server limpiado');
      console.log(chalk.gray('\n  Para volver a usar: grafo mcp build && grafo mcp start\n'));
    } catch (error) {
      spinner.fail('Error al limpiar MCP Server');
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      throw error;
    }
  }
}
