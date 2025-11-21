import chalk from 'chalk';
import path from 'path';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import { displayProgressStart, displayProgressEnd, displayError, displaySuccess, displayInfo, displayWarning } from '../utils/display.js';

export class IndexerHandler {
  constructor(systemUtils) {
    this.systemUtils = systemUtils;
    this.projectRoot = null; // Se inicializará en init()
    this.indexerDir = null;
    this.projectFile = null;
    this.executable = null;
    this.debugExecutable = null;
  }

  /**
   * Inicializa las rutas del handler basándose en la raíz del proyecto
   */
  async init() {
    if (this.projectRoot) {
      return; // Ya inicializado
    }

    this.projectRoot = await this.systemUtils.getProjectRoot();
    this.indexerDir = path.join(this.projectRoot, 'Indexer');
    this.projectFile = path.join(this.indexerDir, 'RoslynIndexer.csproj');
    this.executable = path.join(this.indexerDir, 'bin', 'Release', 'net8.0', 'RoslynIndexer.dll');
    this.debugExecutable = path.join(this.indexerDir, 'bin', 'Debug', 'net8.0', 'RoslynIndexer.dll');

    // Cargar variables de entorno desde .env en el directorio Indexer
    await this.loadEnvVars();
  }

  async loadEnvVars() {
    try {
      // Cargar .env desde el directorio Indexer
      const envPath = path.join(this.indexerDir, '.env');
      
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envLines = envContent.split('\n');
        
        for (const line of envLines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=').replace(/^["']|["']$/g, '');
              process.env[key.trim()] = value;
            }
          }
        }
        displayInfo(`📄 Variables de entorno cargadas desde: .env`);
      }
    } catch (error) {
      displayWarning(`⚠️ Error al cargar .env: ${error.message}`);
    }
  }

  async build() {
    await this.init();

    displayProgressStart('Compilando RoslynIndexer');

    // Verificar que .NET esté disponible
    if (!(await this.systemUtils.isCommandAvailable('dotnet'))) {
      displayError('.NET SDK no está instalado o no está en PATH');
      return false;
    }

    // Verificar que existe el directorio del indexer
    if (!(await this.systemUtils.exists(this.indexerDir))) {
      displayError(`Directorio Indexer no encontrado: ${this.indexerDir}`);
      return false;
    }

    try {
      const result = await this.systemUtils.execute('dotnet', ['build', '-c', 'Release'], {
        cwd: this.indexerDir
      });

      if (result.success) {
        displayProgressEnd('RoslynIndexer compilado exitosamente');
        
        // Verificar que el ejecutable fue creado
        if (await this.systemUtils.exists(this.executable)) {
          displaySuccess(`Ejecutable disponible en: ${this.executable}`);
        }
        
        return true;
      } else {
        displayProgressEnd('Error al compilar RoslynIndexer', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante la compilación: ${error.error || error.message}`);
      return false;
    }
  }

  async clean() {
    await this.init();

    displayProgressStart('Limpiando artefactos de compilación');

    try {
      await this.systemUtils.execute('dotnet', ['clean'], {
        cwd: this.indexerDir
      });

      // También limpiar directorios adicionales
      const dirsToClean = [
        path.join(this.indexerDir, 'test-results'),
        path.join(this.indexerDir, 'output'),
        path.join(this.indexerDir, 'logs'),
        path.join(this.indexerDir, 'temp')
      ];

      for (const dir of dirsToClean) {
        if (await this.systemUtils.exists(dir)) {
          await this.systemUtils.remove(dir);
          displayInfo(`Eliminado: ${path.basename(dir)}/`);
        }
      }

      displayProgressEnd('Limpieza completada');
      return true;
    } catch (error) {
      displayError(`Error durante la limpieza: ${error.error || error.message}`);
      return false;
    }
  }

  async test() {
    await this.init();

    displayProgressStart('Ejecutando tests unitarios');

    const testsDir = path.join(this.indexerDir, 'tests');
    
    if (!(await this.systemUtils.exists(testsDir))) {
      displayWarning('No se encontró directorio de tests, creando test básico...');
      return await this.createBasicTest();
    }

    try {
      const result = await this.systemUtils.execute('dotnet', ['test', testsDir], {
        cwd: this.indexerDir
      });

      if (result.success) {
        displayProgressEnd('Tests ejecutados exitosamente');
        return true;
      } else {
        displayProgressEnd('Algunos tests fallaron', false);
        return false;
      }
    } catch (error) {
      displayError(`Error ejecutando tests: ${error.error || error.message}`);
      return false;
    }
  }

  async createBasicTest() {
    displayInfo('Creando test básico de funcionamiento...');
    
    // Verificar que el ejecutable existe
    const exe = (await this.systemUtils.exists(this.executable)) ? this.executable : this.debugExecutable;
    
    if (!(await this.systemUtils.exists(exe))) {
      displayWarning('Ejecutable no encontrado, compilando primero...');
      if (!(await this.build())) {
        return false;
      }
    }

    // Buscar una solución de prueba
    const testSolutions = [
      path.resolve('../BackEnd/api/api.sln'),
      path.resolve('../BackEnd/Guru.sln'),
      path.resolve('./Repo/Cloned/*/**.sln')
    ];

    let testSolution = null;
    for (const solutionPattern of testSolutions) {
      if (await this.systemUtils.exists(solutionPattern)) {
        testSolution = solutionPattern;
        break;
      }
    }

    if (!testSolution) {
      displayWarning('No se encontró solución de prueba, test básico omitido');
      return true;
    }

    try {
      const outputDir = path.join(this.indexerDir, 'test-results');
      await this.systemUtils.ensureDir(outputDir);
      
      const result = await this.systemUtils.execute('dotnet', [
        exe,
        '-s', testSolution,
        '-o', path.join(outputDir, 'basic-test.json'),
        '--stats-csv', path.join(outputDir, 'basic-test-stats.csv')
      ], {
        cwd: this.indexerDir
      });

      if (result.success) {
        displayProgressEnd('Test básico completado exitosamente');
        return true;
      } else {
        displayProgressEnd('Test básico falló', false);
        return false;
      }
    } catch (error) {
      displayError(`Error en test básico: ${error.error || error.message}`);
      return false;
    }
  }

  // Discover repositories in Grafo/Repo/Cloned/
  async discoverRepositories() {
    await this.init();

    const repoBaseDir = path.join(this.projectRoot, 'Repo', 'Cloned');
    
    if (!(await this.systemUtils.exists(repoBaseDir))) {
      displayWarning(`Directorio de repositorios no encontrado: ${repoBaseDir}`);
      return [];
    }
    
    displayInfo(`Buscando repositorios en ${repoBaseDir}...`);
    
    try {
      const entries = await fs.readdir(repoBaseDir);
      const repositories = [];
      
      for (const entry of entries) {
        const repoPath = path.join(repoBaseDir, entry);
        const stat = await fs.stat(repoPath);
        
        if (stat && stat.isDirectory()) {
          displayInfo(`  Encontrado: ${entry}`);
          repositories.push(repoPath);
        }
      }
      
      return repositories;
    } catch (error) {
      displayError(`Error leyendo directorio de repositorios: ${error.message}`);
      return [];
    }
  }

  // Find solutions in a specific repository
  async findSolutionsInRepo(repoDir) {
    const repoName = path.basename(repoDir);
    
    if (!(await this.systemUtils.exists(repoDir))) {
      displayError(`Repositorio no encontrado: ${repoDir}`);
      return [];
    }
    
    displayInfo(`Buscando archivos .sln en ${repoName}...`);
    
    const solutions = [];
    
    try {
      // Look for .sln files in repository root
      const rootFiles = await fs.readdir(repoDir);
      for (const file of rootFiles) {
        if (file.endsWith('.sln')) {
          const fullPath = path.join(repoDir, file);
          displayInfo(`  Encontrado: ${file}`);
          solutions.push({
            path: fullPath,
            display: file
          });
        }
      }
      
      // Look for .sln files in first-level subdirectories
      for (const entry of rootFiles) {
        const entryPath = path.join(repoDir, entry);
        try {
          const stat = await fs.stat(entryPath);
          
          if (stat && stat.isDirectory()) {
            try {
              const subFiles = await fs.readdir(entryPath);
              for (const subFile of subFiles) {
                if (subFile.endsWith('.sln')) {
                  const fullPath = path.join(entryPath, subFile);
                  const display = `${entry}/${subFile}`;
                  displayInfo(`  Encontrado: ${display}`);
                  solutions.push({
                    path: fullPath,
                    display: display
                  });
                }
              }
            } catch (subError) {
              // Ignore subdirectory read errors
            }
          }
        } catch (statError) {
          // Ignore stat errors for individual entries
        }
      }
      
      return solutions;
    } catch (error) {
      displayError(`Error buscando soluciones en ${repoName}: ${error.message}`);
      return [];
    }
  }

  // Interactive repository selection
  async selectRepositoryInteractive(repositories) {
    if (repositories.length === 0) {
      displayError('No hay repositorios disponibles para seleccionar');
      return null;
    }
    
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

  // Interactive solution selection
  async selectSolutionInteractive(solutions) {
    if (solutions.length === 0) {
      displayError('No hay soluciones disponibles para seleccionar');
      return null;
    }
    
    if (solutions.length === 1) {
      displaySuccess(`Única solución encontrada: ${solutions[0].display}`);
      return solutions[0].path;
    }
    
    const choices = solutions.map(sol => ({
      name: sol.display,
      value: sol.path
    }));
    
    const { selectedSolution } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedSolution',
      message: 'Selecciona una solución:',
      choices: choices
    }]);
    
    return selectedSolution;
  }

  // Auto-discover and select solution
  async autoDiscoverSolution() {
    displayInfo('Auto-descubriendo repositorios y soluciones...');
    
    // Step 1: Discover repositories
    const repositories = await this.discoverRepositories();
    if (repositories.length === 0) {
      displayWarning('No se encontraron repositorios');
      return null;
    }
    
    // Step 2: Select repository
    const selectedRepo = await this.selectRepositoryInteractive(repositories);
    if (!selectedRepo) {
      return null;
    }
    
    // Step 3: Find solutions in selected repository
    const solutions = await this.findSolutionsInRepo(selectedRepo);
    if (solutions.length === 0) {
      displayWarning('No se encontraron soluciones en el repositorio seleccionado');
      return null;
    }
    
    // Step 4: Select solution
    return await this.selectSolutionInteractive(solutions);
  }

  // List available solutions from all repositories
  async listSolutions() {
    await this.init();

    displayInfo('Buscando soluciones disponibles...');

    const repositories = await this.discoverRepositories();
    if (repositories.length === 0) {
      displayWarning('No se encontraron repositorios');
      return false;
    }
    
    console.log('');
    console.log(chalk.cyan('📋 Soluciones disponibles en repositorios:'));
    console.log('');
    
    let totalSolutions = 0;
    let solutionIndex = 1;
    
    for (const repo of repositories) {
      const repoName = path.basename(repo);
      const solutions = await this.findSolutionsInRepo(repo);
      
      for (const solution of solutions) {
        const exists = await this.systemUtils.exists(solution.path);
        const status = exists ? '✓' : '✗';
        
        let size = 'N/A';
        if (exists) {
          try {
            const stats = await fs.stat(solution.path);
            size = this.formatBytes(stats.size);
          } catch (error) {
            // Ignore size calculation errors
          }
        }
        
        console.log(`  ${solutionIndex.toString().padStart(2)}) ${status} ${repoName}: ${solution.display.padEnd(50)} [${size}]`);
        solutionIndex++;
        totalSolutions++;
      }
    }
    
    console.log('');
    displayInfo(`Total: ${totalSolutions} soluciones encontradas`);
    console.log('');
    console.log('Para analizar una solución específica:');
    console.log('  grafo indexer analyze                    # Selección interactiva');
    console.log('  grafo indexer analyze -s <path>         # Análisis directo');
    
    return true;
  }

  // Format bytes to human readable format
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }

  async analyze(options) {
    await this.init();

    let solutionPath;

    // Check if solution is provided or needs auto-discovery
    if (options.solution) {
      solutionPath = path.resolve(options.solution);
      
      if (!(await this.systemUtils.exists(solutionPath))) {
        displayError(`Archivo de solución no encontrado: ${solutionPath}`);
        return false;
      }
      
      displayInfo(`Usando solución especificada: ${solutionPath}`);
    } else {
      // Auto-discover solution
      displayInfo('No se especificó solución, buscando automáticamente...');
      
      solutionPath = await this.autoDiscoverSolution();
      if (!solutionPath) {
        displayError('No se pudo encontrar una solución para analizar');
        console.log('');
        console.log('Opciones disponibles:');
        console.log('1. Especificar solución: grafo indexer analyze -s path/to/solution.sln');
        console.log('2. Clonar repositorios en ./Repo/Cloned/ usando: grafo repo clone');
        return false;
      }
    }

    displayProgressStart(`Analizando solución: ${path.basename(solutionPath)}`);

    // Verificar que el ejecutable existe
    const exe = (await this.systemUtils.exists(this.executable)) ? this.executable : this.debugExecutable;
    
    if (!(await this.systemUtils.exists(exe))) {
      displayInfo('Ejecutable no encontrado, compilando...');
      if (!(await this.build())) {
        return false;
      }
    }

    try {
      // Detectar nombre del repositorio desde la ruta de la solución
      let outputDir;
      const solutionName = path.basename(solutionPath, '.sln');
      
      // Obtener directorio base de salida desde variables de entorno o usar default
      const baseOutputDir = process.env.DEFAULT_OUTPUT_DIR || './analysis-output';
      const resolvedBaseDir = path.isAbsolute(baseOutputDir) ? baseOutputDir : path.join(this.indexerDir, baseOutputDir);
      
      if (solutionPath.includes('/Repo/') || solutionPath.includes('\\Repo\\')) {
        // Extraer el nombre del repositorio de la ruta
        // La estructura es: .../Repo/Cloned/RepoName/...
        const pathParts = solutionPath.split(path.sep);
        const clonedIndex = pathParts.findIndex(part => part === 'Cloned');
        
        if (clonedIndex !== -1 && clonedIndex + 1 < pathParts.length) {
          const repoName = pathParts[clonedIndex + 1];
          // Usar directorio dinámico si está habilitado en .env
          const useRepoName = process.env.USE_REPO_NAME_IN_OUTPUT !== 'false';
          
          if (useRepoName) {
            // Usar el directorio base configurado + nombre del repo
            outputDir = path.join(resolvedBaseDir, `${repoName}_GraphFiles`);
            displayInfo(`Usando directorio de salida específico del repositorio: ${outputDir}`);
          } else {
            outputDir = resolvedBaseDir;
          }
        } else {
          outputDir = path.resolve(options.output || resolvedBaseDir);
        }
      } else {
        outputDir = path.resolve(options.output || resolvedBaseDir);
      }
      
      await this.systemUtils.ensureDir(outputDir);

      // Construir argumentos
      const args = [
        exe,
        '-s', solutionPath,
        '-o', path.join(outputDir, `${solutionName}-symbols.${options.format || 'json'}`)
      ];

      // Opciones adicionales
      if (!options.noGraph) {
        args.push('-g', path.join(outputDir, `${solutionName}-graph.${options.format}`));
      }

      if (!options.noStats) {
        args.push('--stats-csv', path.join(outputDir, `${solutionName}-stats.csv`));
      }

      if (options.verbose) {
        args.push('-v');
      }

      if (options.filterTypes) {
        args.push('--filter-types', options.filterTypes);
      }

      if (options.excludeProjects) {
        args.push('--exclude-projects', options.excludeProjects);
      }

      // Cargar filtros desde variables de entorno (.env)
      if (!options.excludeProjects && process.env.EXCLUDE_PROJECTS_REGEX) {
        args.push('--exclude-projects', process.env.EXCLUDE_PROJECTS_REGEX);
        displayInfo(`🚫 Excluyendo proyectos que coincidan con: ${process.env.EXCLUDE_PROJECTS_REGEX}`);
      }

      if (!options.filterTypes && process.env.FILTER_SYMBOL_TYPES) {
        args.push('--filter-types', process.env.FILTER_SYMBOL_TYPES);
        displayInfo(`🔍 Filtrando tipos de símbolos: ${process.env.FILTER_SYMBOL_TYPES}`);
      }

      if (process.env.INCLUDE_PROJECTS_REGEX) {
        args.push('--include-projects', process.env.INCLUDE_PROJECTS_REGEX);
        displayInfo(`✅ Incluyendo solo proyectos que coincidan con: ${process.env.INCLUDE_PROJECTS_REGEX}`);
      }

      if (!options.verbose && process.env.VERBOSE_MODE === 'true') {
        args.push('-v');
        displayInfo(`🔊 Modo verbose habilitado desde .env`);
      }

      args.push('--output-format', options.format);

      const result = await this.systemUtils.execute('dotnet', args, {
        cwd: this.indexerDir
      });

      if (result.success) {
        displayProgressEnd('Análisis completado exitosamente');
        displaySuccess(`Resultados guardados en: ${outputDir}`);
        
        // Mostrar archivos generados
        const outputInfo = await this.systemUtils.getDirectoryInfo(outputDir);
        if (outputInfo.exists && outputInfo.fileCount > 0) {
          displayInfo('Archivos generados:');
          outputInfo.files.forEach(file => {
            console.log(`  📄 ${file}`);
          });
        }
        
        return true;
      } else {
        displayProgressEnd('Error durante el análisis', false);
        return false;
      }
    } catch (error) {
      displayError(`Error durante el análisis: ${error.error || error.message}`);
      return false;
    }
  }

  async run(options = {}) {
    displayInfo('Modo interactivo del RoslynIndexer...');
    
    // Implementar modo interactivo básico
    if (!options.solution) {
      displayWarning('Usar: grafo indexer analyze -s <solucion.sln> para análisis específico');
      return false;
    }

    return await this.analyze(options);
  }

  async status() {
    await this.init();

    console.log(chalk.cyan('📊 Estado del RoslynIndexer:'));

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
    const indexerExists = await this.systemUtils.exists(this.indexerDir);
    console.log(chalk.gray('  Directorio Indexer:'), indexerExists ? chalk.green('✓') : chalk.red('✗'));

    if (indexerExists) {
      // Verificar proyecto
      const projectExists = await this.systemUtils.exists(this.projectFile);
      console.log(chalk.gray('  Archivo proyecto:'), projectExists ? chalk.green('✓') : chalk.red('✗'));

      // Verificar ejecutables
      const releaseExe = await this.systemUtils.exists(this.executable);
      const debugExe = await this.systemUtils.exists(this.debugExecutable);
      
      console.log(chalk.gray('  Ejecutable Release:'), releaseExe ? chalk.green('✓') : chalk.red('✗'));
      console.log(chalk.gray('  Ejecutable Debug:'), debugExe ? chalk.green('✓') : chalk.red('✗'));

      // Información de directorios
      const testResultsDir = path.join(this.indexerDir, 'test-results');
      const testResultsInfo = await this.systemUtils.getDirectoryInfo(testResultsDir);
      
      if (testResultsInfo.exists) {
        console.log(chalk.gray('  Resultados de prueba:'), `${testResultsInfo.fileCount} archivos`);
        
        if (testResultsInfo.fileCount > 0) {
          const dirSize = await this.systemUtils.getDirectorySize(testResultsDir);
          console.log(chalk.gray('  Tamaño resultados:'), this.systemUtils.formatBytes(dirSize));
        }
      }
    }

    return true;
  }
}
