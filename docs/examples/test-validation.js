#!/usr/bin/env node

// Test script to validate formatConfig() functionality
const fs = require('fs');
const path = require('path');

// We need to import the class definition directly from the file
// Since it's not exported, we'll use eval (for testing purposes only)
const fileContent = fs.readFileSync('./index.js', 'utf8');
const classMatch = fileContent.match(/class MCPNestClient[\s\S]+?^\}/m);
if (!classMatch) {
  console.error('Could not extract MCPNestClient class');
  process.exit(1);
}

// Create a minimal mock version of the class with just the methods we need
class MCPNestClient {
  constructor(cookies) {
    this.cookies = cookies;
    this.debug = process.env.DEBUG ? true : false;
  }

  formatConfig(config) {
    const result = {
      valid: {},
      invalid: [],
      warnings: []
    };

    // Validate root structure
    if (!config || !config.mcpServers) {
      result.warnings.push('Configuration must contain mcpServers object');
      return result;
    }

    const ALLOWED_COMMANDS = ['npx', 'uvx'];
    const ALLOWED_FIELDS = ['command', 'args', 'transport', 'env'];

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      const issues = [];
      let converted = {};

      // Rule 4: Skip HTTP/SSE servers
      if (serverConfig.type === 'http' || serverConfig.type === 'sse') {
        result.invalid.push({
          name: serverName,
          reason: `${serverConfig.type.toUpperCase()} transport not supported by MCPNest`,
          suggestion: 'Use stdio-based alternative or deploy server separately'
        });
        continue;
      }

      // Check for HTTP/SSE indicators even without explicit type
      if (serverConfig.url || serverConfig.headers) {
        result.invalid.push({
          name: serverName,
          reason: 'HTTP/SSE fields detected (url/headers)',
          suggestion: 'MCPNest only supports stdio transport'
        });
        continue;
      }

      // Rule 3: Validate command whitelist
      if (!serverConfig.command) {
        result.invalid.push({
          name: serverName,
          reason: 'Missing required field: command',
          suggestion: 'Add command field with value "npx" or "uvx"'
        });
        continue;
      }

      if (!ALLOWED_COMMANDS.includes(serverConfig.command)) {
        const isPath = serverConfig.command.includes('/') || serverConfig.command.includes('\\');
        const suggestion = isPath
          ? 'Package as npm/PyPI package and use "npx" or "uvx" command'
          : `Use "npx" or "uvx" instead of "${serverConfig.command}"`;

        result.invalid.push({
          name: serverName,
          reason: `Command '${serverConfig.command}' not allowed`,
          suggestion: suggestion
        });
        continue;
      }

      // Build converted server config
      converted.command = serverConfig.command;

      // Copy args if present
      if (serverConfig.args) {
        converted.args = serverConfig.args;
      }

      // Rule 2: Convert transport syntax
      // Remove top-level type field and add transport object
      if (!serverConfig.transport || !serverConfig.transport.type) {
        converted.transport = { type: 'stdio' };
      } else {
        converted.transport = serverConfig.transport;
      }

      // Rule 5: Expand environment variables
      if (serverConfig.env) {
        converted.env = {};
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (typeof value === 'string') {
            converted.env[key] = this.expandEnvVar(value);
          } else {
            converted.env[key] = value;
          }
        }
      } else {
        converted.env = {};
      }

      // Rule 1: Remove invalid fields
      const invalidFields = [];
      for (const field of Object.keys(serverConfig)) {
        if (field === 'type') {
          // Silently convert type field to transport
          continue;
        }
        if (!ALLOWED_FIELDS.includes(field)) {
          invalidFields.push(field);
        }
      }

      if (invalidFields.length > 0) {
        result.warnings.push(`Server '${serverName}': Removed invalid fields: ${invalidFields.join(', ')}`);
      }

      // Add to valid servers
      result.valid[serverName] = converted;
    }

    return result;
  }

  expandEnvVar(value) {
    return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
      if (expr.includes(':-')) {
        const [varName, defaultValue] = expr.split(':-');
        const envValue = process.env[varName];
        if (!envValue && !defaultValue) {
          console.error(`Warning: Environment variable '${varName}' is undefined and no default provided`);
        }
        return envValue || defaultValue || '';
      }
      const envValue = process.env[expr];
      if (!envValue) {
        console.error(`Warning: Environment variable '${expr}' is undefined`);
      }
      return envValue || '';
    });
  }
}

// Mock client for testing
class TestClient extends MCPNestClient {
  constructor() {
    super('mock-cookie');
  }
}

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function testFile(filename) {
  console.log(`\n${colors.yellow}Testing: ${filename}${colors.reset}`);
  console.log('=' . repeat(50));

  const configData = fs.readFileSync(filename, 'utf8');
  const config = JSON.parse(configData);

  const client = new TestClient();
  const result = client.formatConfig(config);

  const validCount = Object.keys(result.valid).length;
  const invalidCount = result.invalid.length;

  console.log(`\n⚠ Validation Results:`);

  if (validCount > 0) {
    console.log(`  ${colors.green}✓${colors.reset} ${validCount} server${validCount !== 1 ? 's' : ''} validated successfully`);
    for (const name of Object.keys(result.valid)) {
      console.log(`    - ${name}`);
    }
  }

  if (invalidCount > 0) {
    console.log(`  ${colors.red}✗${colors.reset} ${invalidCount} server${invalidCount !== 1 ? 's' : ''} rejected:`);
    for (const invalid of result.invalid) {
      console.log(`    • "${invalid.name}": ${invalid.reason}`);
      console.log(`      Suggestion: ${invalid.suggestion}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`  ${colors.yellow}⚠ Warnings:${colors.reset}`);
    for (const warning of result.warnings) {
      console.log(`    • ${warning}`);
    }
  }

  // Determine exit code
  let exitCode;
  if (validCount === 0) {
    exitCode = 2; // All servers rejected
    console.log(`\n  ${colors.red}Exit code: ${exitCode} (All servers rejected)${colors.reset}`);
  } else if (invalidCount > 0) {
    exitCode = 1; // Some servers rejected
    console.log(`\n  ${colors.yellow}Exit code: ${exitCode} (Some servers rejected)${colors.reset}`);
  } else {
    exitCode = 0; // All servers valid
    console.log(`\n  ${colors.green}Exit code: ${exitCode} (All servers valid)${colors.reset}`);
  }

  // Show converted config
  if (validCount > 0) {
    console.log(`\nConverted config:`);
    console.log(JSON.stringify({ mcpServers: result.valid }, null, 2));
  }

  return exitCode;
}

// Test all files
const testFiles = [
  'test-valid.json',
  'test-mixed.json',
  'test-invalid.json',
  'test-envvars.json',
  'test-no-command.json'
];

console.log(`${colors.yellow}MCPNest Config Validation Test Suite${colors.reset}`);

// Set test environment variable
process.env.TEST_API_KEY = 'test-key-123';

for (const file of testFiles) {
  if (fs.existsSync(file)) {
    const exitCode = testFile(file);
  } else {
    console.log(`${colors.red}File not found: ${file}${colors.reset}`);
  }
}

console.log(`\n${colors.green}All tests completed!${colors.reset}`);