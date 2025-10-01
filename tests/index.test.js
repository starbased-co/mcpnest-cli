const WebSocket = require('ws');
const fs = require('fs');
const { program } = require('commander');
const MCPNestClient = require('../src/index');
describe('MCPNestClient - formatConfig', () => {
  let client;

  beforeEach(() => {
    client = new MCPNestClient('test-cookie');
    // Save original env
    this.originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    process.env = this.originalEnv;
  });

  describe('Valid configurations', () => {
    test('should accept valid npx server', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            transport: { type: 'stdio' }
          }
        }
      };

      const result = client.formatConfig(config);
      expect(Object.keys(result.valid)).toHaveLength(1);
      expect(result.valid['test-server'].command).toBe('npx');
      expect(result.invalid).toHaveLength(0);
    });

    test('should accept valid uvx server', () => {
      const config = {
        mcpServers: {
          'python-server': {
            command: 'uvx',
            args: ['mcp-server-git'],
            transport: { type: 'stdio' }
          }
        }
      };

      const result = client.formatConfig(config);
      expect(Object.keys(result.valid)).toHaveLength(1);
      expect(result.valid['python-server'].command).toBe('uvx');
      expect(result.invalid).toHaveLength(0);
    });

    test('should add default stdio transport if missing', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['-y', 'some-package']
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.valid['test-server'].transport).toEqual({ type: 'stdio' });
    });

    test('should add empty env object if missing', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['package']
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.valid['test-server'].env).toEqual({});
    });

    test('should preserve args when provided', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['-y', 'package', '--option', 'value']
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.valid['test-server'].args).toEqual(['-y', 'package', '--option', 'value']);
    });
  });

  describe('Invalid transport types', () => {
    test('should reject HTTP transport', () => {
      const config = {
        mcpServers: {
          'http-server': {
            type: 'http',
            command: 'npx'
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].name).toBe('http-server');
      expect(result.invalid[0].reason).toContain('HTTP transport not supported');
    });

    test('should reject SSE transport', () => {
      const config = {
        mcpServers: {
          'sse-server': {
            type: 'sse',
            command: 'npx'
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('SSE transport not supported');
    });

    test('should reject servers with url field', () => {
      const config = {
        mcpServers: {
          'url-server': {
            command: 'npx',
            url: 'http://example.com'
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('HTTP/SSE fields detected');
    });

    test('should reject servers with headers field', () => {
      const config = {
        mcpServers: {
          'headers-server': {
            command: 'npx',
            headers: { 'Authorization': 'Bearer token' }
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('HTTP/SSE fields detected');
    });
  });

  describe('Command validation', () => {
    test('should reject missing command', () => {
      const config = {
        mcpServers: {
          'no-command': {
            args: ['something']
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toBe('Missing required field: command');
    });

    test('should reject invalid command (not npx/uvx)', () => {
      const config = {
        mcpServers: {
          'node-server': {
            command: 'node',
            args: ['server.js']
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('Command \'node\' not allowed');
    });

    test('should reject path-based commands', () => {
      const config = {
        mcpServers: {
          'path-server': {
            command: '/usr/local/bin/server',
            args: []
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toContain('not allowed');
      expect(result.invalid[0].suggestion).toContain('Package as npm/PyPI package');
    });

    test('should reject Windows path commands', () => {
      const config = {
        mcpServers: {
          'windows-path': {
            command: 'C:\\Program Files\\server.exe'
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].suggestion).toContain('Package as npm/PyPI package');
    });
  });

  describe('Invalid fields handling', () => {
    test('should remove invalid fields and warn', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['package'],
            invalidField: 'value',
            anotherBadField: 123
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.valid['test-server']).not.toHaveProperty('invalidField');
      expect(result.valid['test-server']).not.toHaveProperty('anotherBadField');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Removed invalid fields');
    });

    test('should convert type field to transport', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            type: 'stdio'
          }
        }
      };

      const result = client.formatConfig(config);
      expect(result.valid['test-server'].transport).toEqual({ type: 'stdio' });
      expect(result.warnings).toHaveLength(0); // type is silently converted
    });
  });

  describe('Edge cases', () => {
    test('should handle empty config', () => {
      const result = client.formatConfig({});
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('must contain mcpServers object');
    });

    test('should handle null config', () => {
      const result = client.formatConfig(null);
      expect(result.warnings).toHaveLength(1);
    });

    test('should handle empty mcpServers', () => {
      const config = { mcpServers: {} };
      const result = client.formatConfig(config);
      expect(Object.keys(result.valid)).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });

    test('should handle mixed valid and invalid servers', () => {
      const config = {
        mcpServers: {
          'valid-server': {
            command: 'npx',
            args: ['package']
          },
          'invalid-server': {
            command: 'node',
            args: ['server.js']
          },
          'another-valid': {
            command: 'uvx',
            args: ['python-package']
          }
        }
      };

      const result = client.formatConfig(config);
      expect(Object.keys(result.valid)).toHaveLength(2);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].name).toBe('invalid-server');
    });
  });
});

describe('MCPNestClient - expandEnvVar', () => {
  let client;
  let originalEnv;

  beforeEach(() => {
    client = new MCPNestClient('test-cookie');
    originalEnv = { ...process.env };
    // Suppress console.error for these tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('should expand simple variable', () => {
    process.env.TEST_VAR = 'test-value';
    const result = client.expandEnvVar('${TEST_VAR}');
    expect(result).toBe('test-value');
  });

  test('should expand variable with default when env var exists', () => {
    process.env.TEST_VAR = 'actual-value';
    const result = client.expandEnvVar('${TEST_VAR:-default-value}');
    expect(result).toBe('actual-value');
  });

  test('should use default when env var is undefined', () => {
    delete process.env.TEST_VAR;
    const result = client.expandEnvVar('${TEST_VAR:-default-value}');
    expect(result).toBe('default-value');
  });

  test('should return empty string for undefined variable without default', () => {
    delete process.env.UNDEFINED_VAR;
    const result = client.expandEnvVar('${UNDEFINED_VAR}');
    expect(result).toBe('');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Environment variable 'UNDEFINED_VAR' is undefined")
    );
  });

  test('should expand multiple variables in one string', () => {
    process.env.VAR1 = 'value1';
    process.env.VAR2 = 'value2';
    const result = client.expandEnvVar('${VAR1}/path/${VAR2}');
    expect(result).toBe('value1/path/value2');
  });

  test('should handle plain strings without variables', () => {
    const result = client.expandEnvVar('plain string');
    expect(result).toBe('plain string');
  });

  test('should warn when variable is undefined and no default provided', () => {
    delete process.env.MISSING_VAR;
    client.expandEnvVar('${MISSING_VAR:-}');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Environment variable 'MISSING_VAR' is undefined and no default provided")
    );
  });
});

describe('MCPNestClient - extractConfigFromRender', () => {
  let client;

  beforeEach(() => {
    client = new MCPNestClient('test-cookie');
  });

  test('should extract config from primary path (renderTree["8"]["3"])', () => {
    const response = {
      rendered: {
        "0": {
          "8": {
            "3": '{"mcpServers":{"test":{"command":"npx"}}}'
          }
        }
      }
    };

    const result = client.extractConfigFromRender(response);
    expect(result).toBe('{"mcpServers":{"test":{"command":"npx"}}}');
  });

  test('should extract config from fallback path (renderTree["1"]["3"]["0"])', () => {
    const response = {
      rendered: {
        "0": {
          "1": {
            "3": {
              "0": '{"mcpServers":{"test":{"command":"uvx"}}}'
            }
          }
        }
      }
    };

    const result = client.extractConfigFromRender(response);
    expect(result).toBe('{"mcpServers":{"test":{"command":"uvx"}}}');
  });

  test('should decode HTML entities', () => {
    const response = {
      rendered: {
        "0": {
          "8": {
            "3": '{&quot;mcpServers&quot;:{&quot;test&quot;:&lt;value&gt;}}'
          }
        }
      }
    };

    const result = client.extractConfigFromRender(response);
    expect(result).toBe('{"mcpServers":{"test":<value>}}');
  });

  test('should use deep search when standard paths fail', () => {
    const response = {
      rendered: {
        "0": {
          "deep": {
            "nested": {
              "path": '{"mcpServers":{"found":"here"}}'
            }
          }
        }
      }
    };

    const result = client.extractConfigFromRender(response);
    expect(result).toContain('mcpServers');
  });

  test('should return null when no config found', () => {
    const response = {
      rendered: {
        "0": {
          "empty": "no config here"
        }
      }
    };

    const result = client.extractConfigFromRender(response);
    expect(result).toBeNull();
  });

  test('should handle missing rendered field', () => {
    const response = {};
    const result = client.extractConfigFromRender(response);
    expect(result).toBeNull();
  });

  test('should limit deep search depth to prevent infinite loops', () => {
    const deeplyNested = {};
    let current = deeplyNested;
    for (let i = 0; i < 15; i++) {
      current.nested = {};
      current = current.nested;
    }
    current.config = '{"mcpServers":{}}';

    const response = {
      rendered: {
        "0": deeplyNested
      }
    };

    const result = client.extractConfigFromRender(response);
    expect(result).toBeNull(); // Should not find due to depth limit
  });
});

// Note: WebSocket and CLI tests would require more setup with mocks
// These are the core unit tests for the synchronous methods
describe('Integration notes', () => {
  test('README: Additional test requirements', () => {
    // This is a placeholder to document what additional tests are needed:
    //
    // 1. WebSocket tests (require ws mocking):
    //    - fetchPageTokens: HTTP request mocking
    //    - connect: WebSocket connection mocking
    //    - startHeartbeat: setInterval verification
    //    - joinLiveView: message handling
    //    - sendMessage: WebSocket send verification
    //
    // 2. CLI tests (require commander and process mocking):
    //    - read command: success, missing auth, errors
    //    - write command: file input, stdin input, validation
    //    - Exit codes: 0 (success), 1 (partial), 2 (all rejected), 3 (fatal)
    //
    // 3. End-to-end tests:
    //    - Full read workflow
    //    - Full write workflow with validation
    //    - Error handling throughout stack
    //
    // Recommended packages:
    //    - jest: test framework
    //    - sinon: mocking WebSocket
    //    - nock: HTTP request mocking for fetchPageTokens
    //    - mock-stdin: stdin mocking for write command

    expect(true).toBe(true);
  });
});
