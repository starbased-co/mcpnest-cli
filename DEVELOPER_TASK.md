# Developer Task: MCPNest Configuration Validator & Converter

## Objective

Implement a configuration validation and conversion step in the `write` command that:

1. Validates each server configuration against MCPNest requirements
2. Automatically converts incompatible Claude Code format to MCPNest format, first by applying rule-based changes according to the MCP Nest specification documents, and if there are still incompatiblities, use the claude code comman, first by applying rule-based changes according to the MCP Nest specification documents, followed by a final pass of using `claude --output-format json -p "<prompt with specification and supplied json to be fixed>`
3. Filters out incompatible servers with clear warnings
4. Returns non-zero exit code if any servers were rejected
5. Shows a summary of conversion results

## Background

MCPNest enforces strict validation rules that differ from Claude Code's MCP format:

- **Only stdio transport** (no HTTP/SSE)
- **Command whitelist**: Only `npx` and `uvx` allowed
- **Different syntax**: Uses `transport: {type: "stdio"}` instead of top-level `type`
- **No environment variable expansion**: Must use literal values

See @MCP_FORMAT_SPECIFICATION.md for complete details.

## Implementation Location

**File:** `index.js`
**Method:** `MCPNestClient.writeConfig(config)`
**Location:** Before sending to WebSocket (lines 352-410)

## Requirements

### 1. Add Validation Function

Create a new method `formatConfig(config)` that:

- Takes raw MCP configuration object
- Returns object with:
  - `valid`: Array of converted, valid server configs
  - `invalid`: Array of rejected servers with reasons
  - `warnings`: Array of warning messages

### 2. Conversion Rules

Implement these transformations for each server:

#### Rule 1: Transport Syntax Conversion

```javascript
// Input (Claude Code)
{
  "type": "stdio",
  "command": "npx"
}

// Output (MCPNest)
{
  "command": "npx",
  "transport": {
    "type": "stdio"
  }
}
```

#### Rule 2: Command Whitelist Validation

```javascript
// Valid commands
const ALLOWED_COMMANDS = ["npx", "uvx"];

// Reject if:
// - Custom paths: "/usr/bin/python", "./script.sh"
// - Other commands: "python", "node", "deno"
```

#### Rule 3: Filter Transport Types

```javascript
// Reject servers with:
// - type: "http"
// - type: "sse"
// - url field present
// - headers field present
```

#### Rule 4: Environment Variable Expansion

```javascript
// Convert ${VAR} and ${VAR:-default} to actual values
// Use process.env to resolve variables
// Warn if variable is undefined and no default provided
```

#### Rule 5: Remove Invalid Fields

```javascript
// Only keep allowed fields:
const ALLOWED_FIELDS = ["command", "args", "transport", "env"];

// Remove any other fields from server config
```

### 3. Error Messages

Provide clear, actionable error messages, included in the `claude -p` command for AI formatting:

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

### 4. Exit Codes

Return appropriate exit codes:

- `0`: All servers valid, configuration saved successfully
- `1`: Some servers rejected but valid ones saved successfully
- `2`: All servers rejected, nothing saved
- `3`: Fatal error (authentication, connection, etc.)

## Testing

### Test Cases

Create test files in project root:

#### `test-valid.json` - All servers valid

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

Expected: Exit code 0, all servers uploaded

#### `test-mixed.json` - Some valid, some invalid

```json
{
  "mcpServers": {
    "valid-npx": {
      "command": "npx",
      "args": ["server"]
    },
    "invalid-http": {
      "type": "http",
      "url": "https://example.com"
    },
    "invalid-path": {
      "command": "/usr/bin/python",
      "args": ["server.py"]
    }
  }
}
```

Expected: Exit code 1, only valid-npx uploaded, warnings shown

#### `test-invalid.json` - All servers invalid

```json
{
  "mcpServers": {
    "http-only": {
      "type": "http",
      "url": "https://example.com"
    }
  }
}
```

Expected: Exit code 2, nothing uploaded, error shown

#### `test-envvars.json` - Environment variable expansion

```json
{
  "mcpServers": {
    "with-vars": {
      "command": "npx",
      "args": ["server"],
      "env": {
        "API_KEY": "${TEST_API_KEY}",
        "DEFAULT": "${MISSING_VAR:-default-value}"
      }
    }
  }
}
```

Expected: Exit code 0, variables expanded correctly

### Manual Testing Commands

```bash
# Test with valid config
node index.js write -f test-valid.json
echo "Exit code: $?"

# Test with mixed config
node index.js write -f test-mixed.json
echo "Exit code: $?"

# Test with invalid config
node index.js write -f test-invalid.json
echo "Exit code: $?"

# Test with environment variables
export TEST_API_KEY="test-key-123"
node index.js write -f test-envvars.json
echo "Exit code: $?"

# Test with stdin
cat test-valid.json | node index.js write
echo "Exit code: $?"
```

## Success Criteria

- [ ] All conversion rules implemented correctly
- [ ] Clear validation error messages with suggestions
- [ ] Appropriate exit codes returned
- [ ] Environment variable expansion works
- [ ] HTTP/SSE servers filtered out with warnings
- [ ] Custom command paths rejected with helpful messages
- [ ] Debug mode shows conversion details when DEBUG=1
- [ ] All test cases pass
- [ ] Documentation updated (README.md)

## Documentation Updates

Update `README.md` with:

1. **Automatic Conversion** section explaining the feature
2. **Exit Codes** section listing all exit codes
3. **Validation Rules** section describing what gets filtered
4. **Examples** showing conversion in action

## Questions?

Refer to:

- `MCP_FORMAT_SPECIFICATION.md` - Complete format specification
- `schema-mcpnest.json` - MCPNest validation schema
- `conversion-examples.json` - Real-world conversion examples

## Estimated Time

- Implementation: 2-3 hours
- Testing: 1 hour
- Documentation: 30 minutes
- **Total: 3.5-4.5 hours**

