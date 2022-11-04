import { exec } from 'node:child_process';
import { interval, BehaviorSubject, from, of } from 'rxjs';
import {
  withLatestFrom,
  filter,
  switchMap,
  catchError,
  pairwise,
  startWith,
  tap,
  map,
} from 'rxjs/operators';
import logger from 'loglevel';

const isYarn = !!process.env.npm_execpath?.endsWith('yarn');

/**
 * Option of the poll execution
 */
export interface PollUrlChangeOptions {
  /** URI of the API to check */
  uri: string;
  /** Delay between polls */
  delay: number;
  /** Determine if the first success call is triggering an execution */
  init: boolean;
  /** Curernt Working Directory */
  cwd: string;
  /** Determine if the given command is an NPM script */
  script: boolean;
  /** Determine if the debug message should be display in the console */
  verbose: boolean;
  /** Template of the command to execute */
  commandTpl: string;
}

/**
 * 
 * Generate the command to execute
 * 
 * @param commandTpl Template of the command to execute
 * @param script Determine if the given command is an NPM script
 * @param response Response of the API call
 * @returns 
 */
export function generateCommand(commandTpl: string, script: boolean, response?: string): string {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const RESPONSE = response || '';
  const command = eval(`\`${commandTpl}\``);
  return script ? `${isYarn ? 'yarn' : 'npm'} run ${command}` : command;
}

/**
 * Start API Watch
 * 
 * @param options Options of the API watcher
 * @returns 
 */
export function startPolling(options: PollUrlChangeOptions) {
  const { uri, delay, init, cwd, script, verbose, commandTpl } = options;
  logger.setLevel(verbose ? 'DEBUG' : 'INFO', true);
  const runningCommandSubject = new BehaviorSubject(false);
  const runningCommand$ = runningCommandSubject.pipe(
    tap((value) => {
      if (!value) {
        logger.info(`Listening for change on ${uri}`);
      } else {
        logger.info('Launching command ...');
      }
    }),
  );

  const subscription = interval(delay)
    .pipe(
      withLatestFrom(runningCommand$),
      filter(([, running]) => !running),
      switchMap(() => from(fetch(uri)).pipe(catchError(() => of(null)))),
      filter((req): req is Response => {
        const ok = !!req && req.ok;
        if (!ok) {
          logger.debug('Skip rerun because of call failure');
          logger.debug(`Status: ${req?.status || 'unknown'}`);
        }
        return ok;
      }),
      switchMap((req) => req.text()),
      startWith(undefined),
      pairwise(),
      filter(([prev, current]) => (init && !prev) || prev !== current),
      map(([, current]) => current),
    )
    .subscribe((response) => {
      runningCommandSubject.next(true);
      const command = generateCommand(commandTpl, script, response);
      logger.debug(`Run "${command}" in ${cwd}`);
      const run = exec(command, { cwd, env: process.env });
      run.stdout?.pipe(process.stdout);
      run.stderr?.pipe(process.stderr);
      run.on('error', (err) => logger.warn(err));
      run.on('exit', () => {
        runningCommandSubject.next(false);
      });
    });

  return subscription;
}
