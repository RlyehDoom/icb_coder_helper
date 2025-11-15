import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import net from 'net';

const execAsync = promisify(exec);

export default class SystemUtils {
  constructor() {
    this.platform = process.platform;
    this.isWindows = this.platform === 'win32';
    this.isMac = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
    this.bashPath = null; // Cache para la ruta de bash
  }

  /**
   * Convierte una ruta con espacios a formato corto 8.3 en Windows
   */
  async getShortPath(longPath) {
    if (!this.isWindows) {
      return longPath;
    }

    try {
      // Usar 'for' de Windows para obtener la ruta corta
      const result = await this.executeShell(`for %I in ("${longPath}") do @echo %~sI`, { silent: true });
      if (result.success && result.stdout) {
        return result.stdout.trim();
      }
    } catch {
      // Si falla, devolver la ruta original
    }
    
    return longPath;
  }

  /**
   * Encuentra la ruta de bash en Windows
   */
  async findBashPath() {
    if (!this.isWindows) {
      return 'bash'; // En Unix, bash está en PATH
    }

    // Si ya lo encontramos antes, usar cache
    if (this.bashPath) {
      return this.bashPath;
    }

    // Ubicaciones comunes de Git Bash en Windows (buscar PRIMERO Git Bash, no WSL)
    const possiblePaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Git\\bin\\bash.exe',
      process.env.PROGRAMFILES ? process.env.PROGRAMFILES + '\\Git\\bin\\bash.exe' : null,
      process.env['PROGRAMFILES(X86)'] ? process.env['PROGRAMFILES(X86)'] + '\\Git\\bin\\bash.exe' : null
    ].filter(Boolean);

    // Buscar primero en ubicaciones comunes de Git Bash (antes de usar 'where')
    for (const bashPath of possiblePaths) {
      if (await this.exists(bashPath)) {
        this.bashPath = bashPath;
        return bashPath;
      }
    }

    // Intentar encontrar Git Bash usando git --exec-path
    try {
      const result = await this.executeShell('git --exec-path', { silent: true });
      if (result.success && result.stdout) {
        const gitExecPath = result.stdout.trim();
        // Git Bash está típicamente en la misma carpeta o en bin/
        const gitBashPath = path.join(gitExecPath, '..', 'bash.exe').replace(/\//g, '\\');
        if (await this.exists(gitBashPath)) {
          this.bashPath = gitBashPath;
          return gitBashPath;
        }
      }
    } catch {
      // Continuar
    }

    // Intentar encontrar bash usando 'where' de Windows
    // Pero filtrar WSL bash (C:\Windows\System32\bash.exe)
    try {
      const result = await this.executeShell('where bash', { silent: true });
      if (result.success && result.stdout) {
        const paths = result.stdout.split('\n').map(p => p.trim()).filter(Boolean);
        
        // Buscar Git Bash, evitar WSL bash
        for (const bashPath of paths) {
          // Ignorar WSL bash (C:\Windows\System32\bash.exe)
          if (bashPath.toLowerCase().includes('system32')) {
            continue;
          }
          
          if (await this.exists(bashPath)) {
            this.bashPath = bashPath;
            return bashPath;
          }
        }
      }
    } catch {
      // Continuar sin 'where'
    }

    // Si no se encuentra Git Bash, lanzar error claro
    throw new Error('Git Bash no encontrado. Por favor, instala Git for Windows desde https://git-scm.com/download/win');
  }

  /**
   * Ejecuta un comando de manera asíncrona
   */
  async execute(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      // Para rutas completas de bash (con espacios), no usar shell
      // Para comandos simples, usar shell en Windows
      // EXCEPTO para docker y docker-compose que deben ejecutarse sin shell
      const isFullPath = command.includes('\\') || command.includes('/');
      const isDockerCommand = command === 'docker' || command === 'docker-compose';
      const useShell = this.isWindows && !isFullPath && !isDockerCommand;

      const child = spawn(command, args, {
        stdio: options.silent ? 'pipe' : 'inherit',
        shell: useShell,
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        windowsVerbatimArguments: isFullPath && this.isWindows
      });

      let stdout = '';
      let stderr = '';

      if (options.silent) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            code,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        } else {
          reject({
            success: false,
            code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            error: `Command failed with exit code ${code}`
          });
        }
      });

      child.on('error', (error) => {
        reject({
          success: false,
          error: error.message,
          stdout,
          stderr
        });
      });
    });
  }

  /**
   * Ejecuta un comando shell simple
   */
  async executeShell(command, options = {}) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env }
      });
      
      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  }

  /**
   * Convierte una ruta de Windows a formato Git Bash
   * C:\Users\... -> /c/Users/...
   */
  windowsPathToBash(windowsPath) {
    if (!this.isWindows) {
      return windowsPath;
    }
    
    // Convertir ruta absoluta de Windows a formato Git Bash
    let bashPath = windowsPath.replace(/\\/g, '/');
    
    // Convertir C: a /c
    bashPath = bashPath.replace(/^([A-Za-z]):/, (match, drive) => {
      return '/' + drive.toLowerCase();
    });
    
    return bashPath;
  }

  /**
   * Verifica si un comando está disponible en el sistema
   */
  async isCommandAvailable(command) {
    const checkCommand = this.isWindows ? `where ${command}` : `which ${command}`;
    try {
      const result = await this.executeShell(checkCommand, { silent: true });
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Verifica si un archivo o directorio existe
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Crea un directorio si no existe
   */
  async ensureDir(dirPath) {
    try {
      await fs.ensureDir(dirPath);
      return true;
    } catch (error) {
      console.error(chalk.red(`Error creating directory ${dirPath}: ${error.message}`));
      return false;
    }
  }

  /**
   * Elimina un archivo o directorio
   */
  async remove(filePath) {
    try {
      await fs.remove(filePath);
      return true;
    } catch (error) {
      console.error(chalk.red(`Error removing ${filePath}: ${error.message}`));
      return false;
    }
  }

  /**
   * Copia archivos o directorios
   */
  async copy(src, dest) {
    try {
      await fs.copy(src, dest);
      return true;
    } catch (error) {
      console.error(chalk.red(`Error copying ${src} to ${dest}: ${error.message}`));
      return false;
    }
  }

  /**
   * Lee un archivo JSON
   */
  async readJson(filePath) {
    try {
      return await fs.readJson(filePath);
    } catch (error) {
      console.error(chalk.red(`Error reading JSON file ${filePath}: ${error.message}`));
      return null;
    }
  }

  /**
   * Escribe un archivo JSON
   */
  async writeJson(filePath, data) {
    try {
      await fs.writeJson(filePath, data, { spaces: 2 });
      return true;
    } catch (error) {
      console.error(chalk.red(`Error writing JSON file ${filePath}: ${error.message}`));
      return false;
    }
  }

  /**
   * Obtiene información del directorio
   */
  async getDirectoryInfo(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      const files = await fs.readdir(dirPath);
      
      return {
        exists: true,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
        fileCount: files.length,
        files: files
      };
    } catch {
      return {
        exists: false,
        isDirectory: false,
        size: 0,
        modified: null,
        fileCount: 0,
        files: []
      };
    }
  }

  /**
   * Busca archivos que coincidan con un patrón
   */
  async findFiles(dirPath, pattern) {
    try {
      const files = await fs.readdir(dirPath, { recursive: true });
      const regex = new RegExp(pattern);
      return files.filter(file => regex.test(file));
    } catch (error) {
      console.error(chalk.red(`Error searching files in ${dirPath}: ${error.message}`));
      return [];
    }
  }

  /**
   * Obtiene el tamaño de un directorio de forma recursiva
   */
  async getDirectorySize(dirPath) {
    try {
      let size = 0;
      
      const calculateSize = async (currentPath) => {
        try {
          const items = await fs.readdir(currentPath, { withFileTypes: true });
          
          for (const item of items) {
            const itemPath = path.join(currentPath, item.name);
            
            if (item.isDirectory()) {
              // Recursivamente calcular tamaño de subdirectorios
              await calculateSize(itemPath);
            } else if (item.isFile()) {
              try {
                const stats = await fs.stat(itemPath);
                size += stats.size;
              } catch (error) {
                // Si falla al obtener stats de un archivo específico, continuar
                console.debug(`Error getting stats for ${itemPath}: ${error.message}`);
              }
            }
          }
          
          return 0; // La suma se acumula en la variable size
        } catch (error) {
          console.debug(`Error reading directory ${currentPath}: ${error.message}`);
          return 0;
        }
      };
      
      await calculateSize(dirPath);
      return size;
    } catch (error) {
      console.debug(`Error calculating directory size for ${dirPath}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Formatea bytes a un formato legible
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Obtiene información del sistema
   */
  getSystemInfo() {
    return {
      platform: this.platform,
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      nodeVersion: process.version,
      cwd: process.cwd(),
      arch: process.arch
    };
  }

  /**
   * Espera un tiempo determinado
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ejecuta múltiples comandos en paralelo
   */
  async executeParallel(commands) {
    const promises = commands.map(({ command, args, options }) => 
      this.execute(command, args, options).catch(error => ({ ...error, success: false }))
    );
    
    return await Promise.all(promises);
  }

  /**
   * Verifica si un puerto está disponible
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * Espera por un número de milisegundos
   */
  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
