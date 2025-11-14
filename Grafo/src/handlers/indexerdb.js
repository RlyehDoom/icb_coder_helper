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
    displayProgressStart('Ejecutando IndexerDb');
    
    // Verificar que .NET esté disponible
    if (!(await this.systemUtils.isCommandAvailable('dotnet'))) {
      displayError('.NET SDK no está instalado o no está en PATH');
      return false;
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
      if (options.file) {
        args.push('--', '--file', options.file);
      } else if (options.noInteractive) {
        args.push('--', '--no-interactive');
      }

      displayInfo('Iniciando IndexerDb...');
      displayInfo('Presiona Ctrl+C para salir');
      
      const result = await this.systemUtils.execute('dotnet', args, {
        cwd: this.indexerDbDir,
        stdio: 'inherit' // Permite interacción con el usuario
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
    
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: '¿Cómo deseas ejecutar IndexerDb?',
        choices: [
          { name: '📋 Selección interactiva (por defecto)', value: 'interactive' },
          { name: '📁 Archivo específico', value: 'file' },
          { name: '🚀 Procesar todos los archivos', value: 'all' },
          { name: '❓ Mostrar ayuda', value: 'help' }
        ]
      }
    ]);

    switch (mode) {
      case 'interactive':
        return await this.run({});
      
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
        return await this.run({ file: filePath });
      }
      
      case 'all':
        displayInfo('Procesando todos los archivos automáticamente...');
        return await this.run({ noInteractive: true });
      
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
          console.log(chalk.gray('  Versión:'), result.stdout);
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

      // Verificar configuración
      const appsettingsPath = path.join(this.indexerDbDir, 'appsettings.json');
      const appsettingsExists = await this.systemUtils.exists(appsettingsPath);
      console.log(chalk.gray('  Configuración:'), appsettingsExists ? chalk.green('✓') : chalk.red('✗'));

      // Mostrar información de MongoDB desde configuración
      if (appsettingsExists) {
        try {
          const config = await fs.readJson(appsettingsPath);
          const mongoEnabled = config.Application?.EnableMongoDB;
          const mockMode = config.Application?.MockDataMode;
          
          console.log(chalk.gray('  MongoDB habilitado:'), mongoEnabled ? chalk.green('Sí') : chalk.yellow('No'));
          console.log(chalk.gray('  Modo Mock:'), mockMode ? chalk.yellow('Sí') : chalk.green('No'));
          
          if (mongoEnabled && config.MongoDB?.ConnectionString) {
            console.log(chalk.gray('  Connection String:'), config.MongoDB.ConnectionString);
          }
        } catch (error) {
          displayWarning('  No se pudo leer la configuración');
        }
      }

      // Verificar directorio de entrada
      const inputDir = path.resolve('./Indexer/output');
      const inputDirExists = await this.systemUtils.exists(inputDir);
      console.log(chalk.gray('  Directorio de entrada:'), inputDirExists ? chalk.green('✓') : chalk.red('✗'));

      if (inputDirExists) {
        try {
          const files = await fs.readdir(inputDir);
          const graphDirs = files.filter(f => f.endsWith('GraphFiles'));
          console.log(chalk.gray('  Directorios de grafo:'), graphDirs.length > 0 ? chalk.green(graphDirs.length) : chalk.yellow('0'));
        } catch (error) {
          // Ignorar errores al leer directorio
        }
      }
    }

    return true;
  }
}

