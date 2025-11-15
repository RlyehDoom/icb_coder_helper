import chalk from 'chalk';

export function displayBanner(subtitle = '') {
    console.log(chalk.cyan(`
   ██████╗ ██████╗  █████╗ ███████╗ ██████╗ 
  ██╔════╝ ██╔══██╗██╔══██╗██╔════╝██╔═══██╗
  ██║  ███╗██████╔╝███████║█████╗  ██║   ██║
  ██║   ██║██╔══██╗██╔══██║██╔══╝  ██║   ██║
  ╚██████╔╝██║  ██║██║  ██║██║     ╚██████╔╝
   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝      ╚═════╝ 
  `));
  
  if (subtitle) {
    console.log(chalk.cyan.bold(`                ${subtitle}`));
  }
  
  console.log(chalk.gray('  C# Code Analysis & Repository Management CLI'));
  console.log(chalk.gray('  ─────────────────────────────────────────────\n'));
}

export function displayHelp() {
  console.log(chalk.yellow('🚀 Comandos principales:'));
  console.log('');
  console.log(chalk.cyan.bold('  grafo setup') + '                - ' + chalk.green('Flujo completo: Repo → Indexer → IndexerDb → Query API'));
  console.log(chalk.cyan('  grafo mongodb [action]') + '   - ' + chalk.green('Gestionar MongoDB en Docker'));
  console.log(chalk.cyan('  grafo mcp [action]') + '       - ' + chalk.green('Gestionar MCP Server en Docker'));
  console.log(chalk.cyan('  grafo indexer [action]') + '   - Gestionar RoslynIndexer');
  console.log(chalk.cyan('  grafo repo [action]') + '      - Gestionar repositorios');
  console.log(chalk.cyan('  grafo test [action]') + '      - Ejecutar tests y análisis');
  console.log(chalk.cyan('  grafo all [action]') + '       - Operaciones globales');
  console.log(chalk.cyan('  grafo status') + '             - Estado de todos los componentes');
  console.log(chalk.cyan('  grafo interactive') + '        - Modo interactivo');
  console.log('');
  console.log(chalk.yellow('⚡ Quick Start:'));
  console.log('');
  console.log(chalk.green('  # Iniciar MongoDB'));
  console.log(chalk.white('  grafo mongodb start'));
  console.log('');
  console.log(chalk.green('  # Iniciar MCP Server (inicia MongoDB automáticamente)'));
  console.log(chalk.white('  grafo mcp build'));
  console.log(chalk.white('  grafo mcp start'));
  console.log('');
  console.log(chalk.yellow('📚 Ejemplos comunes:'));
  console.log('');
  console.log(chalk.green('  # Ejecutar flujo completo de setup'));
  console.log(chalk.white('  grafo setup'));
  console.log('');
  console.log(chalk.green('  # Configurar entorno completo'));
  console.log(chalk.white('  grafo all setup'));
  console.log('');
  console.log(chalk.green('  # Clonar y analizar repositorio'));
  console.log(chalk.white('  grafo repo clone -u https://dev.azure.com/org/project/_git/repo'));
  console.log(chalk.white('  grafo indexer analyze -s ./Repo/Cloned/repo/solution.sln'));
  console.log('');
  console.log(chalk.green('  # Ver estado de servicios'));
  console.log(chalk.white('  grafo mongodb status'));
  console.log(chalk.white('  grafo mcp status'));
  console.log('');
  console.log(chalk.yellow('💡 Para ayuda específica:'));
  console.log(chalk.white('  grafo [comando] --help'));
  console.log(chalk.white('  grafo mongodb              # Ver comandos MongoDB'));
  console.log(chalk.white('  grafo mcp                  # Ver comandos MCP'));
  console.log(chalk.white('  grafo interactive          # Modo guiado'));
  console.log('');
}

export function displaySeparator() {
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
}

export function displaySuccess(message) {
  console.log(chalk.green(`✅ ${message}`));
}

export function displayError(message) {
  console.log(chalk.red(`❌ ${message}`));
}

export function displayWarning(message) {
  console.log(chalk.yellow(`⚠️  ${message}`));
}

export function displayInfo(message) {
  console.log(chalk.blue(`ℹ️  ${message}`));
}

export function displayStep(step, message) {
  console.log(chalk.cyan(`[${step}]`) + ` ${message}`);
}

export function displayProgressStart(message) {
  console.log(chalk.blue('🔄 ') + message + chalk.gray(' ...'));
}

export function displayProgressEnd(message, success = true) {
  const icon = success ? chalk.green('✅') : chalk.red('❌');
  console.log(icon + ` ${message}`);
}

export function displayTable(headers, rows) {
  const columnWidths = headers.map((header, index) => {
    const maxContentWidth = Math.max(...rows.map(row => String(row[index] || '').length));
    return Math.max(header.length, maxContentWidth);
  });

  // Header
  const headerRow = headers
    .map((header, index) => header.padEnd(columnWidths[index]))
    .join(' │ ');
  console.log(chalk.cyan('│ ' + headerRow + ' │'));
  
  // Separator
  const separator = columnWidths
    .map(width => '─'.repeat(width))
    .join('─┼─');
  console.log(chalk.gray('├─' + separator + '─┤'));
  
  // Rows
  rows.forEach(row => {
    const dataRow = row
      .map((cell, index) => String(cell || '').padEnd(columnWidths[index]))
      .join(' │ ');
    console.log('│ ' + dataRow + ' │');
  });
  
  // Bottom border
  const bottomBorder = columnWidths
    .map(width => '─'.repeat(width))
    .join('─┴─');
  console.log(chalk.gray('└─' + bottomBorder + '─┘'));
}
