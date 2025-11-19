import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import { displayProgressStart, displayProgressEnd, displayError, displaySuccess, displayInfo, displayWarning } from '../utils/display.js';

export class IndexerDbHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.indexerDbDir = path.resolve('./IndexerDb');
    this.projectFile = path.join(this.indexerDbDir, 'IndexerDb.csproj');
    this.executable = path.join(this.indexerDbDir, 'bin', 'Debug', 'net8.0', 'IndexerDb.dll');
  }

  async build() {
    displayProgressStart('Compilando IndexerDb');
    
    // Verificar que .NET esté disponible
    if (!(await this.systemUtils.isCommandAvailable('dotnet'))) {
      displayError('.NET SDK no está instalado o no está en PATH');
      return false;
    }

    // Verificar que existe el directorio
    if (!(await this.systemUtils.exists(this.indexerDbDir))) {
      displayError(`Directorio IndexerDb no encontrado: ${this.indexerDbDir}`);
      return false;
    }

    try {
      const result = await this.systemUtils.execute('dotnet', ['build'], {
        cwd: this.indexerDbDir
      });

      if (result.success) {
        displayProgressEnd('IndexerDb compilado exitosamente');
        
        // Verificar que el ejecutable fue creado
        if (await this.systemUtils.exists(this.executable)) {
          displaySuccess(`Ejecutable disponible en: ${this.executable}`);
        }
        
        return true;
      } else {
        displayProgressEnd('Error al compilar IndexerDb', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante la compilación: ${error.error || error.message}`);
      return false;
    }
  }

  async clean() {
    displayProgressStart('Limpiando artefactos de compilación de IndexerDb');
    
    try {
      await this.systemUtils.execute('dotnet', ['clean'], {
        cwd: this.indexerDbDir
      });

      displayProgressEnd('Limpieza completada');
      return true;
    } catch (error) {
      displayError(`Error durante la limpieza: ${error.error || error.message}`);
      return false;
    }
  }

  async run(options = {}) {
    const environment = options.production ? 'Production' : 'Development';
    const envLabel = options.production ? chalk.red.bold('PRODUCCIÓN') : chalk.green('Development');

    displayProgressStart(`Ejecutando IndexerDb [${envLabel}]`);

    // Verificar que .NET esté disponible
    if (!(await this.systemUtils.isCommandAvailable('dotnet'))) {
      displayError('.NET SDK no está instalado o no está en PATH');
      return false;
    }

    // Verificar certificado si es producción (opcional - solo si está configurado)
    if (options.production) {
      const certPath = path.resolve('./Certs/prod/client.pem');
      if (await this.systemUtils.exists(certPath)) {
        displayInfo(`✓ Certificado TLS disponible: ${certPath}`);
      } else {
        displayInfo('ℹ️  Conectando sin certificado de cliente (TLS sin validación)');
      }
    }

    // Verificar que existe el ejecutable
    if (!(await this.systemUtils.exists(this.executable))) {
      displayInfo('Ejecutable no encontrado, compilando...');
      if (!(await this.build())) {
        return false;
      }
    }

    try {
      const args = ['run'];

      // Agregar opciones según los parámetros
      const dotnetArgs = [];

      if (options.file) {
        dotnetArgs.push('--file', options.file);
      } else if (options.noInteractive) {
        dotnetArgs.push('--all');
      }

      if (options.interactive) {
        dotnetArgs.push('--interactive');
      }

      if (dotnetArgs.length > 0) {
        args.push('--', ...dotnetArgs);
      }

      displayInfo(`Iniciando IndexerDb en modo ${environment}...`);
      if (options.production) {
        displayWarning('⚠️  Conectándose a MongoDB PRODUCTIVO (207.244.249.22:28101)');
      }
      displayInfo('Presiona Ctrl+C para salir');

      const result = await this.systemUtils.execute('dotnet', args, {
        cwd: this.indexerDbDir,
        stdio: 'inherit', // Permite interacción con el usuario
        env: {
          ...process.env,
          DOTNET_ENVIRONMENT: environment
        }
      });

      if (result.success) {
        displayProgressEnd('IndexerDb ejecutado exitosamente');
        return true;
      } else {
        displayProgressEnd('Error al ejecutar IndexerDb', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante la ejecución: ${error.error || error.message}`);
      return false;
    }
  }

  async runInteractive() {
    displayInfo('Modo interactivo de IndexerDb...');

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'environment',
        message: '¿En qué ambiente deseas ejecutar?',
        choices: [
          { name: '🟢 Development (MongoDB local - 27019)', value: 'development' },
          { name: '🔴 Production (MongoDB remoto - TLS)', value: 'production' }
        ]
      },
      {
        type: 'list',
        name: 'mode',
        message: '¿Cómo deseas ejecutar IndexerDb?',
        choices: [
          { name: '📋 Selección interactiva', value: 'interactive' },
          { name: '📁 Archivo específico', value: 'file' },
          { name: '🚀 Procesar todos los archivos', value: 'all' },
          { name: '🔍 Modo query interactivo', value: 'query' },
          { name: '❓ Mostrar ayuda', value: 'help' }
        ]
      }
    ]);

    const isProduction = answers.environment === 'production';

    // Si es producción, verificar certificado antes de continuar
    if (isProduction) {
      const certPath = path.resolve('./Certs/prod/client.pem');
      if (!(await this.systemUtils.exists(certPath))) {
        displayError(`Certificado TLS no encontrado: ${certPath}`);
        displayInfo('Para producción, el certificado debe estar en Grafo/Certs/prod/client.pem');
        return false;
      }
    }

    switch (answers.mode) {
      case 'interactive':
        return await this.run({ production: isProduction });

      case 'file': {
        const { filePath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: 'Ruta al archivo de grafo:',
            validate: async (input) => {
              if (!input || input.trim() === '') {
                return 'La ruta es requerida';
              }
              const resolvedPath = path.resolve(input);
              if (!(await this.systemUtils.exists(resolvedPath))) {
                return 'El archivo no existe';
              }
              if (!input.endsWith('-graph.json')) {
                return 'El archivo debe terminar en -graph.json';
              }
              return true;
            }
          }
        ]);
        return await this.run({ file: filePath, production: isProduction });
      }

      case 'all':
        displayInfo('Procesando todos los archivos automáticamente...');
        return await this.run({ noInteractive: true, production: isProduction });

      case 'query':
        displayInfo('Entrando en modo query interactivo...');
        return await this.run({ interactive: true, production: isProduction });

      case 'help':
        await this.showHelp();
        return true;

      default:
        return false;
    }
  }

  async showHelp() {
    console.log('');
    console.log(chalk.cyan('📚 IndexerDb - Ayuda'));
    console.log('');
    console.log(chalk.yellow('Modos de ejecución:'));
    console.log('');
    console.log('  1. Modo interactivo (por defecto):');
    console.log(chalk.gray('     grafo indexerdb run'));
    console.log(chalk.gray('     - Muestra lista de archivos disponibles'));
    console.log(chalk.gray('     - Permite seleccionar cuáles procesar'));
    console.log('');
    console.log('  2. Archivo específico:');
    console.log(chalk.gray('     grafo indexerdb run --file <ruta>'));
    console.log(chalk.gray('     - Procesa un archivo específico'));
    console.log('');
    console.log('  3. Procesar todos los archivos:');
    console.log(chalk.gray('     grafo indexerdb run --no-interactive'));
    console.log(chalk.gray('     - Procesa todos automáticamente'));
    console.log('');
    console.log(chalk.yellow('Otros comandos:'));
    console.log('');
    console.log('  build   - Compila el proyecto');
    console.log('  clean   - Limpia artefactos de compilación');
    console.log('  status  - Muestra el estado del servicio');
    console.log('');
  }

  async status() {
    console.log(chalk.cyan('📊 Estado del IndexerDb:'));

    // Verificar .NET
    const dotnetAvailable = await this.systemUtils.isCommandAvailable('dotnet');
    console.log(chalk.gray('  .NET SDK:'), dotnetAvailable ? chalk.green('✓') : chalk.red('✗'));

    if (dotnetAvailable) {
      try {
        const result = await this.systemUtils.executeShell('dotnet --version', { silent: true });
        if (result.success) {
          console.log(chalk.gray('  Versión:'), result.stdout.trim());
        }
      } catch {}
    }

    // Verificar directorio
    const indexerDbExists = await this.systemUtils.exists(this.indexerDbDir);
    console.log(chalk.gray('  Directorio IndexerDb:'), indexerDbExists ? chalk.green('✓') : chalk.red('✗'));

    if (indexerDbExists) {
      // Verificar proyecto
      const projectExists = await this.systemUtils.exists(this.projectFile);
      console.log(chalk.gray('  Archivo proyecto:'), projectExists ? chalk.green('✓') : chalk.red('✗'));

      // Verificar ejecutable
      const exeExists = await this.systemUtils.exists(this.executable);
      console.log(chalk.gray('  Ejecutable:'), exeExists ? chalk.green('✓') : chalk.red('✗'));

      // Verificar configuraciones
      console.log('');
      console.log(chalk.cyan('  📋 Configuraciones:'));

      // Development
      const appsettingsDevPath = path.join(this.indexerDbDir, 'appsettings.Development.json');
      const appsettingsDevExists = await this.systemUtils.exists(appsettingsDevPath);
      console.log(chalk.gray('    Development:'), appsettingsDevExists ? chalk.green('✓') : chalk.red('✗'));

      if (appsettingsDevExists) {
        try {
          const config = await fs.readJson(appsettingsDevPath);
          if (config.MongoDB?.ConnectionString) {
            console.log(chalk.gray('      MongoDB:'), config.MongoDB.ConnectionString);
          }
        } catch {}
      }

      // Production
      const appsettingsProdPath = path.join(this.indexerDbDir, 'appsettings.Production.json');
      const appsettingsProdExists = await this.systemUtils.exists(appsettingsProdPath);
      console.log(chalk.gray('    Production:'), appsettingsProdExists ? chalk.green('✓') : chalk.red('✗'));

      if (appsettingsProdExists) {
        try {
          const config = await fs.readJson(appsettingsProdPath);
          if (config.MongoDB?.ConnectionString) {
            // Ocultar password en el connection string
            let connStr = config.MongoDB.ConnectionString;
            connStr = connStr.replace(/:[^:@]+@/, ':****@');
            console.log(chalk.gray('      MongoDB:'), connStr);
          }
          if (config.MongoDB?.TlsCertificateFile) {
            console.log(chalk.gray('      TLS Cert:'), config.MongoDB.TlsCertificateFile);
          }
        } catch {}
      }

      // Verificar certificado de producción
      console.log('');
      console.log(chalk.cyan('  🔐 Certificado TLS (Producción):'));
      const certPath = path.resolve('./Certs/prod/client.pem');
      const certExists = await this.systemUtils.exists(certPath);
      console.log(chalk.gray('    Certificado:'), certExists ? chalk.green('✓') : chalk.yellow('✗ No encontrado'));
      if (certExists) {
        console.log(chalk.gray('    Ubicación:'), certPath);
        try {
          const stats = await fs.stat(certPath);
          console.log(chalk.gray('    Tamaño:'), `${stats.size} bytes`);
        } catch {}
      }

      // Verificar directorio de entrada
      console.log('');
      console.log(chalk.cyan('  📂 Datos de entrada:'));
      const inputDir = path.resolve('./Indexer/output');
      const inputDirExists = await this.systemUtils.exists(inputDir);
      console.log(chalk.gray('    Directorio output:'), inputDirExists ? chalk.green('✓') : chalk.red('✗'));

      if (inputDirExists) {
        try {
          const files = await fs.readdir(inputDir);
          const graphDirs = files.filter(f => f.endsWith('GraphFiles'));
          console.log(chalk.gray('    Directorios de grafo:'), graphDirs.length > 0 ? chalk.green(graphDirs.length) : chalk.yellow('0'));

          // Contar archivos de grafo
          let totalGraphFiles = 0;
          for (const dir of graphDirs) {
            const dirPath = path.join(inputDir, dir);
            try {
              const graphFiles = await fs.readdir(dirPath);
              totalGraphFiles += graphFiles.filter(f => f.endsWith('-graph.json')).length;
            } catch {}
          }
          if (totalGraphFiles > 0) {
            console.log(chalk.gray('    Archivos de grafo:'), chalk.green(totalGraphFiles));
          }
        } catch (error) {
          // Ignorar errores al leer directorio
        }
      }
    }

    return true;
  }
}

