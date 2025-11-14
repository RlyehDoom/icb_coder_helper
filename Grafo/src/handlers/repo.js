import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
import { displayProgressStart, displayProgressEnd, displayError, displaySuccess, displayInfo, displayWarning, displayTable } from '../utils/display.js';

export class RepoHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.repoBaseDir = path.resolve('./Repo/Cloned');
    this.cloneScript = path.resolve('./Repo/clone-repo.sh');
  }

  async clone(options) {
    const { url, name, folder, sparse, branch, token } = options;
    
    displayProgressStart(`Clonando repositorio: ${url}`);

    // Verificar que Git esté disponible
    if (!(await this.systemUtils.isCommandAvailable('git'))) {
      displayError('Git no está instalado o no está en PATH');
      return false;
    }

    // Verificar que Bash esté disponible
    if (!(await this.systemUtils.isCommandAvailable('bash'))) {
      displayError('Bash no está instalado o no está en PATH');
      displayInfo('En Windows, asegúrate de tener Git for Windows instalado');
      return false;
    }

    // Verificar que el script de clonado existe
    if (!(await this.systemUtils.exists(this.cloneScript))) {
      displayError(`Script de clonado no encontrado: ${this.cloneScript}`);
      return false;
    }

    try {
      // Preparar argumentos para el script
      const args = ['-u', url];
      
      if (name) args.push('-n', name);
      if (folder) args.push('-f', folder);
      if (sparse) args.push('-s', sparse);
      if (branch) args.push('-b', branch);
      if (token) args.push('-t', token);

      // Asegurar que existe el directorio base
      await this.systemUtils.ensureDir(this.repoBaseDir);

      // Encontrar bash (especialmente importante en Windows)
      let bashCommand;
      try {
        bashCommand = await this.systemUtils.findBashPath();
        
        // En Windows, convertir a ruta corta si tiene espacios para evitar problemas con spawn
        if (this.systemUtils.isWindows && bashCommand.includes(' ')) {
          const shortPath = await this.systemUtils.getShortPath(bashCommand);
          if (shortPath && shortPath !== bashCommand) {
            console.log(`🔧 Usando ruta corta para bash: ${shortPath}`);
            bashCommand = shortPath;
          }
        }
      } catch (error) {
        displayError(error.message);
        displayInfo('Instala Git for Windows desde: https://git-scm.com/download/win');
        displayInfo('O agrega Git Bash al PATH de tu sistema');
        return false;
      }

      // Bash puede manejar rutas de Windows directamente, no necesitamos convertir
      // Solo aseguramos que el cwd sea el directorio correcto
      const workingDir = path.dirname(this.cloneScript);

      // Debug: mostrar comando exacto
      if (this.systemUtils.isWindows) {
        console.log(`\n🔍 Debug (Windows):`);
        console.log(`  Bash ejecutable: ${bashCommand}`);
        console.log(`  Script: ${this.cloneScript}`);
        console.log(`  Working dir: ${workingDir}`);
        console.log(`  Comando completo: "${bashCommand}" "${this.cloneScript}" ${args.join(' ')}\n`);
      }

      const result = await this.systemUtils.execute(bashCommand, [this.cloneScript, ...args], {
        cwd: workingDir
      });

      if (result.success) {
        displayProgressEnd('Repositorio clonado exitosamente');
        
        // Mostrar información del repositorio clonado
        const repoName = folder || name || this.extractRepoName(url);
        const repoPath = path.join(this.repoBaseDir, repoName);
        
        if (await this.systemUtils.exists(repoPath)) {
          const repoInfo = await this.getRepositoryInfo(repoPath);
          displaySuccess(`Repositorio disponible en: ${repoPath}`);
          displayInfo(`Archivos: ${repoInfo.fileCount}, Tamaño: ${this.systemUtils.formatBytes(repoInfo.size)}`);
          
          // Buscar archivos .sln
          const solutionFiles = await this.findSolutionFiles(repoPath);
          if (solutionFiles.length > 0) {
            displayInfo('Archivos de solución encontrados:');
            solutionFiles.forEach(sln => {
              console.log(`  🔧 ${path.relative(repoPath, sln)}`);
            });
          }
        }
        
        return true;
      } else {
        displayProgressEnd('Error al clonar repositorio', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante el clonado: ${error.error || error.message}`);
      return false;
    }
  }

  async list() {
    displayInfo('📦 Repositorios disponibles:');
    
    if (!(await this.systemUtils.exists(this.repoBaseDir))) {
      displayWarning('Directorio Repo/Cloned no existe. Use "grafo repo clone" para clonar repositorios.');
      return true;
    }

    try {
      const repoInfo = await this.systemUtils.getDirectoryInfo(this.repoBaseDir);
      
      if (!repoInfo.exists || repoInfo.fileCount === 0) {
        displayWarning('No hay repositorios clonados.');
        return true;
      }

      const repositories = [];
      
      for (const item of repoInfo.files) {
        const itemPath = path.join(this.repoBaseDir, item);
        const itemInfo = await this.systemUtils.getDirectoryInfo(itemPath);
        
        if (itemInfo.isDirectory) {
          const repoDetails = await this.getRepositoryInfo(itemPath);
          const solutions = await this.findSolutionFiles(itemPath);
          
          repositories.push([
            item,
            this.systemUtils.formatBytes(repoDetails.size),
            repoDetails.fileCount.toString(),
            solutions.length.toString(),
            repoDetails.lastCommit || 'N/A',
            repoDetails.branch || 'N/A'
          ]);
        }
      }

      if (repositories.length > 0) {
        displayTable(
          ['Repositorio', 'Tamaño', 'Archivos', 'Soluciones', 'Último Commit', 'Rama'],
          repositories
        );
      } else {
        displayWarning('No se encontraron repositorios válidos.');
      }
      
      return true;
    } catch (error) {
      displayError(`Error listando repositorios: ${error.message}`);
      return false;
    }
  }

  async clean() {
    displayProgressStart('Limpiando repositorios obsoletos y archivos temporales');
    
    if (!(await this.systemUtils.exists(this.repoBaseDir))) {
      displayInfo('No hay directorio Repo/Cloned para limpiar.');
      return true;
    }

    try {
      let cleanedItems = 0;
      const repoInfo = await this.systemUtils.getDirectoryInfo(this.repoBaseDir);
      
      for (const item of repoInfo.files) {
        const itemPath = path.join(this.repoBaseDir, item);
        const itemInfo = await this.systemUtils.getDirectoryInfo(itemPath);
        
        if (itemInfo.isDirectory) {
          // Limpiar directorios temporales comunes
          const tempDirs = ['bin', 'obj', 'node_modules', '.vs', 'packages', 'TestResults'];
          
          for (const tempDir of tempDirs) {
            const tempPath = path.join(itemPath, tempDir);
            if (await this.systemUtils.exists(tempPath)) {
              await this.systemUtils.remove(tempPath);
              cleanedItems++;
            }
          }
          
          // Limpiar archivos temporales comunes
          const tempFiles = await this.systemUtils.findFiles(itemPath, '\\\\.(tmp|log|cache|suo)$');
          for (const file of tempFiles) {
            const filePath = path.join(itemPath, file);
            await this.systemUtils.remove(filePath);
            cleanedItems++;
          }
        }
      }

      displayProgressEnd(`Limpieza completada. ${cleanedItems} elementos eliminados`);
      return true;
    } catch (error) {
      displayError(`Error durante la limpieza: ${error.message}`);
      return false;
    }
  }

  async status() {
    console.log(chalk.cyan('📦 Estado de Repositorios:'));
    
    // Verificar Git
    const gitAvailable = await this.systemUtils.isCommandAvailable('git');
    console.log(chalk.gray('  Git:'), gitAvailable ? chalk.green('✓') : chalk.red('✗'));

    if (gitAvailable) {
      try {
        const result = await this.systemUtils.executeShell('git --version', { silent: true });
        if (result.success) {
          console.log(chalk.gray('  Versión:'), result.stdout);
        }
      } catch {}
    }

    // Verificar script de clonado
    const scriptExists = await this.systemUtils.exists(this.cloneScript);
    console.log(chalk.gray('  Script clone-repo.sh:'), scriptExists ? chalk.green('✓') : chalk.red('✗'));

    // Verificar directorio base
    const repoBaseDirExists = await this.systemUtils.exists(this.repoBaseDir);
    console.log(chalk.gray('  Directorio Repo/Cloned:'), repoBaseDirExists ? chalk.green('✓') : chalk.red('✗'));

    if (repoBaseDirExists) {
      const repoInfo = await this.systemUtils.getDirectoryInfo(this.repoBaseDir);
      
      // Contar solo directorios que sean repositorios Git válidos
      let validRepositories = 0;
      let totalSolutions = 0;
      let totalRepositorySize = 0;
      
      for (const item of repoInfo.files) {
        const itemPath = path.join(this.repoBaseDir, item);
        const itemInfo = await this.systemUtils.getDirectoryInfo(itemPath);
        
        // Solo procesar directorios
        if (itemInfo.isDirectory) {
          // Verificar si es un repositorio Git válido
          const gitDir = path.join(itemPath, '.git');
          if (await this.systemUtils.exists(gitDir)) {
            validRepositories++;
            
            // Calcular tamaño solo de repositorios válidos
            const repoSize = await this.systemUtils.getDirectorySize(itemPath);
            totalRepositorySize += repoSize;
            
            // Contar soluciones solo en repositorios válidos
            const solutions = await this.findSolutionFiles(itemPath);
            totalSolutions += solutions.length;
          }
        }
      }
      
      console.log(chalk.gray('  Repositorios clonados:'), validRepositories);
      
      if (validRepositories > 0) {
        console.log(chalk.gray('  Tamaño total:'), this.systemUtils.formatBytes(totalRepositorySize));
        console.log(chalk.gray('  Soluciones disponibles:'), totalSolutions);
      }
    }

    // Leer configuración desde archivo .env
    const envConfig = await this.readEnvConfig();
    
    console.log(chalk.gray('  Configuración (.env):'));
    console.log(chalk.gray('    Archivo .env:'), envConfig.exists ? chalk.green('✓ Encontrado') : chalk.yellow('No encontrado'));
    
    if (envConfig.exists) {
      console.log(chalk.gray('  Tokens de autenticación:'));
      console.log(chalk.gray('    Azure DevOps PAT:'), envConfig.AZURE_DEVOPS_PAT ? chalk.green('✓ Configurado') : chalk.yellow('No configurado'));
      console.log(chalk.gray('    GitHub Token:'), envConfig.GITHUB_TOKEN ? chalk.green('✓ Configurado') : chalk.yellow('No configurado'));
      
      console.log(chalk.gray('  Configuración por defecto:'));
      console.log(chalk.gray('    Branch por defecto:'), envConfig.GRAFO_DEFAULT_BRANCH ? chalk.cyan(envConfig.GRAFO_DEFAULT_BRANCH) : chalk.gray('main'));
      console.log(chalk.gray('    Carpetas Sparse:'), envConfig.GRAFO_DEFAULT_SPARSE ? chalk.cyan(envConfig.GRAFO_DEFAULT_SPARSE) : chalk.gray('(ninguna)'));
    } else {
      // Fallback a variables de entorno del sistema
      const azurePat = process.env.AZURE_DEVOPS_PAT;
      const githubToken = process.env.GITHUB_TOKEN;
      
      console.log(chalk.gray('  Tokens de entorno del sistema:'));
      console.log(chalk.gray('    Azure DevOps PAT:'), azurePat ? chalk.green('✓ Configurado') : chalk.yellow('No configurado'));
      console.log(chalk.gray('    GitHub Token:'), githubToken ? chalk.green('✓ Configurado') : chalk.yellow('No configurado'));
    }

    return true;
  }

  // Métodos auxiliares

  async readEnvConfig() {
    // El archivo .env está en Repo/, no en Repo/Cloned/
    const envPath = path.resolve('./Repo/.env');
    
    try {
      // Verificar si el archivo existe
      const exists = await this.systemUtils.exists(envPath);
      if (!exists) {
        return { exists: false };
      }

      // Leer el contenido del archivo
      const content = await fs.readFile(envPath, 'utf8');
      const config = { exists: true };
      
      // Parsear línea por línea
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Saltar comentarios y líneas vacías
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        
        // Parsear variable=valor
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();
          
          // Remover comillas si están presentes
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          
          // Solo almacenar valores no vacíos y que no sean placeholders de ejemplo
          if (value && !this.isExampleValue(value)) {
            config[key] = value;
          }
        }
      }
      
      return config;
    } catch (error) {
      console.debug(`Error reading .env file: ${error.message}`);
      return { exists: false };
    }
  }

  isExampleValue(value) {
    // Lista de valores de ejemplo comunes que no deben considerarse como configurados
    const exampleValues = [
      'your-github-token-here',
      'your-azure-token-here',
      'your-azure-devops-pat-here',
      'your-personal-access-token-here',
      'your-token-here',
      'example-token',
      'paste-your-token-here',
      'replace-with-your-token'
    ];
    
    const lowerValue = value.toLowerCase();
    return exampleValues.some(example => lowerValue.includes(example));
  }

  extractRepoName(url) {
    // Extraer nombre del repositorio de la URL
    const match = url.match(/\/_git\/([^\/]+)$/);
    return match ? match[1] : 'unknown-repo';
  }

  async getRepositoryInfo(repoPath) {
    const info = await this.systemUtils.getDirectoryInfo(repoPath);
    let lastCommit = null;
    let branch = null;
    
    try {
      // Obtener información de Git si es un repositorio
      const gitDir = path.join(repoPath, '.git');
      if (await this.systemUtils.exists(gitDir)) {
        const commitResult = await this.systemUtils.executeShell('git log -1 --format="%h %s"', {
          cwd: repoPath,
          silent: true
        });
        
        if (commitResult.success) {
          lastCommit = commitResult.stdout.replace(/"/g, '').substring(0, 50);
        }
        
        const branchResult = await this.systemUtils.executeShell('git branch --show-current', {
          cwd: repoPath,
          silent: true
        });
        
        if (branchResult.success) {
          branch = branchResult.stdout.trim();
        }
      }
    } catch {}

    return {
      ...info,
      size: await this.systemUtils.getDirectorySize(repoPath),
      lastCommit,
      branch
    };
  }

  async findSolutionFiles(repoPath, maxDepth = 1) {
    try {
      const solutionFiles = [];
      
      // Buscar en la raíz (nivel 0)
      const rootFiles = await fs.readdir(repoPath);
      for (const file of rootFiles) {
        if (file.endsWith('.sln')) {
          solutionFiles.push(path.join(repoPath, file));
        }
      }
      
      // Buscar un nivel dentro (nivel 1) si maxDepth >= 1
      if (maxDepth >= 1) {
        for (const item of rootFiles) {
          const itemPath = path.join(repoPath, item);
          try {
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              const subFiles = await fs.readdir(itemPath);
              for (const subFile of subFiles) {
                if (subFile.endsWith('.sln')) {
                  solutionFiles.push(path.join(itemPath, subFile));
                }
              }
            }
          } catch (err) {
            // Ignorar errores al acceder a subdirectorios individuales
          }
        }
      }
      
      return solutionFiles;
    } catch (error) {
      console.error(`Error buscando archivos .sln en ${repoPath}: ${error.message}`);
      return [];
    }
  }
}
