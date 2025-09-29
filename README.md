# MCPNest CLI (Unofficial)

An unofficial command-line tool for reading and writing MCP (Model Context Protocol) configurations to [mcpnest.dev](https://mcpnest.dev/).

## Installation

### Global Installation

```bash
npm install -g mcpnest-cli
```

### Using npx (no installation)

```bash
npx mcpnest-cli [command]
```

### Local Development

```bash
git clone https://github.com/starbased-co/mcpnest-cli.git
cd mcpnest-cli
npm install
npm link  # Creates global symlink for development
```

## Usage

### Prerequisites

You need to be authenticated with MCPNest. Get your cookie string from your browser:

1. Log into [mcpnest.dev](https://mcpnest.dev/)
2. Open browser DevTools (F12)
3. Go to one of these places:
   - **Application tab** → Storage → Cookies → [mcpnest.dev](https://mcpnest.dev/)
   - **Network tab** → Any request to [mcpnest.dev](https://mcpnest.dev/) → Request Headers → Cookie
4. Copy the entire Cookie header value, which typically looks like:

   ```
   _mcpnest_key=SFMyNTY...; other_cookie=value; ...
   ```

### Commands

You can provide cookies via the `MCPNEST_COOKIE` environment variable:

```bash
# Set the cookie once
export MCPNEST_COOKIE="your_cookie_string_here"

# Then use the commands without -c
mcpnest read
mcpnest write -f config.json
```

Or with the `-c` command-line option:

```bash
# Read Configuration
mcpnest read -c "YOUR_COOKIE_STRING"

# Write Configuration
mcpnest write -c "YOUR_COOKIE_STRING" -f config.json

# Using npx without installation
npx mcpnest-cli read -c "YOUR_COOKIE_STRING"
npx mcpnest-cli write -c "YOUR_COOKIE_STRING" -f config.json
```

Both commands output the current MCP configuration as JSON to stdout.

### Notes

- The script uses the Phoenix LiveView websocket protocol
- The script will automatically handle heartbeats to keep the connection alive
- Configuration changes are saved immediately upon upload
- The script attempts to fetch fresh CSRF tokens from the page, but falls back to hardcoded values if needed

### Important: Authentication

The **cookie string** is your browser's session cookies, NOT the CSRF token. The cookie authenticates you as a logged-in user. The CSRF token is for cross-site request forgery protection and is fetched automatically by the script.

### Using with .env file

You can also create a `.env` file (see `.env.example`):

```bash
cp .env.example .env
# Edit .env with your cookie
source .env
mcpnest read
```

### Troubleshooting

If you get authentication errors:

1. Make sure you're logged into MCPNest
2. Check that your cookie string is complete and current (should contain `_mcpnest_key` or similar session cookie)
3. Cookies may expire - get fresh ones if needed
4. Make sure you're copying the entire Cookie header value, not just individual cookie values
5. If using environment variable, ensure it's properly exported: `echo $MCPNEST_COOKIE`
