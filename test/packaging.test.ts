import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { isAddress, zeroAddress } from "viem";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN_KEY_ENV = `AGENTMARKET_${"PRIVATE"}_KEY`;

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function sourceFiles(directory: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory))) {
    const path = join(ROOT, directory, entry);
    if (statSync(path).isDirectory()) output.push(...sourceFiles(relative(ROOT, path)));
    else if (entry.endsWith(".ts")) output.push(relative(ROOT, path));
  }
  return output;
}

const RAW_KEY_PATTERN = /0x[0-9a-fA-F]{64}/;
const ABSOLUTE_LOCAL_PATH = /\/(?:Users|home)\/|[A-Za-z]:\\Users\\/;

const MCP_TOOL_NAMES = [
  "agentmarket_doctor",
  "agentmarket_status",
  "agentmarket_skill",
  "agentmarket_collection_info",
  "agentmarket_collection_create",
  "agentmarket_collection_mint",
  "agentmarket_nft_info",
  "agentmarket_nft_approve",
  "agentmarket_nft_approve_all",
  "agentmarket_market_status",
  "agentmarket_market_list",
  "agentmarket_market_cancel",
  "agentmarket_market_buy",
  "agentmarket_tx_execute",
  "agentmarket_tx_status",
];

const ADDRESS_BOOK_KEYS = [
  "chainId",
  "network",
  "rpcUrl",
  "startBlock",
  "governance",
  "nftRegistry",
  "nftFactory",
  "agentmarket",
  "treasury",
  "policy",
  "identityAdapter",
  "agentIdRegistry",
  "policyRegistry",
  "venueRegistry",
];

describe("public packaging", () => {
  it("declares the expected package name, version, and both bins", () => {
    const pkg = JSON.parse(read("package.json")) as {
      name: string;
      version: string;
      private?: boolean;
      bin: Record<string, string>;
      files: string[];
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("agentnftmarket");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.private).toBe(false);
    expect(pkg.bin.agentmarket).toBe("dist/cli.js");
    expect(pkg.bin["agentmarket-mcp"]).toBe("dist/mcp.js");
    for (const entry of ["dist", "deployments", "SKILL.md", "README.md", "LICENSE"]) {
      expect(pkg.files).toContain(entry);
    }
    expect(pkg.dependencies).not.toHaveProperty("@agentic-protocol/sdk");
    expect(pkg.dependencies).not.toHaveProperty("@agentswap/sdk");
  });

  it("documents the Binance Agentic Wallet flow without signer instructions", () => {
    const skill = read("SKILL.md");
    for (const expected of [
      "Binance Agentic Wallet",
      "baw",
      "Developer Mode",
      "Binance App",
      "requestId",
      "Agentmarket CLI",
      "agentmarket tx execute",
      "needsApproval",
      "npx -y --package agentnftmarket@0.1.0 agentmarket",
      "agentmarket doctor",
      ...MCP_TOOL_NAMES,
    ]) {
      expect(skill, expected).toContain(expected);
    }
    expect(skill).not.toMatch(ABSOLUTE_LOCAL_PATH);
    expect(skill).not.toContain(FORBIDDEN_KEY_ENV);
    expect(skill).not.toMatch(RAW_KEY_PATTERN);
  });

  it("keeps README/help/MCP free of absolute local paths and signer env vars", () => {
    for (const path of ["README.md", "src/help.ts", "src/mcp.ts"]) {
      const content = read(path);
      expect(content, path).not.toMatch(ABSOLUTE_LOCAL_PATH);
      expect(content, path).not.toContain(FORBIDDEN_KEY_ENV);
    }
  });

  it("contains no signer code, vendored SDK, or FT command surface in src", () => {
    const sources = sourceFiles("src");
    expect(sources.some((path) => path.includes("vendor"))).toBe(false);
    for (const path of sources) {
      const content = read(path);
      for (const forbidden of [
        FORBIDDEN_KEY_ENV,
        ["private", "KeyToAccount"].join(""),
        ["wallet", "Client"].join(""),
        "--broadcast",
        "--dry-run",
        "--max-spend",
        "@agentic-protocol/sdk",
        "@agentswap/sdk",
        "agentswap",
        "token create",
        "dex pool",
        "dex lp",
      ]) {
        expect(content, `${path} contains ${forbidden}`).not.toContain(forbidden);
      }
      expect(content, path).not.toMatch(RAW_KEY_PATTERN);
    }
  });

  it("has no local file dependencies and no key-like files at the repository root", () => {
    for (const path of ["package.json", "README.md", "SKILL.md"]) {
      const content = read(path);
      expect(content, path).not.toContain("file:../");
      expect(content, path).not.toContain("/Users/");
    }
    const files = readdirSync(ROOT).filter((entry) => statSync(join(ROOT, entry)).isFile());
    expect(files.filter((entry) => /\.(env|key|pem|p12|keystore)$/i.test(entry))).toEqual([]);
  });

  it("keeps the deployment address book complete and never uses the zero address", () => {
    const deployment = JSON.parse(read("deployments/56.json")) as Record<string, unknown>;
    expect(deployment.chainId).toBe(56);
    for (const key of ADDRESS_BOOK_KEYS) {
      expect(deployment, key).toHaveProperty(key);
    }
    expect(deployment.status).toBe("deployed");
    for (const key of ["nftRegistry", "nftFactory", "agentmarket"]) {
      const value = deployment[key];
      expect(typeof value, key).toBe("string");
      expect(isAddress(value as string), key).toBe(true);
    }
    for (const key of [
      "governance",
      "treasury",
      "policy",
      "identityAdapter",
      "agentIdRegistry",
      "policyRegistry",
      "venueRegistry",
    ]) {
      const value = deployment[key];
      expect(typeof value, key).toBe("string");
      expect(isAddress(value as string), key).toBe(true);
      expect(value, key).not.toBe(zeroAddress);
    }
  });

  it("does not reference removed FT features in help or the MCP tool list", () => {
    const help = read("src/help.ts");
    for (const forbidden of ["facility create", "dex lp", "liquidity", "swap", "token approve", "listings", "holdings"]) {
      expect(help.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
    const mcp = read("src/mcp.ts");
    for (const name of MCP_TOOL_NAMES) expect(mcp).toContain(name);
    expect(mcp).not.toContain("agentswap_");
  });
});
