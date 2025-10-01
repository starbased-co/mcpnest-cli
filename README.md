# `mcpnest`

An unofficial command-line tool for reading and writing MCP (Model Context Protocol) configurations to [mcpnest.dev](https://mcpnest.dev/).

## Features

- 📖 Read MCP configurations from MCPNest
- 📝 Write MCP configurations to MCPNest
- 🔄 **Automatic format conversion** from Claude Code to MCPNest format
- ✅ **Validation** of server configurations against MCPNest requirements
- 🔐 Environment variable expansion for sensitive values
- 🎯 Smart exit codes for CI/CD integration

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

## Automatic Conversion

The `write` command automatically validates and converts Claude Code MCP configurations to MCPNest-compatible format.

### What Gets Converted

1. **Transport Syntax**: Converts top-level `type` field to `transport: {type: "stdio"}`
2. **Environment Variables**: Expands `${VAR}` and `${VAR:-default}` to actual values
3. **Field Cleanup**: Removes invalid fields while preserving valid ones

### Example Conversion

**Input (Claude Code format):**
```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "API_KEY": "${GITHUB_TOKEN:-ghp_default}"
      }
    }
  }
}
```

**Output (MCPNest format):**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "API_KEY": "ghp_actual_value"
      }
    }
  }
}
```

## Validation Rules

MCPNest has strict requirements for security. The CLI validates each server configuration:

### ✅ Allowed

- **Commands**: Only `npx` and `uvx`
- **Transport**: Only `stdio` (no HTTP/SSE)
- **Fields**: `command`, `args`, `transport`, `env`

### ❌ Rejected

- **Custom paths**: `/usr/bin/python`, `./script.sh`
- **Direct commands**: `python`, `node`, `deno`
- **HTTP/SSE servers**: Servers with `url` or `headers` fields
- **Invalid fields**: Any fields not in the allowed list

### Validation Output Example

```
⚠ Validation Results:
  ✓ 3 servers validated successfully
  ✗ 2 servers rejected:

    • "github-http": HTTP transport not supported by MCPNest
      Suggestion: Use stdio-based alternative or deploy server separately

    • "custom-python": Command '/home/user/venv/bin/python' not allowed
      Suggestion: Package as PyPI package and use 'uvx' command

  Proceeding with 3 valid servers...
```

## Exit Codes

The CLI uses specific exit codes for different scenarios, useful for CI/CD:

| Code | Meaning | Description |
|------|---------|-------------|
| 0 | Success | All servers valid and saved |
| 1 | Partial Success | Some servers rejected but valid ones saved |
| 2 | Validation Failure | All servers rejected, nothing saved |
| 3 | Fatal Error | Authentication failure or connection error |

### Using Exit Codes in Scripts

```bash
#!/bin/bash

# Try to write config
mcpnest write -f config.json

case $? in
  0) echo "✅ All servers uploaded successfully" ;;
  1) echo "⚠️ Some servers were rejected but valid ones saved" ;;
  2) echo "❌ All servers rejected - check your configuration" ;;
  3) echo "🔥 Fatal error - check authentication/connection" ;;
esac
```

## Examples

### Validate Without Uploading

To test validation without actually uploading (dry run):

```bash
# Use the test validation script
node test-validation.js

# Or use DEBUG mode to see what would be sent
DEBUG=1 mcpnest write -f config.json
```

### Environment Variable Expansion

```bash
# Set environment variables
export GITHUB_TOKEN="ghp_abc123"
export OPENAI_KEY="sk-xyz789"

# Config with variables
cat > config.json << 'EOF'
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}",
        "DEFAULT_BRANCH": "${DEFAULT_BRANCH:-main}"
      }
    }
  }
}
EOF

# Variables are automatically expanded during write
mcpnest write -f config.json
```

### Batch Processing

```bash
# Process multiple configs
for config in configs/*.json; do
  echo "Processing $config..."
  if mcpnest write -f "$config"; then
    echo "✓ $config uploaded"
  else
    echo "✗ $config failed with exit code $?"
  fi
done
```
