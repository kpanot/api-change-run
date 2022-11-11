import { generateCommand, processCall, retrieveAccessToken, startPolling } from './poll-url-change.mjs';


describe('Pool-url-change', () => {

  beforeAll(() => {
    console.info = jest.fn();
    console.debug = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  })

  describe('generateCommand function', () => {
    test('should keep the original command', () => {
      const command = generateCommand('test command', false, 'response');
      expect(command).toBe('test command');
    });

    test('should add "npm run" prefix if script', () => {
      const command = generateCommand('test --command', true);
      expect(command).toMatch(/ run test --command$/);
    });

    test('should add replace response variable', () => {
      const command = generateCommand('test --command ${RESPONSE}', false, 'res');
      expect(command).toBe('test --command res');
    });
  });

  describe('processCall function', () => {
    beforeEach(() => {
      globalThis.fetch = jest.fn();
    });

    it('should trigger call to the url without authentication', async () => {
      await processCall('test-url', {});
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'test-url',
        { headers: new Headers({ 'Content-Type': 'application/json' }) }
      );
    });

    it('should trigger call to the url with bearer token', async () => {
      const accessToken = 'testToken';
      await processCall('test-url', { accessToken });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'test-url',
        {
          headers: new Headers({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          })
        }
      );
    });

    it('should trigger call to the url with basic token', async () => {
      const basicAuth = {username: 'testUser', password: 'testPwd'};
      await processCall('test-url', { basicAuth });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'test-url',
        {
          headers: new Headers({
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')}`
          })
        }
      );
    });
  });

  describe('processCall function', () => {
    it('should retrieve fail to retrieve token', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: false });
      const res = retrieveAccessToken({ username: 'username', url: 'url', password: 'password' })

      await expect(res).resolves.toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retrieve access token via basic authentication', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => ({ access_token: 'testToken'}) });
      const res = retrieveAccessToken({ username: 'username', url: 'url', password: 'password' })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'url',
        {
          headers: new Headers({
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from('username:password').toString('base64')}`
          }),
          method: 'POST'
        }
      );
      await expect(res).resolves.toBe('testToken');
    });

    it('should retrieve access token via login', async () => {
      let firstCall = true;
      globalThis.fetch = jest.fn().mockImplementation(() => {
        if (firstCall) {
          firstCall = false;
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({
          ok: true,
          json: () => ({ access_token: 'testToken' })
        });
      });
      const res = retrieveAccessToken({ username: 'username', url: 'url', password: 'password' })

      await expect(res).resolves.toBe('testToken');
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        'url',
        {
          headers: new Headers({
            'Content-Type': 'application/json',
          }),
          method: 'POST',
          body: JSON.stringify({ username: 'username', password: 'password' })
        }
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('startPolling function', () => {
    it('should frequently poll the url in case of failure', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ok: false});
      const subscription = startPolling({
        commandTpl: 'test',
        init: false,
        cwd: '',
        delay: 300,
        script: false,
        uri: 'test-url',
        verbose: false
      });
      await new Promise<void>((resolve) => { setTimeout(() => resolve(), 1000); })
      subscription.unsubscribe();

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('should stop in case of fetch failure', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue({});
      globalThis.process = {
        exit: jest.fn<never, [number]>()
      } as any;
      const subscription = startPolling({
        commandTpl: 'test',
        init: false,
        cwd: '',
        delay: 300,
        script: false,
        uri: 'test-url',
        verbose: false
      });
      await new Promise<void>((resolve) => { setTimeout(() => resolve(), 1000); })
      subscription.unsubscribe();

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.process.exit).toHaveBeenCalledWith(2);
    });

    // TODO implement tests for startPolling
  });
});
