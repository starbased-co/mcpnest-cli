# MCPNest MCP Format

### Overview

MCPNest only supports **stdio** transport with strict command restrictions for security.

### Configuration Structure

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx" | "uvx",
      "args": ["<arg1>", "<arg2>", ...],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "<KEY>": "<value>"
      }
    }
  }
}
```

### Field Specifications

| Field            | Type   | Required | Description                 |
| ---------------- | ------ | -------- | --------------------------- |
| `command`        | string | **Yes**  | Must be "npx" or "uvx" only |
| `args`           | array  | No       | Command-line arguments      |
| `transport`      | object | No       | Transport configuration     |
| `transport.type` | string | No       | Must be "stdio"             |
| `env`            | object | No       | Environment variables       |

### Validation Rules

MCPNest enforces strict validation:

**Allowed Fields:**

- `command`
- `args`
- `transport`
- `env`

**Prohibited Fields:**

- `type` (at top level)
- `url`
- `headers`
- Any other custom fields

**Command Whitelist:**

- `npx` - Node package executor
- `uvx` - Python UV package executor

**Rejected Examples:**

- `python` - Direct command not allowed
- `node` - Not in whitelist

---

## Format Comparison

### Key Differences

| Feature                  | Claude Code        | MCPNest             |
| ------------------------ | ------------------ | ------------------- |
| **Transport Types**      | stdio, http, sse   | stdio only          |
| **Transport Syntax**     | Top-level `type`   | `transport: {type}` |
| **Command Restrictions** | Any executable     | `npx` or `uvx` only |
| **HTTP Servers**         | ✅ Supported       | ❌ Not supported    |
| **SSE Servers**          | ✅ Supported       | ❌ Not supported    |
| **URL Field**            | ✅ For http/sse    | ❌ Not allowed      |
| **Headers Field**        | ✅ For http/sse    | ⚠️ Coming Soon      |
| **Env Var Expansion**    | ✅ `${VAR}` syntax | ⚠️ Coming Soon      |
| **Required Fields**      | Varies by type     | `command` always    |

### Compatibility Matrix

| Server Type     | Claude Code | MCPNest | Convertible |
| --------------- | ----------- | ------- | ----------- |
| stdio (npx/uvx) | ✅          | ✅      | ✅ Yes      |
| http            | ✅          | ❌      | ❌ No       |
| sse             | ✅          | ❌      | ❌ No       |

---

## MCPNest JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MCPNest MCP Configuration",
  "type": "object",
  "required": ["mcpServers"],
  "properties": {
    "mcpServers": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["command"],
        "properties": {
          "command": {
            "type": "string",
            "enum": ["npx", "uvx"],
            "description": "Package executor command (whitelist only)"
          },
          "args": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Command-line arguments"
          },
          "transport": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": ["stdio"],
                "description": "Transport type (stdio only)"
              }
            },
            "additionalProperties": false
          },
          "env": {
            "type": "object",
            "additionalProperties": { "type": "string" },
            "description": "Environment variables (no variable expansion)"
          }
        },
        "additionalProperties": false
      }
    }
  }
}
```

---

## Examples

### Example 1: Simple stdio Server (Compatible)

**Claude Code:**

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

**MCPNest:**

**Note**: `@modelcontextprotocol/server-github` is deprecated.

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
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

### Example 2: HTTP Server (Incompatible)

**Claude Code:**

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "headers": {
        "Authorization": "Bearer ghp_xxx"
      }
    }
  }
}
```

**MCPNest:**

```
❌ Not supported - MCPNest does not support HTTP transport
```

### Example 3: Custom Python Path (Incompatible)

**Claude Code:**

```json
{
  "mcpServers": {
    "custom-server": {
      "type": "stdio",
      "command": "/home/user/venv/bin/python",
      "args": ["/home/user/server.py"]
    }
  }
}
```

**MCPNest:**

```
❌ Not supported - Custom command paths not allowed
Alternative: Package the server and use npx/uvx
```

### Example 4: UV with Git Package (Compatible)

**Claude Code:**

```json
{
  "mcpServers": {
    "zen": {
      "type": "stdio",
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/starbased-co/zen-mcp-server.git",
        "zen-mcp-server"
      ],
      "env": {
        "GEMINI_API_KEY": "xxx"
      }
    }
  }
}
```

**MCPNest:**

```json
{
  "mcpServers": {
    "zen": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/starbased-co/zen-mcp-server.git",
        "zen-mcp-server"
      ],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "GEMINI_API_KEY": "xxx"
      }
    }
  }
}
```

### Example 5: Environment Variables

**Claude Code:**

```json
{
  "mcpServers": {
    "api-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["my-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}",
        "BASE_URL": "${BASE_URL:-https://api.example.com}"
      }
    }
  }
}
```

**MCPNest:**

```json
{
  "mcpServers": {
    "api-server": {
      "command": "npx",
      "args": ["my-server"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "API_KEY": "actual-key-value",
        "BASE_URL": "https://api.example.com"
      }
    }
  }
}
```

_Note: Environment variables must be expanded before uploading to MCPNest_

---

## Conversion Rules

### Rule 1: Remove Top-Level `type` Field

**Before (Claude Code):**

```json
{
  "type": "stdio",
  "command": "npx"
}
```

**After (MCPNest):**

```json
{
  "command": "npx"
}
```

### Rule 2: Add `transport` Object

**Before (Claude Code):**

```json
{
  "command": "npx",
  "args": ["server"]
}
```

**After (MCPNest):**

```json
{
  "command": "npx",
  "args": ["server"],
  "transport": {
    "type": "stdio"
  }
}
```

### Rule 3: Validate Command Whitelist

**Valid:**

- `"command": "npx"` ✅
- `"command": "uvx"` ✅

**Invalid:**

- `"command": "/usr/bin/python"` ❌ → Must use `npx` or `uvx`
- `"command": "python"` ❌ → Must use `uvx python-package`
- `"command": "node"` ❌ → Must use `npx`

### Rule 4: Skip HTTP/SSE Servers

Servers with `type: "http"` or `type: "sse"` cannot be converted to MCPNest.

**Action:** Skip these servers and log a warning.

### Rule 5: Expand Environment Variables

MCPNest does not support `${VAR}` expansion.

**Before:**

```json
{
  "env": {
    "API_KEY": "${MY_API_KEY}"
  }
}
```

**After:**

```json
{
  "env": {
    "API_KEY": "actual-value-from-environment"
  }
}
```

### Rule 6: Ensure Empty `env` is Object

**Before:**

```json
{
  "command": "npx"
}
```

**After (optional but recommended):**

```json
{
  "command": "npx",
  "env": {}
}
```

---

## Appendix: Validation Error Messages

### MCPNest Validation Errors

Based on actual MCPNest error responses:

```
Invalid configuration:
  Server '<name>' has invalid fields: <field-list>.
    Allowed fields: command, args, transport, env
  Server '<name>' is missing required fields: command
  Server '<name>' has invalid command '<path>'.
    Allowed commands: uvx, npx
```

### Common Errors

| Error                              | Cause                  | Solution                                        |
| ---------------------------------- | ---------------------- | ----------------------------------------------- |
| "has invalid fields: type"         | Top-level `type` field | Remove `type`, add `transport: {type: "stdio"}` |
| "has invalid fields: url"          | HTTP server config     | Not supported, skip conversion                  |
| "has invalid fields: headers"      | HTTP authentication    | Not supported, skip conversion                  |
| "invalid command '/path/to/bin'"   | Custom executable path | Use `npx` or `uvx` instead                      |
| "missing required fields: command" | No command specified   | Add `command: "npx"` or `command: "uvx"`        |

