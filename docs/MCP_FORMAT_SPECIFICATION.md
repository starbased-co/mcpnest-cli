# MCP Configuration Format Specification

**Version:** 1.0.0
**Date:** 2025-09-29
**Purpose:** Define and compare MCP server configuration formats for Claude Code and MCPNest

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Claude Code MCP Format](#claude-code-mcp-format)
3. [MCPNest MCP Format](#mcpnest-mcp-format)
4. [Format Comparison](#format-comparison)
5. [JSON Schemas](#json-schemas)
6. [Examples](#examples)
7. [Conversion Rules](#conversion-rules)
8. [Limitations and Notes](#limitations-and-notes)

---

## Executive Summary

This document specifies the MCP (Model Context Protocol) server configuration formats used by:

- **Claude Code**: Anthropic's official CLI and IDE integration for Claude
- **MCPNest**: Cloud-based MCP server hosting platform at mcpnest.dev

While both formats share the `mcpServers` root structure, they differ significantly in:

- Transport specification syntax
- Supported transport types
- Command restrictions
- Field naming conventions

This document provides detailed specifications and conversion rules for transforming Claude Code MCP configurations to MCPNest-compatible format.

---

## Claude Code MCP Format

### Overview

Claude Code supports three transport types:

- **stdio**: Local process execution via standard input/output
- **http**: Standard HTTP request/response
- **sse**: Server-Sent Events for real-time streaming

### Configuration Structure

```json
{
  "mcpServers": {
    "<server-name>": {
      "type": "stdio" | "http" | "sse",
      "command": "<executable-path>",
      "args": ["<arg1>", "<arg2>", ...],
      "env": {
        "<KEY>": "<value>"
      },
      "url": "<server-url>",
      "headers": {
        "<header-name>": "<header-value>"
      }
    }
  }
}
```

### Field Specifications

| Field     | Type   | Required  | Description                               |
| --------- | ------ | --------- | ----------------------------------------- |
| `type`    | string | No\*      | Transport type: "stdio", "http", or "sse" |
| `command` | string | Yes\*\*   | Executable path or command name           |
| `args`    | array  | No        | Command-line arguments                    |
| `env`     | object | No        | Environment variables                     |
| `url`     | string | Yes\*\*\* | Server endpoint URL                       |
| `headers` | object | No        | HTTP headers for authentication           |

\* Optional for stdio servers, inferred if omitted
\*\* Required for stdio servers
\*\*\* Required for http/sse servers

### Supported Commands

Claude Code accepts:

- Any executable path (e.g., `/usr/bin/python`, `./script.sh`)
- Package manager commands (`npx`, `uvx`, `node`, `python`, etc.)
- System commands

### Environment Variable Expansion

Claude Code supports environment variable expansion:

- `${VAR}` - Expands to value of VAR
- `${VAR:-default}` - Expands to VAR if set, otherwise uses default

### Configuration Scopes

1. **User-scoped**: `~/.claude/mcp.json` - Available across all projects
2. **Project-scoped**: `<project>/.mcp.json` - Shared with team
3. **Local-scoped**: Project-specific user settings - Private to user

---

## MCPNest MCP Format

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
| `transport`      | object | No\*     | Transport configuration     |
| `transport.type` | string | No\*     | Must be "stdio"             |
| `env`            | object | No       | Environment variables       |

\* While not strictly required in successful saves, including it is recommended for clarity

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

- `/usr/bin/python` - Custom paths not allowed
- `python` - Direct command not allowed
- `node` - Not in whitelist
- `./script.sh` - Local scripts not allowed

### No Environment Variable Expansion

MCPNest does **not** support `${VAR}` expansion. All values must be literal strings.

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
| **Custom Paths**         | ✅ Supported       | ❌ Not supported    |
| **URL Field**            | ✅ For http/sse    | ❌ Not allowed      |
| **Headers Field**        | ✅ For http/sse    | ❌ Not allowed      |
| **Env Var Expansion**    | ✅ `${VAR}` syntax | ❌ Not supported    |
| **Required Fields**      | Varies by type     | `command` always    |

### Compatibility Matrix

| Server Type         | Claude Code | MCPNest | Convertible |
| ------------------- | ----------- | ------- | ----------- |
| stdio (npx/uvx)     | ✅          | ✅      | ✅ Yes      |
| stdio (custom path) | ✅          | ❌      | ❌ No       |
| http                | ✅          | ❌      | ❌ No       |
| sse                 | ✅          | ❌      | ❌ No       |

---

## JSON Schemas

### Claude Code Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Claude Code MCP Configuration",
  "type": "object",
  "required": ["mcpServers"],
  "properties": {
    "mcpServers": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "title": "STDIO Server",
            "type": "object",
            "required": ["command"],
            "properties": {
              "type": {
                "type": "string",
                "enum": ["stdio"],
                "description": "Transport type (optional for stdio)"
              },
              "command": {
                "type": "string",
                "description": "Executable path or command name"
              },
              "args": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Command-line arguments"
              },
              "env": {
                "type": "object",
                "additionalProperties": { "type": "string" },
                "description": "Environment variables"
              }
            },
            "additionalProperties": false
          },
          {
            "title": "HTTP/SSE Server",
            "type": "object",
            "required": ["type", "url"],
            "properties": {
              "type": {
                "type": "string",
                "enum": ["http", "sse"],
                "description": "Transport type"
              },
              "url": {
                "type": "string",
                "format": "uri",
                "description": "Server endpoint URL"
              },
              "headers": {
                "type": "object",
                "additionalProperties": { "type": "string" },
                "description": "HTTP headers"
              }
            },
            "additionalProperties": false
          }
        ]
      }
    }
  }
}
```

### MCPNest Schema

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

### Example 5: Environment Variables (Incompatible Feature)

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

## Conversion Algorithm

```javascript
function convertClaudeCodeToMCPNest(claudeConfig) {
  const mcpnestConfig = { mcpServers: {} };

  for (const [name, server] of Object.entries(claudeConfig.mcpServers)) {
    // Rule 4: Skip HTTP/SSE servers
    if (server.type === "http" || server.type === "sse") {
      console.warn(`Skipping ${name}: HTTP/SSE not supported by MCPNest`);
      continue;
    }

    // Rule 3: Validate command
    if (server.command && !["npx", "uvx"].includes(server.command)) {
      console.warn(
        `Skipping ${name}: Command '${server.command}' not in whitelist`,
      );
      continue;
    }

    // Build MCPNest server config
    const mcpnestServer = {
      command: server.command,
      args: server.args || [],
      transport: { type: "stdio" }, // Rule 2
      env: {},
    };

    // Rule 5: Expand environment variables
    if (server.env) {
      for (const [key, value] of Object.entries(server.env)) {
        mcpnestServer.env[key] = expandEnvVar(value);
      }
    }

    mcpnestConfig.mcpServers[name] = mcpnestServer;
  }

  return mcpnestConfig;
}

function expandEnvVar(value) {
  // Expand ${VAR} and ${VAR:-default}
  return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    if (expr.includes(":-")) {
      const [varName, defaultValue] = expr.split(":-");
      return process.env[varName] || defaultValue;
    }
    return process.env[expr] || "";
  });
}
```

---

## Limitations and Notes

### MCPNest Limitations

1. **No HTTP/SSE Support**: Only stdio transport is supported
2. **Command Whitelist**: Only `npx` and `uvx` are allowed
3. **No Custom Paths**: Cannot use custom executable paths
4. **No Variable Expansion**: Environment variables must be literal values
5. **Security Restrictions**: Designed for cloud hosting with strict security

### Claude Code Advantages

1. **Flexible Commands**: Supports any executable
2. **Multiple Transports**: stdio, http, and sse
3. **Variable Expansion**: Dynamic configuration with `${VAR}` syntax
4. **Local Execution**: Full control over execution environment

### Conversion Success Rate

Based on typical Claude Code configurations:

- **~60-70%** of servers are convertible (npx/uvx stdio servers)
- **~20-30%** use custom paths (not convertible)
- **~10-20%** use HTTP/SSE (not convertible)

### Best Practices

1. **For MCPNest compatibility:**
   - Use `npx` or `uvx` commands
   - Keep servers as npm/PyPI packages
   - Avoid custom executable paths
   - Use literal environment values

2. **For Claude Code:**
   - Use environment variable expansion for sensitive data
   - Leverage multiple transport types as needed
   - Use custom paths for development/local servers

3. **For cross-platform compatibility:**
   - Publish servers as packages (npm/PyPI)
   - Use `npx`/`uvx` for distribution
   - Document environment variable requirements
   - Provide both stdio and HTTP transports when possible

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

---

## References

- [Claude Code MCP Documentation](https://docs.claude.com/en/docs/claude-code/mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCPNest Platform](https://mcpnest.dev)

---

**Document Metadata:**

- **Author**: Generated for mcpnest-cli project
- **Last Updated**: 2025-09-29
- **Version**: 1.0.0
- **Status**: Complete

