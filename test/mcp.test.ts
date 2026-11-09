import { z } from "zod";
import { describe, expect, it } from "vitest";

import { COMMANDS } from "../src/args.js";
import { MCP_TOOLS } from "../src/mcp.js";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

const VALID: Record<string, Record<string, unknown>> = {
  agentmarket_doctor: {},
  agentmarket_status: {},
  agentmarket_skill: {},
  agentmarket_collection_info: { collection: A },
  agentmarket_collection_create: {
    name: "Example",
    symbol: "EGT",
    maxSupply: "1000",
    baseUri: "ipfs://base/",
    metadataUri: "ipfs://meta.json",
  },
  agentmarket_collection_mint: { collection: A, to: B, count: "2" },
  agentmarket_nft_info: { collection: A, tokenId: "7" },
  agentmarket_nft_approve: { collection: A, tokenId: "7" },
  agentmarket_nft_approve_all: { collection: A },
  agentmarket_market_status: { collection: A, tokenId: "7" },
  agentmarket_market_list: { collection: A, tokenId: "7", price: "0.5" },
  agentmarket_market_cancel: { collection: A, tokenId: "7" },
  agentmarket_market_buy: { collection: A, tokenId: "7" },
  agentmarket_tx_execute: { requestId: "req-1", confirmed: true },
  agentmarket_tx_status: { txHash: `0x${"ab".repeat(32)}` },
};

describe("MCP tool surface", () => {
  it("has exactly one tool for every CLI command", () => {
    expect(MCP_TOOLS).toHaveLength(Object.keys(COMMANDS).length);
    expect(new Set(MCP_TOOLS.map((tool) => tool.name)).size).toBe(MCP_TOOLS.length);
    expect(MCP_TOOLS.map((tool) => tool.command).sort()).toEqual(Object.keys(COMMANDS).sort());
    for (const tool of MCP_TOOLS) {
      expect(tool.name).toMatch(/^agentmarket_[a-z0-9_]+$/);
      expect(typeof tool.title).toBe("string");
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("validates a complete payload for every tool", () => {
    for (const tool of MCP_TOOLS) {
      const schema = z.object(tool.inputSchema);
      const parsed = schema.safeParse(VALID[tool.name]);
      expect(parsed.success, `${tool.name}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
    }
  });

  it("rejects missing required fields and wrong types", () => {
    for (const tool of MCP_TOOLS) {
      if (Object.keys(tool.inputSchema).length === 0) continue;
      if (tool.name === "agentmarket_tx_status") continue;
      const schema = z.object(tool.inputSchema);
      expect(schema.safeParse({}).success, tool.name).toBe(false);
    }
    const list = z.object(MCP_TOOLS.find((tool) => tool.name === "agentmarket_market_list")!.inputSchema);
    expect(list.safeParse({ collection: A, tokenId: "7", price: "0.5" }).success).toBe(true);
    expect(list.safeParse({ collection: A, tokenId: "not-a-number", price: "0.5" }).success).toBe(false);
    expect(list.safeParse({ collection: A, tokenId: "7", price: "0.5", deadline: "nope" }).success).toBe(false);

    const create = z.object(MCP_TOOLS.find((tool) => tool.name === "agentmarket_collection_create")!.inputSchema);
    expect(
      create.safeParse({
        name: "UGC",
        symbol: "UGC",
        maxSupply: "10",
        metadataUri: "ipfs://meta.json",
        resolver: A,
      }).success,
    ).toBe(true);

    const mint = z.object(MCP_TOOLS.find((tool) => tool.name === "agentmarket_collection_mint")!.inputSchema);
    expect(mint.safeParse({ collection: A, recipients: [`${B}:2`] }).success).toBe(true);
    expect(mint.safeParse({ collection: A, recipients: [B] }).success).toBe(true);
  });

  it("documents the non-custodial preview/execute flow", () => {
    const text = MCP_TOOLS.map((tool) => tool.description).join("\n");
    expect(text).toContain("baw contract-call preview");
    expect(text).toContain("needsApproval");
    expect(text).toContain("confirmed:true");
    expect(text).toContain("no private key is accepted");
  });
});
