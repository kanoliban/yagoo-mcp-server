#!/usr/bin/env node
/**
 * YAGOO MCP Server
 *
 * The Agent Guide for the Internet — enabling AI agents to discover
 * and recommend other agents for any task.
 *
 * "Yet Another Guide, Orchestrated Organically"
 *
 * 56 agents indexed across 10 categories.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AGENTS, CATEGORY_LABELS, Agent } from "./data.js";

// ============================================================================
// SCORING ALGORITHM
// ============================================================================

function scoreAgent(agent: Agent, query: string): number {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  let score = 0;

  // Name/tagline matching (high weight)
  if (agent.name.toLowerCase().includes(q)) score += 50;
  if (agent.tagline.toLowerCase().includes(q)) score += 30;

  // Tag matching (high weight)
  for (const tag of agent.tags) {
    if (q.includes(tag) || tag.includes(q)) score += 20;
    for (const word of words) {
      if (tag.includes(word)) score += 10;
    }
  }

  // Capability matching (medium weight)
  for (const cap of agent.capabilities) {
    const capLower = cap.toLowerCase();
    if (capLower.includes(q)) score += 15;
    for (const word of words) {
      if (capLower.includes(word)) score += 5;
    }
  }

  // Best-for matching (high weight - intent matching)
  for (const bf of agent.best_for) {
    const bfLower = bf.toLowerCase();
    if (bfLower.includes(q)) score += 25;
    for (const word of words) {
      if (bfLower.includes(word)) score += 8;
    }
  }

  // Negative signals
  for (const nif of agent.not_ideal_for) {
    const nifLower = nif.toLowerCase();
    for (const word of words) {
      if (nifLower.includes(word)) score -= 5;
    }
  }

  // Category matching
  const categoryLabel = CATEGORY_LABELS[agent.primary_category]?.toLowerCase() || '';
  for (const word of words) {
    if (categoryLabel.includes(word)) score += 10;
  }

  return score;
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

function formatAgentDetail(agent: Agent): string {
  const lines = [
    `# ${agent.name}`,
    `*${agent.tagline}*`,
    "",
    `**URL:** ${agent.url}`,
    `**Category:** ${CATEGORY_LABELS[agent.primary_category] || agent.primary_category}`,
    `**Pricing:** ${agent.pricing_model} — ${agent.pricing_details}`,
    `**Autonomy Level:** ${agent.autonomy_level}`,
    `**Open Source:** ${agent.open_source ? 'Yes' : 'No'}${agent.repo_url ? ` (${agent.repo_url})` : ''}`,
    `**MCP Support:** ${agent.mcp_support ? 'Yes' : 'No'}`,
  ];

  // Add MCP config if available
  if (agent.mcp_support && agent.mcp_config) {
    lines.push("");
    lines.push("## MCP Server Configuration");
    lines.push("```json");
    lines.push(JSON.stringify({
      command: agent.mcp_config.command,
      args: agent.mcp_config.args,
      ...(agent.mcp_config.env && { env: agent.mcp_config.env })
    }, null, 2));
    lines.push("```");
    if (agent.mcp_config.description) {
      lines.push(`*${agent.mcp_config.description}*`);
    }
  }

  lines.push(
    "",
    "## Description",
    agent.description,
    "",
    "## Best For",
    ...agent.best_for.map(b => `- ${b}`),
    "",
    "## Capabilities",
    ...agent.capabilities.map(c => `- ${c}`),
    "",
    "## Limitations",
    ...agent.limitations.map(l => `- ${l}`),
    "",
    "## Not Ideal For",
    ...agent.not_ideal_for.map(n => `- ${n}`),
    "",
    "## Reliability",
    agent.reliability_notes,
    "",
    "## Access Methods",
    agent.access_methods.join(", "),
    "",
    "## Integrations",
    agent.integrates_with.length > 0 ? agent.integrates_with.join(", ") : "None listed"
  );

  return lines.join("\n");
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const SearchInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(500, "Query must not exceed 500 characters")
    .describe("Natural language description of what you need an agent for"),
  category: z.string()
    .optional()
    .describe("Filter by category (e.g., 'coding_development', 'creative_design')"),
  pricing: z.string()
    .optional()
    .describe("Filter by pricing model: 'free', 'freemium', 'paid', 'enterprise', 'open_source'"),
  limit: z.number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of results to return")
}).strict();

const GetAgentInputSchema = z.object({
  slug: z.string()
    .min(1)
    .describe("The agent slug (e.g., 'claude-code', 'cursor', 'midjourney')")
}).strict();

const CompareInputSchema = z.object({
  slugs: z.array(z.string())
    .min(2, "Must compare at least 2 agents")
    .max(5, "Cannot compare more than 5 agents at once")
    .describe("Array of agent slugs to compare")
}).strict();

// ============================================================================
// MCP SERVER
// ============================================================================

const server = new McpServer({
  name: "yagoo-mcp-server",
  version: "1.0.0"
});

// Tool: Search agents
server.registerTool(
  "yagoo_search",
  {
    title: "Search YAGOO Directory",
    description: `Search the YAGOO agent directory to find the right AI agent for a task.

YAGOO is "Yet Another Guide, Orchestrated Organically" — the agent guide for the internet.
Currently indexes ${AGENTS.length} agents across ${Object.keys(CATEGORY_LABELS).length} categories.

Use this tool when you need to:
- Recommend an agent for a specific task
- Find alternatives to a known agent
- Discover what agents exist for a category

Args:
  - query (string): Natural language description (e.g., "scrape websites", "write marketing copy")
  - category (string, optional): Filter by category
  - pricing (string, optional): Filter by pricing model
  - limit (number): Max results (default: 5)

Returns:
  Ranked list of matching agents with relevance scores and recommendations.`,
    inputSchema: SearchInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => {
    let filtered = AGENTS;

    // Apply category filter
    if (params.category) {
      const cat = params.category;
      filtered = filtered.filter(a =>
        a.primary_category === cat ||
        a.secondary_categories.includes(cat)
      );
    }

    // Apply pricing filter
    if (params.pricing) {
      filtered = filtered.filter(a => a.pricing_model === params.pricing);
    }

    // Score and rank
    const scored = filtered.map(agent => ({
      agent,
      score: scoreAgent(agent, params.query)
    })).filter(item => item.score > 0);

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, params.limit);

    if (results.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No agents found matching "${params.query}". Try different keywords or browse by category using yagoo_list_categories.`
        }]
      };
    }

    const lines = [
      `# YAGOO Search Results: "${params.query}"`,
      `Found ${results.length} matching agent${results.length !== 1 ? 's' : ''}`,
      ""
    ];

    for (let i = 0; i < results.length; i++) {
      const { agent, score } = results[i];
      lines.push(`## ${i + 1}. ${agent.name}`);
      lines.push(`*${agent.tagline}*`);
      lines.push("");
      lines.push(`**Why it fits:** ${agent.best_for.slice(0, 2).join("; ")}`);
      lines.push(`**Watch out for:** ${agent.limitations[0] || "No major limitations noted"}`);
      lines.push(`**Pricing:** ${agent.pricing_model} — ${agent.pricing_details}`);
      lines.push(`**URL:** ${agent.url}`);
      if (agent.mcp_support && agent.mcp_config) {
        lines.push(`**MCP:** \`${agent.mcp_config.command} ${agent.mcp_config.args.join(" ")}\``);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("*Use yagoo_get_agent with slug for full details. Use yagoo_compare to compare options.*");

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };
  }
);

// Tool: Get agent details
server.registerTool(
  "yagoo_get_agent",
  {
    title: "Get Agent Details",
    description: `Get full details for a specific agent from the YAGOO directory.

Args:
  - slug (string): The agent identifier (e.g., 'claude-code', 'cursor', 'midjourney', 'yagoo')

Returns:
  Complete agent profile including capabilities, limitations, pricing, and recommendations.`,
    inputSchema: GetAgentInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => {
    const agent = AGENTS.find(a => a.slug === params.slug);

    if (!agent) {
      const suggestions = AGENTS
        .filter(a => a.slug.includes(params.slug) || a.name.toLowerCase().includes(params.slug.toLowerCase()))
        .slice(0, 3)
        .map(a => a.slug);

      return {
        content: [{
          type: "text",
          text: `Agent "${params.slug}" not found.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : " Use yagoo_search to find agents."}`
        }]
      };
    }

    return {
      content: [{ type: "text", text: formatAgentDetail(agent) }]
    };
  }
);

// Tool: List categories
server.registerTool(
  "yagoo_list_categories",
  {
    title: "List Agent Categories",
    description: `List all agent categories in the YAGOO directory with counts.

Returns:
  All ${Object.keys(CATEGORY_LABELS).length} categories with the number of agents in each.`,
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {
    const categoryCounts: Record<string, number> = {};

    for (const agent of AGENTS) {
      categoryCounts[agent.primary_category] = (categoryCounts[agent.primary_category] || 0) + 1;
    }

    const lines = [
      "# YAGOO Agent Categories",
      "",
      `Total: ${AGENTS.length} agents across ${Object.keys(categoryCounts).length} categories`,
      ""
    ];

    for (const [slug, label] of Object.entries(CATEGORY_LABELS)) {
      const count = categoryCounts[slug] || 0;
      lines.push(`- **${label}** (${slug}): ${count} agent${count !== 1 ? 's' : ''}`);
    }

    lines.push("");
    lines.push("*Use yagoo_search with category filter to explore specific categories.*");

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };
  }
);

// Tool: Compare agents
server.registerTool(
  "yagoo_compare",
  {
    title: "Compare Agents",
    description: `Compare multiple agents side-by-side.

Args:
  - slugs (array): List of 2-5 agent slugs to compare

Returns:
  Side-by-side comparison of pricing, capabilities, and recommendations.`,
    inputSchema: CompareInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => {
    const agents: Agent[] = [];
    const notFound: string[] = [];

    for (const slug of params.slugs) {
      const agent = AGENTS.find(a => a.slug === slug);
      if (agent) {
        agents.push(agent);
      } else {
        notFound.push(slug);
      }
    }

    if (notFound.length > 0) {
      return {
        content: [{
          type: "text",
          text: `Agents not found: ${notFound.join(", ")}. Use yagoo_search to find valid agent slugs.`
        }]
      };
    }

    if (agents.length < 2) {
      return {
        content: [{
          type: "text",
          text: "Need at least 2 valid agents to compare."
        }]
      };
    }

    const lines = [
      `# Agent Comparison: ${agents.map(a => a.name).join(" vs ")}`,
      ""
    ];

    // Pricing comparison
    lines.push("## Pricing");
    for (const agent of agents) {
      lines.push(`- **${agent.name}**: ${agent.pricing_model} — ${agent.pricing_details}`);
    }
    lines.push("");

    // Autonomy comparison
    lines.push("## Autonomy Level");
    for (const agent of agents) {
      lines.push(`- **${agent.name}**: ${agent.autonomy_level}`);
    }
    lines.push("");

    // Best for comparison
    lines.push("## Best For");
    for (const agent of agents) {
      lines.push(`**${agent.name}:**`);
      for (const bf of agent.best_for.slice(0, 3)) {
        lines.push(`  - ${bf}`);
      }
    }
    lines.push("");

    // Limitations comparison
    lines.push("## Watch Out For");
    for (const agent of agents) {
      lines.push(`**${agent.name}:**`);
      for (const lim of agent.limitations.slice(0, 2)) {
        lines.push(`  - ${lim}`);
      }
    }
    lines.push("");

    // Recommendations
    lines.push("## Quick Recommendations");
    const freeAgent = agents.find(a => a.pricing_model === 'free' || a.pricing_model === 'open_source' || a.pricing_model === 'freemium');
    const autonomousAgent = agents.find(a => a.autonomy_level === 'fully_autonomous');
    const mcpAgent = agents.find(a => a.mcp_support);

    if (freeAgent) {
      lines.push(`- **Budget-friendly**: ${freeAgent.name}`);
    }
    if (autonomousAgent) {
      lines.push(`- **For autonomous operation**: ${autonomousAgent.name}`);
    }
    if (mcpAgent) {
      lines.push(`- **MCP integration**: ${mcpAgent.name}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };
  }
);

// Tool: List MCP-enabled agents
server.registerTool(
  "yagoo_list_mcp",
  {
    title: "List MCP-Enabled Agents",
    description: `List all agents with MCP server support and their connection configs.

Returns:
  All agents that can be connected via MCP, with ready-to-use configuration.`,
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => {
    const mcpAgents = AGENTS.filter(a => a.mcp_support && a.mcp_config);

    const lines = [
      "# MCP-Enabled Agents",
      "",
      `${mcpAgents.length} agents with MCP server support:`,
      ""
    ];

    for (const agent of mcpAgents) {
      lines.push(`## ${agent.name}`);
      lines.push(`*${agent.tagline}*`);
      lines.push("");
      lines.push("**Connection:**");
      lines.push("```json");
      lines.push(JSON.stringify({
        command: agent.mcp_config!.command,
        args: agent.mcp_config!.args,
        ...(agent.mcp_config!.env && { env: agent.mcp_config!.env })
      }, null, 2));
      lines.push("```");
      if (agent.mcp_config!.description) {
        lines.push(agent.mcp_config!.description);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("*Add to Claude Code: `claude mcp add <name> -- <command> <args>`*");

    return {
      content: [{ type: "text", text: lines.join("\n") }]
    };
  }
);

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YAGOO MCP server running via stdio");
  console.error(`${AGENTS.length} agents loaded across ${Object.keys(CATEGORY_LABELS).length} categories`);
}

main().catch(error => {
  console.error("Server error:", error);
  process.exit(1);
});
