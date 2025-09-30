#!/usr/bin/env node

const WebSocket = require('ws');
const fs = require('fs');
const { program } = require('commander');
const { version } = require('./package.json');

// Phoenix/LiveView protocol constants
const PHOENIX_CHANNEL = "phoenix";
const LIVEVIEW_TOPIC_PREFIX = "lv:";

class MCPNestClient {
  constructor(cookies) {
    this.cookies = cookies;
    this.ws = null;
    this.msgRef = 0;
    this.joinRef = null;  // Will be generated when needed
    this.phxId = null;
    this.heartbeatInterval = null;
    this.csrfToken = null;
    this.session = null;
    this.static = null;
  }

  async fetchPageTokens() {
    // First fetch the config page to get fresh tokens
    const https = require('https');
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'mcpnest.dev',
        path: '/config',
        method: 'GET',
        headers: {
          'Cookie': this.cookies,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      };

      https.get(options, (res) => {
        let data = '';

        // Check status
        if (process.env.DEBUG) {
          console.error('Page status:', res.statusCode);
        }
        if (res.statusCode === 302 || res.statusCode === 301) {
          console.error('Redirect detected - authentication may have expired');
        }

        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          // Debug - show what we got
          if (process.env.DEBUG) {
            console.error('Page length:', data.length);
            console.error('First 500 chars:', data.substring(0, 500));
          }

          // Extract CSRF token from meta tag
          const csrfMatch = data.match(/name="csrf-token"\s+content="([^"]+)"/);
          if (csrfMatch) {
            this.csrfToken = csrfMatch[1];
            if (process.env.DEBUG) {
              console.error('Found CSRF token');
            }
          }

          // Look for Phoenix LiveView data
          const phxMainMatch = data.match(/data-phx-main="([^"]+)"/);
          const phxSessionMatch = data.match(/data-phx-session="([^"]+)"/);
          const phxStaticMatch = data.match(/data-phx-static="([^"]+)"/);

          if (phxSessionMatch) {
            this.session = phxSessionMatch[1];
            if (process.env.DEBUG) {
              console.error('Found session token');
            }
          }

          if (phxStaticMatch) {
            this.static = phxStaticMatch[1];
            if (process.env.DEBUG) {
              console.error('Found static token');
            }
          }

          // Try to find the PHX ID
          const phxIdMatch = data.match(/id="([^"]*phx-[^"]+)"/);
          if (phxIdMatch) {
            this.phxId = phxIdMatch[1];
            if (process.env.DEBUG) {
              console.error('Found PHX ID:', this.phxId);
            }
          }

          if (!this.csrfToken && process.env.DEBUG) {
            console.error('Warning: No CSRF token found');
          }

          resolve();
        });
      }).on('error', reject);
    });
  }

  async connect() {
    // Fetch fresh tokens if we don't have them
    if (!this.csrfToken) {
      if (process.env.DEBUG) {
        console.error('Fetching fresh tokens from MCPNest...');
      }
      await this.fetchPageTokens();
      if (!this.csrfToken) {
        throw new Error('Failed to fetch CSRF token from page. Make sure you are logged in and cookies are valid.');
      }
    }

    const params = new URLSearchParams({
      '_csrf_token': this.csrfToken,
      '_mounts': '0',
      '_mount_attempts': '0',
      '_live_referer': 'undefined',
      'vsn': '2.0.0'
    });

    // Note: _track_static params omitted as they contain version-specific hashes
    // that would break when the site updates. These are optional for the protocol.

    const url = `wss://mcpnest.dev/live/websocket?${params.toString()}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Extensions': 'permessage-deflate',
          'Sec-GPC': '1',
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'Cookie': this.cookies,
          'Origin': 'https://mcpnest.dev'
        }
      });

      this.ws.on('open', () => {
        if (process.env.DEBUG) {
          console.error('Connected to MCPNest websocket');
        }
        this.startHeartbeat();
        resolve();
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        reject(err);
      });

      this.ws.on('close', () => {
        if (process.env.DEBUG) {
          console.error('WebSocket closed');
        }
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
        }
      });
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage([null, String(this.msgRef++), PHOENIX_CHANNEL, "heartbeat", {}]);
    }, 30000);
  }

  sendMessage(msg) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async joinLiveView() {
    return new Promise((resolve, reject) => {
      // Require PHX ID from page - no fallback
      if (!this.phxId) {
        reject(new Error('Failed to extract PHX ID from page'));
        return;
      }
      const topic = `${LIVEVIEW_TOPIC_PREFIX}${this.phxId}`;
      if (process.env.DEBUG) {
        console.error('Joining topic:', topic);
      }

      // Generate join reference for this join operation
      this.joinRef = String(this.msgRef++);

      const joinMsg = [
        this.joinRef,
        String(this.msgRef++),
        topic,
        "phx_join",
        {
          "url": "https://mcpnest.dev/config",
          "params": {
            "_csrf_token": this.csrfToken,  // Required - will throw error if missing
            "_mounts": 0,
            "_mount_attempts": 0
          },
          "session": this.session || "",
          "static": this.static || "",
          "sticky": false
        }
      ];

      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (process.env.DEBUG) {
          console.error('Received message:', msg[3], msg[4]?.status || 'no status');
        }

        if (msg[2] === topic && msg[3] === "phx_reply") {
          if (msg[4].status === "ok") {
            this.ws.removeListener('message', handler);
            resolve(msg[4].response);
          } else if (msg[4].status === "error") {
            this.ws.removeListener('message', handler);
            console.error('Join error:', msg[4]);
            reject(new Error('Join failed: ' + JSON.stringify(msg[4])));
          }
        }
      };

      this.ws.on('message', handler);
      this.sendMessage(joinMsg);

      setTimeout(() => {
        this.ws.removeListener('message', handler);
        if (process.env.DEBUG) {
          console.error('Join timeout - no response received for topic:', topic);
        }
        reject(new Error('Join timeout'));
      }, 10000);
    });
  }

  extractConfigFromRender(response) {
    // The config is embedded in the rendered HTML
    // Look for the textarea content
    if (response.rendered && response.rendered["0"]) {
      const renderTree = response.rendered["0"];

      // Debug - explore the tree
      if (process.env.DEBUG) {
        console.error('RenderTree keys:', Object.keys(renderTree));
        for (let key of Object.keys(renderTree)) {
          if (typeof renderTree[key] === 'object') {
            console.error(`Key ${key}:`, Object.keys(renderTree[key] || {}));
            // Look deeper in some keys
            if (renderTree[key] && renderTree[key]["3"]) {
              console.error(`Key ${key}["3"]:`, renderTree[key]["3"]);
            }
          }
        }
      }

      // Try different paths to find the config
      // Check renderTree["8"]["3"] (current location)
      if (renderTree["8"] && renderTree["8"]["3"]) {
        const configJson = renderTree["8"]["3"];
        if (typeof configJson === 'string' && configJson.includes('{')) {
          // Clean up HTML entities
          return configJson
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
        }
      }

      // Fallback: check renderTree["1"]["3"]["0"] (original path)
      if (renderTree["1"] && renderTree["1"]["3"]) {
        const configJson = renderTree["1"]["3"]["0"];
        if (typeof configJson === 'string' && configJson.includes('{')) {
          // Clean up HTML entities
          return configJson
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
        }
      }

      // Try to find it elsewhere in the tree
      function findConfig(obj, depth = 0) {
        if (depth > 10) return null;
        if (typeof obj === 'string' && obj.includes('mcpServers')) {
          return obj;
        }
        if (typeof obj === 'object' && obj !== null) {
          for (let key in obj) {
            const result = findConfig(obj[key], depth + 1);
            if (result) return result;
          }
        }
        return null;
      }

      const found = findConfig(renderTree);
      if (found) {
        return found
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
      }
    }
    return null;
  }

  async readConfig() {
    const response = await this.joinLiveView();

    // Debug - show the response structure
    if (process.env.DEBUG) {
      console.error('Response keys:', Object.keys(response));
      console.error('Response:', JSON.stringify(response, null, 2).substring(0, 1000));
    }

    const config = this.extractConfigFromRender(response);
    if (config) {
      const parsedConfig = JSON.parse(config);
      // Output the JSON immediately and exit
      process.stdout.write(JSON.stringify(parsedConfig, null, 2) + '\n');
      if (process.env.DEBUG) process.stderr.write('About to exit process...\n');
      // Forcefully terminate all operations
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.terminate();
      }
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      process.exit(0);
    }
    throw new Error('Could not extract configuration from response');
  }

  async writeConfig(config) {
    // First join the LiveView
    await this.joinLiveView();

    return new Promise((resolve, reject) => {
      const topic = `${LIVEVIEW_TOPIC_PREFIX}${this.phxId}`;

      // URL encode the JSON config
      const encodedConfig = encodeURIComponent(JSON.stringify(config, null, 2))
        .replace(/%20/g, '+');

      const saveMsg = [
        this.joinRef,
        String(this.msgRef++),
        topic,
        "event",
        {
          "type": "form",
          "event": "save_config",
          "value": `config_json=${encodedConfig}`,
          "meta": {}
        }
      ];

      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg[2] === topic && msg[3] === "phx_reply") {
          this.ws.removeListener('message', handler);
          if (msg[4].status === "ok") {
            resolve(msg[4].response);
          } else {
            reject(new Error('Save failed: ' + JSON.stringify(msg[4])));
          }
        }
      };

      this.ws.on('message', handler);
      this.sendMessage(saveMsg);

      setTimeout(() => {
        this.ws.removeListener('message', handler);
        reject(new Error('Save timeout'));
      }, 10000);
    });
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }
}

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
      process.exit(1);
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
      await client.writeConfig(config);
      console.error('Configuration saved successfully');
      client.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      client.close();
      process.exit(1);
    }
  });

program.parse(process.argv);