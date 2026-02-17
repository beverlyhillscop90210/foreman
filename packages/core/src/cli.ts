#!/usr/bin/env node

/**
 * Foreman CLI - Main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './cli/init.js';
import { scopeCommand } from './cli/scope.js';
import { statusCommand } from './cli/status.js';
import { watchCommand } from './cli/watch.js';

const program = new Command();

program
  .name('foreman')
  .description('AI Agent Supervisor - Enforce task scope on coding agents')
  .version('0.1.0');

// foreman init
program
  .command('init')
  .description('Initialize .foreman.json and install git hooks')
  .option('-n, --name <name>', 'Project name')
  .action(initCommand);

// foreman scope
program
  .command('scope')
  .description('Set active task scope')
  .argument('[task-name]', 'Task name/description')
  .option('--allow <patterns...>', 'Allowed file patterns (glob)')
  .option('--block <patterns...>', 'Blocked file patterns (glob)')
  .option('--interactive', 'Interactive file selector')
  .action(scopeCommand);

// foreman status
program
  .command('status')
  .description('Show active task and file scope status')
  .action(statusCommand);

// foreman watch
program
  .command('watch')
  .description('Watch files in real-time and alert on scope violations')
  .action(watchCommand);

// foreman review
program
  .command('review')
  .description('Review staged changes with AI')
  .action(async () => {
    console.log(chalk.yellow('⚠️  AI review coming in Sprint 2 (MCP Server)'));
  });

// foreman approve
program
  .command('approve')
  .description('Approve current changes')
  .action(async () => {
    console.log(chalk.yellow('⚠️  Approval workflow coming in Sprint 2'));
  });

// foreman reject
program
  .command('reject')
  .description('Reject and revert current changes')
  .action(async () => {
    console.log(chalk.yellow('⚠️  Rejection workflow coming in Sprint 2'));
  });

// foreman history
program
  .command('history')
  .description('Show past tasks')
  .action(async () => {
    console.log(chalk.yellow('⚠️  History tracking coming in Sprint 3'));
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error && error.message !== '0.1.0') {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  }
}

main();

