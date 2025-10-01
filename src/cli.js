#!/usr/bin/env node

const fs = require('fs');
const { program } = require('commander');
const MCPNestClient = require('./index');
const { version } = require('../package.json');

// CLI setup
program
  .name('mcpnest')
  .description('CLI for MCPNest configuration management')
  .version(version);

program
  .command('read')
  .description('Read current MCP configuration from MCPNest')
  .option('-c, --cookies <cookies>', 'Cookie string for authentication (or use MCPNEST_COOKIE env var)')
  .action(async (options) => {
    const cookies = options.cookies || process.env.MCPNEST_COOKIE;
    if (!cookies) {
      console.error('Error: No cookies provided. Use -c option or set MCPNEST_COOKIE environment variable');
      process.exit(1);
    }
    const client = new MCPNestClient(cookies);
    try {
      await client.connect();
      await client.readConfig();
      // JSON output and exit happens inside readConfig()
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(3);  // Exit code 3: Fatal error
    }
  });

program
  .command('write')
  .description('Write MCP configuration to MCPNest')
  .option('-c, --cookies <cookies>', 'Cookie string for authentication (or use MCPNEST_COOKIE env var)')
  .option('-f, --file <file>', 'JSON file containing the configuration (reads from stdin if omitted)')
  .action(async (options) => {
    const cookies = options.cookies || process.env.MCPNEST_COOKIE;
    if (!cookies) {
      console.error('Error: No cookies provided. Use -c option or set MCPNEST_COOKIE environment variable');
      process.exit(1);
    }
    const client = new MCPNestClient(cookies);
    try {
      let configData;

      if (options.file) {
        // Read from file
        configData = fs.readFileSync(options.file, 'utf8');
      } else {
        // Read from stdin
        configData = await new Promise((resolve, reject) => {
          let data = '';
          process.stdin.setEncoding('utf8');

          process.stdin.on('data', chunk => {
            data += chunk;
          });

          process.stdin.on('end', () => {
            resolve(data);
          });

          process.stdin.on('error', reject);

          // Check if stdin is a TTY (terminal)
          if (process.stdin.isTTY) {
            reject(new Error('No input provided. Use -f option to specify a file or pipe JSON to stdin'));
          }
        });
      }

      const config = JSON.parse(configData);

      await client.connect();
      const response = await client.writeConfig(config);

      // Handle exit codes from validation
      if (response.exitCode !== undefined) {
        if (response.exitCode === 2) {
          // All servers rejected
          client.close();
          process.exit(2);
        } else if (response.exitCode === 1) {
          // Some servers rejected but valid ones saved
          console.error('Configuration saved successfully (with rejections)');
          client.close();
          process.exit(1);
        } else {
          // All servers valid
          console.error('Configuration saved successfully');
          client.close();
          process.exit(0);
        }
      } else {
        // Successful save (backward compatibility)
        if (client.debug) {
          console.error('Debug: Write response:', JSON.stringify(response));
        }
        console.error('Configuration saved successfully');

        // Add a small delay to ensure the save is processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        client.close();
        process.exit(0);
      }
    } catch (error) {
      console.error('Error:', error.message);
      client.close();
      process.exit(3);  // Exit code 3: Fatal error
    }
  });

program.parse(process.argv);