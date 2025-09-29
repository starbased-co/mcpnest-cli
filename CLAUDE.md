# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MCPNest CLI is a Node.js command-line tool for managing MCP (Model Context Protocol) server configurations on [mcpnest.dev](https://mcpnest.dev/) via WebSocket connections using the Phoenix LiveView protocol.

## Essential Commands

```bash
# Install dependencies
npm install

# Read current configuration from MCPNest
node index.js read

# Write configuration to MCPNest
node index.js write -f config.json

# With explicit cookie authentication
node index.js read -c "YOUR_COOKIE_STRING"
node index.js write -c "YOUR_COOKIE_STRING" -f config.json

# Debug mode (shows WebSocket communication)
DEBUG=1 node index.js read
```

## Authentication Setup

Authentication requires browser session cookies from [mcpnest.dev](https://mcpnest.dev/):

1. Set via environment variable (preferred):

   ```bash
   export MCPNEST_COOKIE="_mcpnest_key=SFMyNTY..."
   ```

2. Or use `.env` file:

   ```bash
   cp .env.example .env
   # Edit .env with cookie value
   source .env
   ```

## Architecture

### Core Component: MCPNestClient

The `MCPNestClient` class (`index.js`) manages the entire WebSocket lifecycle:

- **Token Management**: Fetches CSRF tokens and Phoenix session tokens from the `/config` page
- **WebSocket Connection**: Establishes secure WebSocket connection to `wss://mcpnest.dev/live/websocket`
- **Phoenix Protocol**: Implements Phoenix Channels protocol with heartbeat mechanism
- **LiveView Join**: Joins the LiveView channel using Phoenix topic format `lv:phx-{id}`
- **Config Extraction**: Parses configuration from LiveView render tree structure
- **Event Handling**: Sends form events for configuration updates

### Protocol Details

The client communicates using Phoenix message format:

```javascript
[joinRef, msgRef, topic, event, payload];
```

Key events:

- `phx_join`: Join LiveView channel
- `heartbeat`: Keep connection alive (30-second intervals)
- `event`: Submit form data for config updates

### Configuration Format

MCP server configurations follow this structure:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "transport": { "type": "stdio" },
      "env": { "ENV_VAR": "value" }
    }
  }
}
```

## Development Notes

- The WebSocket connection requires valid CSRF tokens and session data fetched from the page
- Configuration is extracted from the LiveView render tree at path `renderTree["8"]["3"]` or `renderTree["1"]["3"]["0"]`
- URL encoding is applied to configuration JSON when submitting form events
- The client automatically handles Phoenix heartbeats to maintain connection
- All WebSocket operations have 10-second timeouts to prevent hanging

