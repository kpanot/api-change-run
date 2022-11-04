import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import { Command } from 'commander';
import type { PackageJson } from 'type-fest';

import { startPolling } from './poll-url-change.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '..', 'package.json');
const { version } = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' })) as PackageJson;

let commandTpl!: string;
const program = new Command('api-change-run')
  .description('Execute commands on API change')
  .version(version || '0.0.0')
  .argument('<command>', 'Command to execute')
  .requiredOption('-u, --uri <URI>', 'URL to the API to watch')
  .option('-d --delay <number>', 'Delay between polling in second', (v) => +v, 200)
  .option('--cwd <path>', 'Current working directory', (v) => v, process.cwd())
  .option('-i, --init', 'Trigger a run on the initial connection')
  .option('-s --script', 'Indicate that the given argument is a script that need to be run with npm (or yarn)')
  .option('-v, --verbose', 'Current working directory')
  .action((command) => {
    commandTpl = command;
  })
  .parse();

const subscription = startPolling({ ...program.opts(), commandTpl})
process.on('exit', () => subscription.unsubscribe());
