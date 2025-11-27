import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import { displayProgressStart, displayProgressEnd, displayError, displaySuccess, displayInfo, displayWarning } from '../utils/display.js';

export class IndexerDbHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.projectRoot = null; // Se inicializará en init()
    this.indexerDbDir = null;
    this.projectFile = null;
    this.executable = null;
  }

  /**
   * Inicializa las rutas del handler basándose en la raíz del proyecto
   */
  async init() {
    if (this.projectRoot) {
      return; // Ya inicializado
    }

    this.projectRoot = await this.systemUtils.getProjectRoot();
    this.indexerDbDir = path.join(this.projectRoot, 'IndexerDb');
    this.projectFile = path.join(this.indexerDbDir, 'IndexerDb.csproj');
    this.executable = path.join(this.indexerDbDir, 'bin', 'Debug', 'net8.0', 'IndexerDb.dll');
  }

  async build() {
    await this.init();

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
    await this.init();

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
    await this.init();

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
      const certPath = path.join(this.projectRoot, 'Certs', 'prod', 'client.pem');
      if (await this.systemUtils.exists(certPath)) {
        displayInfo(`✓ Certificado TLS disponible: ${certPath}`);
      } else {
        displayInfo('ℹ️  Conectando sin certificado de cliente (TLS sin validación)');
      }
    }

    // Mostrar versión si está configurada
    if (options.version) {
      displayInfo(`🏷️  Versión del grafo: ${chalk.cyan(options.version)}`);
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
      const dotnetArgs = [];

      // --all: procesar todos los archivos
      if (options.noInteractive) {
        dotnetArgs.push('--all');
      }

      // --version: requerido
      if (options.version) {
        dotnetArgs.push('--version', options.version);
      }

      // --clean: limpiar nodos existentes
      if (options.cleanNodes) {
        dotnetArgs.push('--clean');
        displayWarning('⚠️  Se limpiarán los nodos existentes de esta versión');
      }

      if (dotnetArgs.length > 0) {
        args.push('--', ...dotnetArgs);
      }

      displayInfo(`IndexerDb v2.1 - ${environment}`);
      if (options.production) {
        displayWarning('⚠️  MongoDB PRODUCCIÓN');
      }

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
    await this.init();

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
          { name: '🚀 Procesar + exportar nodes (v2.1)', value: 'process-export' },
          { name: '🔍 Modo query interactivo', value: 'query' },
          { name: '❓ Mostrar ayuda', value: 'help' }
        ]
      }
    ]);

    const isProduction = answers.environment === 'production';

    // Si es producción, verificar certificado antes de continuar
    if (isProduction) {
      const certPath = path.join(this.projectRoot, 'Certs', 'prod', 'client.pem');
      if (!(await this.systemUtils.exists(certPath))) {
        displayError(`Certificado TLS no encontrado: ${certPath}`);
        displayInfo('Para producción, el certificado debe estar en Grafo/Certs/prod/client.pem');
        return false;
      }
    }

    switch (answers.mode) {
      case 'process-export': {
        displayInfo('Iniciando flujo interactivo de C#...');
        displayInfo('  1. Seleccionar carpeta de grafo');
        displayInfo('  2. Definir versión');
        displayInfo('  3. Procesar archivos');

        // Delegar todo el flujo interactivo al código C#
        // No pasar --all para que C# muestre selección de archivos si es necesario
        return await this.run({
          noInteractive: false,  // Modo interactivo completo en C#
          production: isProduction
          // Sin version ni cleanNodes - C# lo preguntará
        });
      }

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
    console.log(chalk.cyan('📚 IndexerDb - Ayuda (v2.1)'));
    console.log('');
    console.log(chalk.yellow('Flujo principal:'));
    console.log('');
    console.log('  1. Modo interactivo (recomendado):');
    console.log(chalk.gray('     grafo indexerdb run'));
    console.log(chalk.gray('     - Solicita versión del grafo'));
    console.log(chalk.gray('     - Procesa archivos .ndjson'));
    console.log(chalk.gray('     - Exporta directamente a colección "nodes" (v2.1)'));
    console.log('');
    console.log('  2. Línea de comandos:');
    console.log(chalk.gray('     grafo indexerdb run --all --nodes-only --version 6.7.5'));
    console.log(chalk.gray('     - Procesa todos los archivos .ndjson'));
    console.log(chalk.gray('     - Exporta directamente a colección "nodes"'));
    console.log('');
    console.log(chalk.yellow('Opciones:'));
    console.log('');
    console.log('  --all               - Procesar todos los archivos');
    console.log('  --nodes-only        - [v2.1] Exportar directamente a nodes (recomendado)');
    console.log('  --clean-nodes       - Limpiar nodos existentes antes de exportar');
    console.log('  --version <ver>     - Versión del grafo (requerido)');
    console.log('  --production        - Ejecutar en modo producción');
    console.log('');
    console.log(chalk.yellow('Ejemplos:'));
    console.log('');
    console.log(chalk.gray('  # Desarrollo con versión 6.7.5'));
    console.log(chalk.cyan('  grafo indexerdb run --all --nodes-only --clean-nodes --version 6.7.5'));
    console.log('');
    console.log(chalk.gray('  # Producción con versión 7.8.0'));
    console.log(chalk.cyan('  grafo indexerdb run --all --nodes-only --version 7.8.0 --production'));
    console.log('');
    console.log(chalk.yellow('Colección MongoDB:'));
    console.log('');
    console.log(chalk.gray('  nodes      - Nodos individuales con IDs semánticos (v2.1)'));
    console.log(chalk.gray('               Formato: grafo:{kind}/{identifier}@v{version}'));
    console.log(chalk.gray('               Ejemplo: grafo:class/Infocorp.Banking.Customer@v6.7.5'));
    console.log('');
    console.log(chalk.yellow('Otros comandos:'));
    console.log('');
    console.log('  build   - Compila el proyecto');
    console.log('  clean   - Limpia artefactos de compilación');
    console.log('  status  - Muestra el estado del servicio');
    console.log('');
  }

  async status() {
    await this.init();

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
      const certPath = path.join(this.projectRoot, 'Certs', 'prod', 'client.pem');
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
      const inputDir = path.join(this.projectRoot, 'Indexer', 'output');
      const inputDirExists = await this.systemUtils.exists(inputDir);
      console.log(chalk.gray('    Directorio output:'), inputDirExists ? chalk.green('✓') : chalk.red('✗'));

      if (inputDirExists) {
        try {
          const files = await fs.readdir(inputDir);
          const graphDirs = files.filter(f => f.endsWith('GraphFiles'));
          console.log(chalk.gray('    Directorios de grafo:'), graphDirs.length > 0 ? chalk.green(graphDirs.length) : chalk.yellow('0'));

          // Contar archivos de grafo (.ndjson)
          let totalGraphFiles = 0;
          for (const dir of graphDirs) {
            const dirPath = path.join(inputDir, dir);
            try {
              const graphFiles = await fs.readdir(dirPath);
              totalGraphFiles += graphFiles.filter(f => f.endsWith('-graph.ndjson')).length;
            } catch {}
          }
          if (totalGraphFiles > 0) {
            console.log(chalk.gray('    Archivos .ndjson:'), chalk.green(totalGraphFiles));
          }
        } catch (error) {
          // Ignorar errores al leer directorio
        }
      }
    }

    return true;
  }
}

