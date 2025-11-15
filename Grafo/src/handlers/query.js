import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import { displayProgressStart, displayProgressEnd, displayError, displaySuccess, displayInfo, displayWarning } from '../utils/display.js';

export class QueryHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.queryDir = path.resolve('./Grafo/Query');
    this.dockerComposePath = path.resolve('./Grafo/docker-compose.yml');
    this.dockerfilePath = path.join(this.queryDir, 'Dockerfile');
    this.projectName = 'grafo';
    this.serviceName = 'query-service';
    this.containerName = 'grafo-query-service';
    this.port = 8081;
  }

  async build() {
    displayProgressStart('Construyendo imagen Docker de Query Service');
    
    // Verificar que Docker esté disponible
    if (!(await this.systemUtils.isCommandAvailable('docker'))) {
      displayError('Docker no está instalado o no está en PATH');
      displayInfo('Por favor, instala Docker Desktop desde https://www.docker.com/products/docker-desktop');
      return false;
    }

    // Verificar que existe el directorio
    if (!(await this.systemUtils.exists(this.queryDir))) {
      displayError(`Directorio Query no encontrado: ${this.queryDir}`);
      return false;
    }

    // Verificar que existe el docker-compose.yml
    if (!(await this.systemUtils.exists(this.dockerComposePath))) {
      displayError(`docker-compose.yml no encontrado: ${this.dockerComposePath}`);
      return false;
    }

    try {
      displayInfo('Construyendo imagen Docker...');
      const result = await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'build', this.serviceName], {
        cwd: path.resolve('./Grafo')
      });

      if (result.success) {
        displayProgressEnd('Imagen Docker construida exitosamente');
        displaySuccess('Query Service está listo para ejecutarse');
        return true;
      } else {
        displayProgressEnd('Error al construir la imagen Docker', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante la construcción: ${error.error || error.message}`);
      return false;
    }
  }

  async run(options = {}) {
    displayProgressStart('Levantando Query Service con Docker Compose');
    
    // Verificar que Docker esté disponible
    if (!(await this.systemUtils.isCommandAvailable('docker'))) {
      displayError('Docker no está instalado o no está en PATH');
      return false;
    }

    // Verificar que existe el docker-compose.yml
    if (!(await this.systemUtils.exists(this.dockerComposePath))) {
      displayError(`docker-compose.yml no encontrado: ${this.dockerComposePath}`);
      return false;
    }

    try {
      // Verificar si ya existe un contenedor (corriendo o detenido)
      const statusResult = await this.getContainerStatus();
      if (statusResult.exists) {
        if (statusResult.isRunning) {
          displayWarning('Contenedor existente encontrado en ejecución');
        } else {
          displayWarning('Contenedor existente encontrado detenido');
        }
        displayInfo('Eliminando contenedor existente para usar imagen actualizada...');
        
        // Eliminar el contenedor existente sin preguntar
        await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'stop', this.serviceName], {
          cwd: path.resolve('./Grafo')
        });

        const downResult = await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'rm', '-f', this.serviceName], {
          cwd: path.resolve('./Grafo')
        });

        if (!downResult.success) {
          displayWarning('No se pudo eliminar el contenedor anterior, continuando...');
        } else {
          displaySuccess('Contenedor anterior eliminado');
        }
      }

      displayInfo('Creando nuevo contenedor con imagen actualizada...');
      const detached = options.detached !== false; // Por defecto en modo detached

      const args = ['-f', this.dockerComposePath, '-p', this.projectName, 'up'];
      if (detached) {
        args.push('-d');
      }
      args.push(this.serviceName);

      const result = await this.systemUtils.execute('docker-compose', args, {
        cwd: path.resolve('./Grafo')
      });

      if (result.success) {
        displayProgressEnd('Query Service iniciado exitosamente');
        displaySuccess(`✓ Servicio disponible en: http://localhost:${this.port}`);
        displaySuccess(`✓ API Docs: http://localhost:${this.port}/docs`);
        displayInfo('\nPara ver los logs en tiempo real, usa: grafo query logs');
        displayInfo('Para detener el servicio, usa: grafo query stop');
        return true;
      } else {
        displayProgressEnd('Error al iniciar Query Service', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante la ejecución: ${error.error || error.message}`);
      return false;
    }
  }

  async stop() {
    displayProgressStart('Deteniendo Query Service');

    try {
      const result = await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'stop', this.serviceName], {
        cwd: path.resolve('./Grafo')
      });

      if (result.success) {
        displayProgressEnd('Query Service detenido exitosamente');
        return true;
      } else {
        displayProgressEnd('Error al detener Query Service', false);
        return false;
      }
    } catch (error) {
      displayError(`Error al detener el servicio: ${error.error || error.message}`);
      return false;
    }
  }

  async delete(options = {}) {
    displayProgressStart('Eliminando contenedores y recursos de Query Service');

    try {
      // Detener el servicio
      await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'stop', this.serviceName], {
        cwd: path.resolve('./Grafo')
      });

      // Remover el contenedor
      const result = await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'rm', '-f', this.serviceName], {
        cwd: path.resolve('./Grafo')
      });

      if (result.success) {
        displayProgressEnd('Contenedores y recursos eliminados exitosamente');
        return true;
      } else {
        displayProgressEnd('Error al eliminar recursos', false);
        return false;
      }
    } catch (error) {
      displayError(`Error al eliminar recursos: ${error.error || error.message}`);
      return false;
    }
  }

  async restart() {
    displayProgressStart('Reiniciando Query Service');

    try {
      const result = await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'restart', this.serviceName], {
        cwd: path.resolve('./Grafo')
      });

      if (result.success) {
        displayProgressEnd('Query Service reiniciado exitosamente');
        displaySuccess(`✓ Servicio disponible en: http://localhost:${this.port}`);
        return true;
      } else {
        displayProgressEnd('Error al reiniciar Query Service', false);
        return false;
      }
    } catch (error) {
      displayError(`Error al reiniciar el servicio: ${error.error || error.message}`);
      return false;
    }
  }

  async logs(options = {}) {
    displayInfo('Mostrando logs de Query Service...');
    displayInfo('Presiona Ctrl+C para salir\n');

    try {
      const args = ['-f', this.dockerComposePath, '-p', this.projectName, 'logs'];

      if (options.follow !== false) {
        args.push('-f'); // Follow logs por defecto
      }

      if (options.tail) {
        args.push('--tail', options.tail.toString());
      }

      args.push(this.serviceName);

      await this.systemUtils.execute('docker-compose', args, {
        cwd: path.resolve('./Grafo'),
        stdio: 'inherit'
      });

      return true;
    } catch (error) {
      // Ctrl+C es esperado, no mostrar error
      if (error.code !== 130 && error.code !== 'SIGINT') {
        displayError(`Error al mostrar logs: ${error.error || error.message}`);
        return false;
      }
      return true;
    }
  }

  async getContainerStatus() {
    try {
      const result = await this.systemUtils.executeShell(
        `docker ps -a --filter "name=${this.containerName}" --format "{{.Status}}"`,
        { silent: true }
      );

      const status = result.stdout || '';
      const isRunning = status.toLowerCase().includes('up');
      const exists = status.length > 0;

      return {
        exists,
        isRunning,
        status: status || 'Not found'
      };
    } catch (error) {
      return {
        exists: false,
        isRunning: false,
        status: 'Error checking status'
      };
    }
  }

  async status() {
    console.log(chalk.cyan('📊 Estado del Query Service:'));
    
    // Verificar Docker
    const dockerAvailable = await this.systemUtils.isCommandAvailable('docker');
    console.log(chalk.gray('  Docker:'), dockerAvailable ? chalk.green('✓') : chalk.red('✗'));

    if (dockerAvailable) {
      try {
        const result = await this.systemUtils.executeShell('docker --version', { silent: true });
        if (result.success) {
          console.log(chalk.gray('  Versión:'), result.stdout);
        }
      } catch {
        // Ignorar errores al obtener versión de Docker
      }
    }

    // Verificar Docker Compose
    const composeAvailable = await this.systemUtils.isCommandAvailable('docker-compose');
    console.log(chalk.gray('  Docker Compose:'), composeAvailable ? chalk.green('✓') : chalk.red('✗'));

    if (composeAvailable) {
      try {
        const result = await this.systemUtils.executeShell('docker-compose --version', { silent: true });
        if (result.success) {
          console.log(chalk.gray('  Versión:'), result.stdout);
        }
      } catch {
        // Ignorar errores al obtener versión de Docker Compose
      }
    }

    // Verificar directorio
    const queryExists = await this.systemUtils.exists(this.queryDir);
    console.log(chalk.gray('  Directorio Query:'), queryExists ? chalk.green('✓') : chalk.red('✗'));

    if (queryExists) {
      // Verificar archivos necesarios
      const dockerComposeExists = await this.systemUtils.exists(this.dockerComposePath);
      console.log(chalk.gray('  docker-compose.yml:'), dockerComposeExists ? chalk.green('✓') : chalk.red('✗'));

      const dockerfileExists = await this.systemUtils.exists(this.dockerfilePath);
      console.log(chalk.gray('  Dockerfile:'), dockerfileExists ? chalk.green('✓') : chalk.red('✗'));

      const requirementsPath = path.join(this.queryDir, 'requirements.txt');
      const requirementsExists = await this.systemUtils.exists(requirementsPath);
      console.log(chalk.gray('  requirements.txt:'), requirementsExists ? chalk.green('✓') : chalk.red('✗'));

      const srcPath = path.join(this.queryDir, 'src');
      const srcExists = await this.systemUtils.exists(srcPath);
      console.log(chalk.gray('  Directorio src:'), srcExists ? chalk.green('✓') : chalk.red('✗'));

      // Verificar estado del contenedor
      if (dockerAvailable && composeAvailable) {
        const containerStatus = await this.getContainerStatus();
        
        let containerStatusDisplay;
        if (!containerStatus.exists) {
          containerStatusDisplay = chalk.gray('Not created');
        } else if (containerStatus.isRunning) {
          containerStatusDisplay = chalk.green('Running');
        } else {
          containerStatusDisplay = chalk.yellow('Stopped');
        }
        console.log(chalk.gray('  Contenedor:'), containerStatusDisplay);

        if (containerStatus.exists) {
          console.log(chalk.gray('  Estado:'), containerStatus.status);
        }

        if (containerStatus.isRunning) {
          console.log(chalk.gray('  URL:'), chalk.blue(`http://localhost:${this.port}`));
          console.log(chalk.gray('  API Docs:'), chalk.blue(`http://localhost:${this.port}/docs`));
        }

        // Verificar puerto
        const portAvailable = await this.systemUtils.isPortAvailable(this.port);
        if (!portAvailable && !containerStatus.isRunning) {
          console.log(chalk.gray('  Puerto 8081:'), chalk.yellow('En uso por otro proceso'));
        }
      }

      // Verificar conexión a MongoDB
      if (dockerComposeExists) {
        try {
          const composeContent = await fs.readFile(this.dockerComposePath, 'utf8');
          const mongoConnection = composeContent.match(/MONGODB_CONNECTION_STRING=([^\n]+)/);
          if (mongoConnection) {
            console.log(chalk.gray('  MongoDB Config:'), chalk.green('✓'));
          }
        } catch {
          // Ignorar errores al leer configuración de MongoDB
        }
      }
    }

    return true;
  }

  async clean() {
    displayProgressStart('Limpiando recursos de Query Service');
    
    try {
      // Detener y eliminar contenedores
      await this.delete({ skipConfirm: true, volumes: false });
      
      // Eliminar imágenes relacionadas
      const { removeImages } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'removeImages',
          message: '¿Deseas eliminar también las imágenes Docker construidas?',
          default: false
        }
      ]);

      if (removeImages) {
        try {
          await this.systemUtils.executeShell(
            `docker images --filter "reference=*query*" -q | ForEach-Object { docker rmi $_ }`,
            { cwd: this.queryDir }
          );
          displaySuccess('Imágenes Docker eliminadas');
        } catch (error) {
          displayWarning('No se pudieron eliminar algunas imágenes');
        }
      }

      displayProgressEnd('Limpieza completada');
      return true;
    } catch (error) {
      displayError(`Error durante la limpieza: ${error.error || error.message}`);
      return false;
    }
  }

  async exec(command) {
    displayInfo(`Ejecutando comando en el contenedor: ${command}`);

    try {
      await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'exec', this.serviceName, 'sh', '-c', command], {
        cwd: path.resolve('./Grafo'),
        stdio: 'inherit'
      });

      return true;
    } catch (error) {
      displayError(`Error al ejecutar comando: ${error.error || error.message}`);
      return false;
    }
  }

  async shell() {
    displayInfo('Abriendo shell interactivo en el contenedor...');
    displayInfo('Usa "exit" para salir\n');

    try {
      await this.systemUtils.execute('docker-compose', ['-f', this.dockerComposePath, '-p', this.projectName, 'exec', this.serviceName, 'sh'], {
        cwd: path.resolve('./Grafo'),
        stdio: 'inherit'
      });

      return true;
    } catch (error) {
      displayError(`Error al abrir shell: ${error.error || error.message}`);
      return false;
    }
  }

  async test() {
    displayProgressStart('Ejecutando tests de Query Service');
    
    try {
      // Verificar que el contenedor esté corriendo
      const containerStatus = await this.getContainerStatus();
      if (!containerStatus.isRunning) {
        displayWarning('El contenedor no está corriendo. Iniciando...');
        const started = await this.run({ detached: true });
        if (!started) {
          displayError('No se pudo iniciar el contenedor');
          return false;
        }
        // Esperar un poco para que el servicio esté listo
        await this.systemUtils.sleep(3000);
      }

      displayInfo('Ejecutando tests...');

      // Ejecutar tests dentro del contenedor
      const result = await this.systemUtils.execute('docker-compose',
        ['-f', this.dockerComposePath, '-p', this.projectName, 'exec', '-T', this.serviceName, 'python', '-m', 'pytest', 'tests/', '-v'],
        { cwd: path.resolve('./Grafo') }
      );

      if (result.success) {
        displayProgressEnd('Tests ejecutados exitosamente');
        return true;
      } else {
        displayProgressEnd('Algunos tests fallaron', false);
        return false;
      }
    } catch (error) {
      displayError(`Error al ejecutar tests: ${error.error || error.message}`);
      return false;
    }
  }
}

