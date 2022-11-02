import { generateCommand } from './poll-url-change.mjs';

describe('Pool-url-change', () => {

  describe('generateCommand function', () => {

    test('should keep the original command', () => {
      const command = generateCommand('test command', false, 'response');
      expect(command).toBe('test command');
    });

    test('should add "npm run" prefix if script', () => {
      const command = generateCommand('test --command', true);
      expect(command).toBe('npm run test --command');
    });

    test('should add replace response variable', () => {
      const command = generateCommand('test --command ${RESPONSE}', false, 'res');
      expect(command).toBe('npm run test --command res');
    });
  });

});

// TODO implement tests