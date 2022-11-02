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
import logger from 'Loglevel';

const isYarn = !!process.env.npm_execpath?.endsWith('yarn');

export interface PollUrlChangeOptions {
  uri: string;
  delay: number;
  init: boolean;
  cwd: string;
  script: boolean;
  verbose: boolean;
  commandTpl: string;
}

export function generateCommand(commandTpl: string, script: boolean, response?: string): string {
  const RESPONSE = response || '';
  const command = eval(`\`${commandTpl}\``);
  return script ? `${isYarn ? 'yarn' : 'npm'} run ${command}` : command;
}

export function executePolling(options: PollUrlChangeOptions) {
  const { uri, delay, init, cwd, script, verbose, commandTpl } = options;
  logger.setLevel(verbose ? 'DEBUG' : 'INFO');
  
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
      map(([, current]) => current)
    )
    .subscribe((response) => {
      runningCommandSubject.next(true);
      const command = generateCommand(commandTpl, script, response);
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
