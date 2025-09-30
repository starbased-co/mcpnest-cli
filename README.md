# `mcpnest`

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

To get started, you need to get your cookie string from your browser:

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
cat config.json | mcpnest write
mcpnest read | mcpnest write  # Copy current config
```

Or with the `-c` command-line option:

```bash
# Read Configuration
mcpnest read -c "YOUR_COOKIE_STRING"

# Write Configuration from file
mcpnest write -c "YOUR_COOKIE_STRING" -f config.json

# Write Configuration from stdin
mcpnest read -c "YOUR_COOKIE_STRING" | mcpnest write -c "YOUR_COOKIE_STRING"
echo '{"mcpServers": {}}' | mcpnest write -c "YOUR_COOKIE_STRING"

# Using npx without installation
npx mcpnest-cli read -c "YOUR_COOKIE_STRING"
npx mcpnest-cli write -c "YOUR_COOKIE_STRING" -f config.json
npx mcpnest-cli read | npx mcpnest-cli write
```

Both commands output the current MCP configuration as JSON to stdout.

### Troubleshooting

If you get authentication errors:

1. Make sure you're logged into MCPNest
2. Check that your cookie string is complete and current (should contain `_mcpnest_key` or similar session cookie)
3. Cookies may expire - get fresh ones if needed
4. Make sure you're copying the entire Cookie header value, not just individual cookie values
5. If using environment variable, ensure it's properly exported: `echo $MCPNEST_COOKIE`
