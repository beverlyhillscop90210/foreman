/**
 * foreman init - Initialize project
 */

import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { ConfigManager } from '../config.js';
import { installGitHooks } from '../git-hooks/install.js';
import { basename } from 'path';

interface InitOptions {
  name?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.blue.bold('\n🏗️  Foreman Initialization\n'));

  const configManager = new ConfigManager();

  // Check if already initialized
  if (configManager.exists()) {
    console.log(chalk.yellow('⚠️  .foreman.json already exists'));
    const shouldContinue = await input({
      message: 'Overwrite existing configuration? (yes/no)',
      default: 'no',
    });

    if (shouldContinue.toLowerCase() !== 'yes') {
      console.log(chalk.gray('Initialization cancelled'));
      return;
    }
  }

  // Get project name
  const projectName =
    options.name ||
    (await input({
      message: 'Project name:',
      default: basename(process.cwd()),
    }));

  // Create config
  try {
    const config = configManager.init(projectName);
    console.log(chalk.green('✅ Created .foreman.json'));

    // Install git hooks
    try {
      await installGitHooks();
      console.log(chalk.green('✅ Installed git hooks'));
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠️  Could not install git hooks: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      console.log(
        chalk.gray('   You can install them manually later with: foreman hooks install')
      );
    }

    console.log(chalk.blue.bold('\n✨ Foreman initialized successfully!\n'));
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  1. Run: foreman scope "Your task description"'));
    console.log(chalk.gray('  2. Let your AI agent work within the defined scope'));
    console.log(chalk.gray('  3. Foreman will block out-of-scope changes\n'));
  } catch (error) {
    throw new Error(
      `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

