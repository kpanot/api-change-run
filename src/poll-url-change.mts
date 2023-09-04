import { exec } from 'node:child_process';
import { interval, BehaviorSubject, combineLatest } from 'rxjs';
import {
  withLatestFrom,
  filter,
  switchMap,
  pairwise,
  startWith,
  map,
} from 'rxjs/operators';
import logger from 'loglevel';
import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import { Headers } from 'node-fetch';

const isYarn = !!process.env.npm_execpath?.endsWith('yarn');

/** Basic Authentication object */
export interface LoginUserPassword {
  /** URL uses to login */
  url: string;
  /** Username to login */
  username: string;
  /** Password to login */
  password: string;
}

/** Basic Authentication object */
export interface BasicAuth {
  /** Username to login */
  username: string;
  /** Password to login */
  password: string;
}

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
  /** Access Token used to contact the Api */
  accessToken?: string;
  /** Basic Authentication use to request access token */
  basicAuth?: BasicAuth;
  /** Object to login to request an access_token */
  loginUrl?: LoginUserPassword;
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
 * Retry a call until the fetch command success
 * @param fetchCallFactory function to call to process to the call
 * @param delay delay between retry
 */
export async function retryCallUntilToMakeIt(fetchCallFactory: () => Promise<Response>, delay = 1000) {
  let res: Response | undefined;
  do {
    try {
      res = await fetchCallFactory();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } while (!res);
  return res;
}

/**
 * Retrieve Access Token from Basic Authentication
 *
 * @returns 
 */
export async function retrieveAccessToken({ username, url, password }: LoginUserPassword) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
  logger.debug('auth - Initialize call Basic Auth');
  let res = await retryCallUntilToMakeIt(() => fetch(url, { headers, method: 'POST' }));

  let value: {access_token: string} | null = null;
  try {
    value = await res.json() as { access_token: string };
    logger.debug(`auth - Basic Auth response: ${JSON.stringify(value)}`);
  } catch { 
    // ignored
  }
  if (!res.ok || !value || !value.access_token) {
    headers.delete('Authorization');
    logger.debug('auth - Initialize call Basic Auth with body parameters');
    res = await retryCallUntilToMakeIt(() => fetch(url, { headers, method: 'POST', body: JSON.stringify({ username, password }) }));

    try {
      logger.debug(`auth - Basic Auth with body parameters response: ${JSON.stringify(value)}`);
      value = await res.json() as { access_token: string };
    } catch {
      // ignored
    }
  }
  return value && value.access_token || undefined;
}

/**
 * Process API call
 *
 * @param uri URI of the API to check
 * @param authentication Authentication information to process the call
 * @returns 
 */
export function processCall(uri: string, authentication: { accessToken?: string, basicAuth?: BasicAuth}) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (authentication.accessToken) {
    headers.set('Authorization', `Bearer ${authentication.accessToken}`);
  } else if (authentication.basicAuth) {
    headers.set('Authorization', `Basic ${Buffer.from(`${authentication.basicAuth.username}:${authentication.basicAuth.password}`).toString('base64')}`);
  } else {
    headers.delete('Authorization');
  }
  return fetch(uri, { headers });
}

/**
 * Start API Watch
 * 
 * @param options Options of the API watcher
 * @returns 
 */
export function startPolling(options: PollUrlChangeOptions, executor: typeof exec = exec) {
  const { uri, delay, init, cwd, script, verbose, commandTpl, basicAuth, loginUrl } = options;
  let { accessToken } = options;
  logger.setLevel(verbose ? 'DEBUG' : 'INFO', true);
  const retrieveNewAccessTokenSubject = new BehaviorSubject(false);
  const runningCommandSubject = new BehaviorSubject(false);

  const call$ = combineLatest([interval(delay), runningCommandSubject, retrieveNewAccessTokenSubject]).pipe(
    filter(([, running, authRetrieving]) => !running && !authRetrieving),
    switchMap(() => processCall(uri, {accessToken, basicAuth}).catch(() => Promise.resolve())),
    filter((response): response is Response => !!response)
  );

  const retrieveNewAccessToken$ = call$.pipe(
    withLatestFrom(retrieveNewAccessTokenSubject),
    filter(([res, downloading]) => !downloading && !!res && (res.status === 401 || res.status === 403)),
  )

  const subscription = call$.pipe(
    filter((req): req is Response => {
      const ok = !!req && req.ok;
      if (!ok) {
        logger.debug('watcher - Skip rerun because of call failure');
        logger.debug(`watcher - Status: ${req?.status || 'unknown'}`);
        if (req?.status === 401 || req?.status === 403) {
          if (accessToken) {
            logger.warn(`The given Access Token does not get access to watched URI (token: ${accessToken})`);
          } else if (basicAuth) {
            logger.warn('Invalid basic authentication');
          }
        }
      }
      return ok;
    }),
    switchMap((req) => req.text()),
    startWith(undefined),
    pairwise(),
    filter(([prev, current]) => (init && !prev) || prev !== current),
    map(([, current]) => current),
  )
  .subscribe({
    next: (response) => {
      runningCommandSubject.next(true);
      const command = generateCommand(commandTpl, script, response);
      logger.debug(`watcher - Run "${command}" in ${cwd}`);
      const run = executor(command, { cwd, env: process.env });
      run.stdout?.pipe(process.stdout);
      run.stderr?.pipe(process.stderr);
      run.on('error', (err) => logger.warn(err));
      run.on('exit', () => runningCommandSubject.next(false));
    },
    error: (err) => {
      logger.error(err);
      process.exit(2);
    }
  });

  subscription.add(
    runningCommandSubject.subscribe((value) => {
      if (!value) {
        logger.info(`Listening for change on ${uri}`);
      } else {
        logger.info('Launching command ...');
      }
    })
  );

  if (loginUrl) {
    const accessTokenSubscription = retrieveNewAccessToken$.subscribe(async () => {
      retrieveNewAccessTokenSubject.next(true);
      accessToken = await retrieveAccessToken(loginUrl);
      retrieveNewAccessTokenSubject.next(false);
    });
    subscription.add(accessTokenSubscription);
  }

  return subscription;
}
