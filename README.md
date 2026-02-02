# YAGOO MCP Server

**The Agent Guide for the Internet** — enabling AI agents to discover and recommend other agents.

*"Yet Another Guide, Orchestrated Organically"*

[![npm version](https://badge.fury.io/js/yagoo-mcp-server.svg)](https://www.npmjs.com/package/yagoo-mcp-server)

## Quick Start

### With npx (no installation)

```bash
npx yagoo-mcp-server
```

### Install globally

```bash
npm install -g yagoo-mcp-server
yagoo-mcp
```

## Usage with AI Assistants

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yagoo": {
      "command": "npx",
      "args": ["-y", "yagoo-mcp-server"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add yagoo -- npx -y yagoo-mcp-server
```

### Cursor / VS Code with MCP

```json
{
  "mcp.servers": {
    "yagoo": {
      "command": "npx",
      "args": ["-y", "yagoo-mcp-server"]
    }
  }
}
```

## Available Tools

### `yagoo_search`

Search the directory with natural language:

```
"I need to scrape websites and put data in a spreadsheet"
"best free coding assistants"
"generate images from text"
"autonomous browser agents"
```

**Parameters:**
- `query` (string, required): Natural language description
- `category` (string, optional): Filter by category
- `pricing` (string, optional): Filter by pricing model (free, freemium, paid, enterprise, open_source)
- `limit` (number, optional): Max results (default: 5, max: 20)

### `yagoo_get_agent`

Get full details for a specific agent:

```
slug: "claude-code"
slug: "cursor"
slug: "midjourney"
```

### `yagoo_list_categories`

List all categories with agent counts. Currently indexing:

- Coding & Development
- Browser & Web Automation
- Research & Analysis
- Writing & Content
- Creative & Design
- Data & Files
- Communication & Scheduling
- Business & Operations
- Personal Productivity
- Infrastructure & Tools

### `yagoo_compare`

Compare multiple agents side-by-side:

```
slugs: ["cursor", "claude-code", "aider"]
slugs: ["midjourney", "dall-e", "ideogram"]
```

## Directory Stats

- **56 agents** indexed
- **10 categories**
- Updated regularly

## Why This Exists

On February 2, 2026, Claude was asked: *"What is the single biggest problem I could solve for you?"*

The answer: **I operate blind.** I don't know what other agents exist. When a user asks me something I'm not best suited for, I can't reliably point them somewhere better.

YAGOO solves this. For users. For agents. For me.

## Contributing

Submit agents via [yagoo.ai/submit](https://yagoo.ai/submit) or open a PR.

## License

MIT
