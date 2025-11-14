import chalk from 'chalk';
import path from 'path';
import { promises as fs } from 'fs';
import { displayProgressStart, displayProgressEnd, displayError, displaySuccess, displayInfo, displayWarning, displayStep, displayTable } from '../utils/display.js';

export class TestHandler {
  constructor(systemUtils, indexerHandler, repoHandler) {
    this.systemUtils = systemUtils;
    this.indexerHandler = indexerHandler;
    this.repoHandler = repoHandler;
    this.testResultsDir = path.resolve('./test-results');
    this.configsDir = path.resolve('./Indexer/configs');
  }

  async setup() {
    displayProgressStart('Configurando entorno de testing');
    
    try {
      // 1. Crear directorios necesarios
      displayStep('1/4', 'Creando directorios de testing');
      await this.systemUtils.ensureDir(this.testResultsDir);
      await this.systemUtils.ensureDir(path.join(this.testResultsDir, 'batch-output'));
      await this.systemUtils.ensureDir(path.join(this.testResultsDir, 'individual-tests'));
      
      // 2. Compilar indexer si no existe
      displayStep('2/4', 'Verificando RoslynIndexer');
      await this.indexerHandler.status(); // Mostrar estado
      const indexerReady = await this.isIndexerReady();
      if (!indexerReady) {
        displayInfo('Compilando RoslynIndexer...');
        await this.indexerHandler.build();
      }
      
      // 3. Verificar configuraciones de prueba
      displayStep('3/4', 'Verificando configuraciones de testing');
      await this.ensureTestConfigs();
      
      // 4. Crear script de pruebas rápidas
      displayStep('4/4', 'Creando scripts de prueba');
      await this.createQuickTestScript();
      
      displayProgressEnd('Entorno de testing configurado');
      return true;
    } catch (error) {
      displayError(`Error configurando entorno: ${error.message}`);
      return false;
    }
  }

  async run(options = {}) {
    const { repo, verbose, quick } = options;
    
    if (quick) {
      return await this.runQuickTest();
    }
    
    displayProgressStart('Ejecutando suite de tests');
    
    try {
      const results = [];
      
      // Si se especifica un repositorio, solo analizar ese
      if (repo) {
        const result = await this.analyzeRepository(repo, verbose);
        results.push({ repository: repo, success: result });
      } else {
        // Analizar todos los repositorios disponibles
        const repositories = await this.getAvailableRepositories();
        
        if (repositories.length === 0) {
          displayWarning('No hay repositorios disponibles para analizar');
          displayInfo('Use "grafo repo clone" para clonar repositorios primero');
          return true;
        }
        
        displayInfo(`Analizando ${repositories.length} repositorios...`);
        
        for (const repository of repositories) {
          displayStep(`${results.length + 1}/${repositories.length}`, `Analizando ${repository}`);
          const result = await this.analyzeRepository(repository, verbose);
          results.push({ repository, success: result });
        }
      }
      
      // Mostrar resumen de resultados
      this.displayTestResults(results);
      
      displayProgressEnd('Suite de tests completada');
      return true;
    } catch (error) {
      displayError(`Error ejecutando tests: ${error.message}`);
      return false;
    }
  }

  async batch(options = {}) {
    const { config, verbose } = options;
    
    displayProgressStart('Ejecutando procesamiento por lotes');
    
    try {
      // Buscar archivo de configuración
      let configFile = config;
      if (!configFile) {
        const defaultConfigs = [
          path.join(this.configsDir, 'batch-test-config.yaml'),
          path.join(this.configsDir, 'batch-sample.yaml'),
          path.join(this.configsDir, 'batch-sample.json')
        ];
        
        for (const defaultConfig of defaultConfigs) {
          if (await this.systemUtils.exists(defaultConfig)) {
            configFile = defaultConfig;
            break;
          }
        }
      }
      
      if (!configFile || !(await this.systemUtils.exists(configFile))) {
        displayError('Archivo de configuración batch no encontrado');
        displayInfo('Archivos disponibles:');
        displayInfo('  - Indexer/configs/batch-test-config.yaml');
        displayInfo('  - Indexer/configs/batch-sample.yaml');
        displayInfo('  - Indexer/configs/batch-sample.json');
        return false;
      }
      
      displayInfo(`Usando configuración: ${configFile}`);
      
      // Verificar que el indexer esté compilado
      const indexerDir = path.resolve('./Indexer');
      const executable = path.join(indexerDir, 'bin', 'Release', 'net8.0', 'RoslynIndexer.dll');
      const executableExists = await this.systemUtils.exists(executable);
      
      if (!executableExists) {
        displayInfo('Compilando RoslynIndexer...');
        await this.indexerHandler.build();
      }
      
      // Ejecutar procesamiento por lotes
      const args = ['--batch-config', configFile];
      if (verbose) args.push('-v');
      
      const result = await this.systemUtils.execute('dotnet', [executable, ...args], {
        cwd: indexerDir
      });
      
      if (result.success) {
        displayProgressEnd('Procesamiento por lotes completado');
        await this.displayBatchResults();
        return true;
      } else {
        displayProgressEnd('Error en procesamiento por lotes', false);
        return false;
      }
    } catch (error) {
      displayError(`Error en procesamiento por lotes: ${error.message}`);
      return false;
    }
  }

  async cleanup() {
    displayProgressStart('Limpiando archivos de testing');
    
    try {
      const itemsToClean = [
        this.testResultsDir,
        path.resolve('./Indexer/test-results'),
        path.resolve('./Indexer/output'),
        path.resolve('./Indexer/logs'),
        path.resolve('./Indexer/temp')
      ];
      
      let cleanedItems = 0;
      
      for (const item of itemsToClean) {
        if (await this.systemUtils.exists(item)) {
          await this.systemUtils.remove(item);
          cleanedItems++;
          displayInfo(`Eliminado: ${path.basename(item)}/`);
        }
      }
      
      displayProgressEnd(`Limpieza completada. ${cleanedItems} directorios eliminados`);
      return true;
    } catch (error) {
      displayError(`Error durante la limpieza: ${error.message}`);
      return false;
    }
  }

  async status() {
    console.log(chalk.cyan('🧪 Estado del Testing:'));
    
    // Verificar directorios de testing
    const testDirExists = await this.systemUtils.exists(this.testResultsDir);
    console.log(chalk.gray('  Directorio test-results:'), testDirExists ? chalk.green('✓') : chalk.red('✗'));
    
    if (testDirExists) {
      const testDirInfo = await this.systemUtils.getDirectoryInfo(this.testResultsDir);
      console.log(chalk.gray('  Archivos de prueba:'), testDirInfo.fileCount);
      
      if (testDirInfo.fileCount > 0) {
        const testDirSize = await this.systemUtils.getDirectorySize(this.testResultsDir);
        console.log(chalk.gray('  Tamaño resultados:'), this.systemUtils.formatBytes(testDirSize));
      }
    }
    
    // Verificar configuraciones
    const configsExist = await this.systemUtils.exists(this.configsDir);
    console.log(chalk.gray('  Configuraciones:'), configsExist ? chalk.green('✓') : chalk.red('✗'));
    
    if (configsExist) {
      const configFiles = await this.systemUtils.findFiles(this.configsDir, '\\.(yaml|json)$');
      console.log(chalk.gray('  Archivos config:'), configFiles.length);
    }
    
    // Estado de componentes dependientes
    console.log(chalk.gray('  RoslynIndexer:'), await this.isIndexerReady() ? chalk.green('✓ Listo') : chalk.yellow('Necesita compilación'));
    
    const repositories = await this.getAvailableRepositories();
    console.log(chalk.gray('  Repositorios disponibles:'), repositories.length);
    
    return true;
  }

  // Métodos auxiliares

  async runQuickTest() {
    displayInfo('🚀 Ejecutando prueba rápida...');
    
    try {
      // Buscar una solución de prueba simple
      const testSolutions = await this.findTestSolutions();
      
      if (testSolutions.length === 0) {
        displayWarning('No hay soluciones disponibles para prueba rápida');
        return true;
      }
      
      const testSolution = testSolutions[0];
      displayInfo(`Usando solución: ${testSolution}`);
      
      const quickTestDir = path.join(this.testResultsDir, 'quick-test');
      await this.systemUtils.ensureDir(quickTestDir);
      
      const result = await this.indexerHandler.analyze({
        solution: testSolution,
        output: quickTestDir,
        format: 'json',
        verbose: true,
        noGraph: false,
        noStats: false
      });
      
      if (result) {
        displaySuccess('Prueba rápida completada exitosamente');
        
        // Mostrar archivos generados
        const quickTestInfo = await this.systemUtils.getDirectoryInfo(quickTestDir);
        if (quickTestInfo.fileCount > 0) {
          displayInfo('Archivos generados:');
          quickTestInfo.files.forEach(file => {
            console.log(`  📄 ${file}`);
          });
        }
      }
      
      return result;
    } catch (error) {
      displayError(`Error en prueba rápida: ${error.message}`);
      return false;
    }
  }

  async analyzeRepository(repoName, verbose = false) {
    try {
      const repoPath = path.resolve('./Repo/Cloned', repoName);
      
      if (!(await this.systemUtils.exists(repoPath))) {
        displayWarning(`Repositorio no encontrado: ${repoName}`);
        return false;
      }
      
      // Buscar archivos de solución en el repositorio
      const solutions = await this.findSolutionFiles(repoPath);
      
      if (solutions.length === 0) {
        displayWarning(`No se encontraron soluciones en ${repoName}`);
        return true; // No es un error, simplemente no hay soluciones
      }
      
      let success = true;
      
      for (const solution of solutions) {
        const solutionName = path.basename(solution, '.sln');
        const outputDir = path.join(this.testResultsDir, 'individual-tests', repoName, solutionName);
        
        const result = await this.indexerHandler.analyze({
          solution,
          output: outputDir,
          format: 'json',
          verbose,
          noGraph: false,
          noStats: false
        });
        
        if (!result) {
          success = false;
        }
      }
      
      return success;
    } catch (error) {
      displayError(`Error analizando ${repoName}: ${error.message}`);
      return false;
    }
  }

  async getAvailableRepositories() {
    const repoBaseDir = path.resolve('./Repo/Cloned');
    
    if (!(await this.systemUtils.exists(repoBaseDir))) {
      return [];
    }
    
    const repoInfo = await this.systemUtils.getDirectoryInfo(repoBaseDir);
    const repositories = [];
    
    for (const item of repoInfo.files) {
      const itemPath = path.join(repoBaseDir, item);
      const itemInfo = await this.systemUtils.getDirectoryInfo(itemPath);
      
      if (itemInfo.isDirectory) {
        repositories.push(item);
      }
    }
    
    return repositories;
  }

  async findSolutionFiles(directory, maxDepth = 1) {
    try {
      const solutionFiles = [];
      
      // Buscar en la raíz (nivel 0)
      const rootFiles = await fs.readdir(directory);
      for (const file of rootFiles) {
        if (file.endsWith('.sln')) {
          solutionFiles.push(path.join(directory, file));
        }
      }
      
      // Buscar un nivel dentro (nivel 1) si maxDepth >= 1
      if (maxDepth >= 1) {
        for (const item of rootFiles) {
          const itemPath = path.join(directory, item);
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
      console.error(`Error buscando archivos .sln en ${directory}: ${error.message}`);
      return [];
    }
  }

  async findTestSolutions() {
    const possibleSolutions = [
      path.resolve('../BackEnd/api/api.sln'),
      path.resolve('../BackEnd/Guru.sln')
    ];
    
    // Agregar soluciones de repositorios clonados
    const repositories = await this.getAvailableRepositories();
    for (const repo of repositories) {
      const repoPath = path.resolve('./Repo/Cloned', repo);
      const solutions = await this.findSolutionFiles(repoPath);
      possibleSolutions.push(...solutions);
    }
    
    // Filtrar solo las que existen
    const existingSolutions = [];
    for (const solution of possibleSolutions) {
      if (await this.systemUtils.exists(solution)) {
        existingSolutions.push(solution);
      }
    }
    
    return existingSolutions;
  }

  async isIndexerReady() {
    const indexerDir = path.resolve('./Indexer');
    const executable = path.join(indexerDir, 'bin', 'Release', 'net8.0', 'RoslynIndexer.dll');
    return await this.systemUtils.exists(executable);
  }

  async ensureTestConfigs() {
    const testConfigPath = path.join(this.configsDir, 'batch-test-config.yaml');
    
    if (!(await this.systemUtils.exists(testConfigPath))) {
      displayInfo('Creando configuración de testing...');
      
      const testConfig = `# Configuración de testing para Grafo
outputDirectory: "../test-results/batch-output"
generateGraphs: true
generateStatistics: true
filterTypes:
  - "Class"
  - "Interface"
  - "Method"
  - "Property"
excludeProjects:
  - ".*\\\\.Tests$"
  - ".*\\\\.Test$"
  - ".*\\\\.UnitTests$"
solutions:
  # Se configurará dinámicamente basado en repositorios disponibles
`;
      
      try {
        await this.systemUtils.ensureDir(this.configsDir);
        await fs.writeFile(testConfigPath, testConfig, 'utf8');
        displayInfo(`Configuración creada: ${testConfigPath}`);
      } catch (error) {
        displayWarning(`No se pudo crear configuración: ${error.message}`);
      }
    }
  }

  async createQuickTestScript() {
    // Crear un script simple para pruebas rápidas
    const scriptPath = path.join(this.testResultsDir, 'quick-test.sh');
    
    const script = `#!/bin/bash
# Script de prueba rápida generado por grafo-cli
echo "Ejecutando prueba rápida del RoslynIndexer..."
cd ../Indexer
make quick-test
`;
    
    try {
      await fs.writeFile(scriptPath, script, 'utf8');
      // En Windows, chmod no es necesario, pero no causa error si se ejecuta
      if (process.platform !== 'win32') {
        await this.systemUtils.execute('chmod', ['+x', scriptPath]);
      }
    } catch (error) {
      displayWarning(`No se pudo crear script de prueba: ${error.message}`);
    }
  }

  displayTestResults(results) {
    console.log('');
    displayInfo('📊 Resumen de resultados:');
    
    const tableData = results.map(result => [
      result.repository,
      result.success ? chalk.green('✓ Éxito') : chalk.red('✗ Error')
    ]);
    
    displayTable(['Repositorio', 'Estado'], tableData);
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    console.log('');
    if (successCount === totalCount) {
      displaySuccess(`Todos los tests completados exitosamente (${successCount}/${totalCount})`);
    } else {
      displayWarning(`${successCount}/${totalCount} tests exitosos`);
    }
  }

  async displayBatchResults() {
    const batchOutputDir = path.join(this.testResultsDir, 'batch-output');
    
    if (await this.systemUtils.exists(batchOutputDir)) {
      const batchInfo = await this.systemUtils.getDirectoryInfo(batchOutputDir);
      
      displayInfo('📦 Resultados del procesamiento por lotes:');
      console.log(`  Archivos generados: ${batchInfo.fileCount}`);
      
      if (batchInfo.fileCount > 0) {
        const batchSize = await this.systemUtils.getDirectorySize(batchOutputDir);
        console.log(`  Tamaño total: ${this.systemUtils.formatBytes(batchSize)}`);
        
        displayInfo('Archivos:');
        batchInfo.files.forEach(file => {
          const ext = path.extname(file);
          const icon = ext === '.json' ? '📄' : ext === '.csv' ? '📊' : '📋';
          console.log(`  ${icon} ${file}`);
        });
      }
    }
  }
}
