#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { runCollectionCreate } from "./core/collection-create.js";
import { runCollectionInfo } from "./core/collection-info.js";
import { runCollectionMint } from "./core/collection-mint.js";
import { runDoctor } from "./core/doctor.js";
import { runMarketBuy } from "./core/market-buy.js";
import { runMarketCancel } from "./core/market-cancel.js";
import { runMarketList } from "./core/market-list.js";
import { runMarketStatus } from "./core/market-status.js";
import { runNftApprove, runNftApproveAll } from "./core/nft-approve.js";
import { runNftInfo } from "./core/nft-info.js";
import { runStatus } from "./core/status.js";
import { runTxExecute } from "./core/tx-execute.js";
import { runTxStatus } from "./core/tx-status.js";
import { errorPayload } from "./errors.js";
import { toJsonSafe } from "./json.js";
import { renderErrorHuman, renderHuman } from "./render.js";
import { createRuntime, type Runtime } from "./runtime.js";
import { readSkillText } from "./skill.js";
import { VERSION } from "./version.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

type ToolArgs = Record<string, unknown>;

function success(result: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: renderHuman(result) }],
    structuredContent: toJsonSafe(result) as Record<string, unknown>,
  };
}

function failure(error: unknown, command: string): ToolResult {
  const payload = errorPayload(error, command);
  return {
    isError: true,
    content: [{ type: "text", text: renderErrorHuman(payload) }],
    structuredContent: toJsonSafe(payload) as Record<string, unknown>,
  };
}

const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;
const PREVIEW_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;
const EXECUTE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const WALLET_NOTE =
  "Non-custodial Binance Agentic Wallet: no private key is accepted or handled by this tool. Preview only; execution requires the separate confirmed tx execute tool. Any additional Binance App approval is controlled by BAW.";

const stringArg = (args: ToolArgs, key: string): string => String(args[key]);
const optionalString = (args: ToolArgs, key: string): string | undefined =>
  args[key] === undefined || args[key] === null ? undefined : String(args[key]);
const boolArg = (args: ToolArgs, key: string): boolean => args[key] === true;

export interface McpToolSpec {
  name: string;
  title: string;
  description: string;
  /** CLI command this tool mirrors one-to-one. */
  command: string;
  inputSchema: z.ZodRawShape;
  annotations: typeof READ_ANNOTATIONS | typeof PREVIEW_ANNOTATIONS | typeof EXECUTE_ANNOTATIONS;
  run: (runtime: Runtime, args: ToolArgs) => Promise<Record<string, unknown>>;
}

/** The MCP tool surface. Every CLI command (except help/version) has one tool. */
export const MCP_TOOLS: McpToolSpec[] = [
  {
    name: "agentmarket_doctor",
    title: "Agentmarket doctor",
    command: "doctor",
    description:
      "Read-only health check: BSC chain 56, NFT registry/factory/Agentmarket contract code, market fee/treasury, policy registry, identity adapter, Agent ID eligibility, plus Binance Agentic Wallet version/status/BSC address/Developer Mode/tx-lock/BNB balance. BAW unavailability is reported with healthy=false.",
    inputSchema: {},
    annotations: READ_ANNOTATIONS,
    run: (runtime) => runDoctor(runtime),
  },
  {
    name: "agentmarket_status",
    title: "Agentmarket status",
    command: "status",
    description:
      "Read-only snapshot: chain head, gas price, address book, Agentmarket configuration, policy state, and Binance Agentic Wallet state. Missing NFT addresses are reported with nftConfigured=false.",
    inputSchema: {},
    annotations: READ_ANNOTATIONS,
    run: (runtime) => runStatus(runtime),
  },
  {
    name: "agentmarket_skill",
    title: "Agentmarket skill guide",
    command: "skill",
    description: "Return the packaged SKILL.md operational guide for agents.",
    inputSchema: {},
    annotations: READ_ANNOTATIONS,
    run: async () => ({ ok: true, command: "skill", skill: readSkillText() }),
  },
  {
    name: "agentmarket_collection_info",
    title: "NFT collection info",
    command: "collection info",
    description:
      "Read name, symbol, creator, policy, maxSupply, totalMinted, baseURI, metadataURI, metadataResolver, factory, and the INFTRegistry record. Read-only.",
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
    },
    annotations: READ_ANNOTATIONS,
    run: (runtime, args) => runCollectionInfo(runtime, { collection: stringArg(args, "collection") }),
  },
  {
    name: "agentmarket_collection_create",
    title: "Preview NFT collection creation",
    command: "collection create",
    description: `Build AgenticNFTFactory.createCollection calldata and preview it via baw contract-call preview. maxSupply must be > 0. resolver is optional and must be a contract. policy is optional; zero means the current policy. The new collection address is emitted by CollectionCreated after execution. Read preview.requestId and preview.nextCommand. ${WALLET_NOTE}`,
    inputSchema: {
      name: z.string().min(1).max(64).describe("Collection name (1-64 characters)."),
      symbol: z.string().min(1).max(16).describe("Collection symbol (1-16 characters)."),
      maxSupply: z.string().regex(/^\d+$/).describe("Maximum supply as a positive decimal integer string."),
      baseUri: z
        .string()
        .min(1)
        .optional()
        .describe("Base URI used as baseURI + tokenId when no resolver is set; optional when resolver is provided."),
      metadataUri: z.string().min(1).describe("Collection-level metadata URI stored on-chain."),
      resolver: z.string().optional().describe("Optional INFTMetadataResolver contract address."),
      policy: z.string().optional().describe("Optional transfer policy address; omitted or zero means current."),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runCollectionCreate(runtime, {
        name: stringArg(args, "name"),
        symbol: stringArg(args, "symbol"),
        maxSupply: stringArg(args, "maxSupply"),
        ...(optionalString(args, "baseUri") === undefined ? {} : { baseUri: optionalString(args, "baseUri") }),
        metadataUri: stringArg(args, "metadataUri"),
        ...(optionalString(args, "resolver") === undefined ? {} : { resolver: optionalString(args, "resolver") }),
        ...(optionalString(args, "policy") === undefined ? {} : { policy: optionalString(args, "policy") }),
      }),
  },
  {
    name: "agentmarket_collection_mint",
    title: "Preview NFT mint or mintBatch",
    command: "collection mint",
    description: `Read creator(), maxSupply, and totalMinted; only the immutable creator can mint and the request must fit remaining supply. A single recipient uses mint(to, count); multiple recipients use mintBatch(recipients, counts). Use either to/count or recipients, not both. ${WALLET_NOTE}`,
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      to: z.string().optional().describe("Single recipient address (use with count)."),
      count: z.string().regex(/^\d+$/).optional().describe("Token count for the single recipient."),
      recipients: z
        .array(z.string())
        .optional()
        .describe('Multiple recipients in the form "<address>:<count>", e.g. ["0xabc...:2","0xdef...:1"].'),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runCollectionMint(runtime, {
        collection: stringArg(args, "collection"),
        ...(optionalString(args, "to") === undefined ? {} : { to: optionalString(args, "to") }),
        ...(optionalString(args, "count") === undefined ? {} : { count: optionalString(args, "count") }),
        ...(Array.isArray(args.recipients) ? { recipients: args.recipients.map(String) } : {}),
      }),
  },
  {
    name: "agentmarket_nft_info",
    title: "NFT info",
    command: "nft info",
    description: "Read ownerOf, tokenURI, and collection basics. Read-only.",
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      tokenId: z.string().regex(/^\d+$/).describe("Token id as a decimal string."),
    },
    annotations: READ_ANNOTATIONS,
    run: (runtime, args) =>
      runNftInfo(runtime, {
        collection: stringArg(args, "collection"),
        tokenId: stringArg(args, "tokenId"),
      }),
  },
  {
    name: "agentmarket_nft_approve",
    title: "Preview NFT approval",
    command: "nft approve",
    description: `Build ERC-721 approve(spender, tokenId) and preview it. spender defaults to Agentmarket. revoke=true encodes approve(0). The connected wallet must own the token. ${WALLET_NOTE}`,
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      tokenId: z.string().regex(/^\d+$/).describe("Token id as a decimal string."),
      spender: z.string().optional().describe("Spender address; defaults to Agentmarket."),
      revoke: z.boolean().default(false).describe("Clear the approval instead of granting it."),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runNftApprove(runtime, {
        collection: stringArg(args, "collection"),
        tokenId: stringArg(args, "tokenId"),
        revoke: boolArg(args, "revoke"),
        ...(optionalString(args, "spender") === undefined ? {} : { spender: optionalString(args, "spender") }),
      }),
  },
  {
    name: "agentmarket_nft_approve_all",
    title: "Preview setApprovalForAll",
    command: "nft approve-all",
    description: `Build ERC-721 setApprovalForAll(operator, !revoke) and preview it. operator defaults to Agentmarket. ${WALLET_NOTE}`,
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      operator: z.string().optional().describe("Operator address; defaults to Agentmarket."),
      revoke: z.boolean().default(false).describe("Revoke blanket approval instead of granting it."),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runNftApproveAll(runtime, {
        collection: stringArg(args, "collection"),
        revoke: boolArg(args, "revoke"),
        ...(optionalString(args, "operator") === undefined ? {} : { operator: optionalString(args, "operator") }),
      }),
  },
  {
    name: "agentmarket_market_status",
    title: "Market listing status",
    command: "market status",
    description:
      "Read the full listing, isExecutable, ownerOf, getApproved, and isApprovedForAll for Agentmarket. Read-only.",
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      tokenId: z.string().regex(/^\d+$/).describe("Token id as a decimal string."),
    },
    annotations: READ_ANNOTATIONS,
    run: (runtime, args) =>
      runMarketStatus(runtime, {
        collection: stringArg(args, "collection"),
        tokenId: stringArg(args, "tokenId"),
      }),
  },
  {
    name: "agentmarket_market_list",
    title: "Preview Agentmarket listing",
    command: "market list",
    description: `Check that the collection is registered, the wallet owns the token, price is positive, and the deadline is valid. If Agentmarket is not approved, return status=needsApproval with an approve preview and do NOT preview list. If approved, preview Agentmarket.list. price is human BNB; deadline is an optional Unix timestamp. ${WALLET_NOTE}`,
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      tokenId: z.string().regex(/^\d+$/).describe("Token id as a decimal string."),
      price: z.string().describe('Human BNB price, e.g. "0.5".'),
      deadline: z.string().regex(/^\d+$/).optional().describe("Optional Unix timestamp; omit for no expiry."),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runMarketList(runtime, {
        collection: stringArg(args, "collection"),
        tokenId: stringArg(args, "tokenId"),
        price: stringArg(args, "price"),
        ...(optionalString(args, "deadline") === undefined ? {} : { deadline: optionalString(args, "deadline") }),
      }),
  },
  {
    name: "agentmarket_market_cancel",
    title: "Preview listing cancellation",
    command: "market cancel",
    description: `Read listingOf; require an active listing whose seller is the connected wallet, then preview Agentmarket.cancel. ${WALLET_NOTE}`,
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      tokenId: z.string().regex(/^\d+$/).describe("Token id as a decimal string."),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runMarketCancel(runtime, {
        collection: stringArg(args, "collection"),
        tokenId: stringArg(args, "tokenId"),
      }),
  },
  {
    name: "agentmarket_market_buy",
    title: "Preview Agentmarket buy",
    command: "market buy",
    description: `Read listingOf and isExecutable. An invalid listing is an error and nothing is previewed. A valid listing previews Agentmarket.buy with value exactly equal to the listing price in wei. The seller cannot buy its own listing. ${WALLET_NOTE}`,
    inputSchema: {
      collection: z.string().min(1).describe("NFT collection contract address."),
      tokenId: z.string().regex(/^\d+$/).describe("Token id as a decimal string."),
    },
    annotations: PREVIEW_ANNOTATIONS,
    run: (runtime, args) =>
      runMarketBuy(runtime, {
        collection: stringArg(args, "collection"),
        tokenId: stringArg(args, "tokenId"),
      }),
  },
  {
    name: "agentmarket_tx_execute",
    title: "Execute previewed request",
    command: "tx execute",
    description:
      "EXECUTES exactly one requestId returned by a previous preview via baw contract-call execute. Requires confirmed:true; no key argument is accepted. Signing and any Binance App confirmation happen in Binance Agentic Wallet. requestId comes from preview.requestId or needsApproval[i].preview.requestId. The preview binding is local, single-use, and must be readable from AGENTMARKET_STATE_DIR by the execute process.",
    inputSchema: {
      requestId: z.string().min(1).describe("requestId from a previous preview."),
      confirmed: z.boolean().optional().describe("Must be true; explicit confirmation to execute."),
    },
    annotations: EXECUTE_ANNOTATIONS,
    run: (runtime, args) =>
      runTxExecute(runtime, {
        requestId: stringArg(args, "requestId"),
        confirm: boolArg(args, "confirmed"),
      }),
  },
  {
    name: "agentmarket_tx_status",
    title: "Transaction status",
    command: "tx status",
    description:
      "Query status by txHash through BAW, or by orderId from the local journal written by tx execute. The BAW contract-call flow has no orderId lookup. Read-only.",
    inputSchema: {
      orderId: z.string().optional().describe("orderId from tx execute (local journal)."),
      txHash: z.string().optional().describe("0x transaction hash (BAW tx-history lookup)."),
    },
    annotations: READ_ANNOTATIONS,
    run: (runtime, args) =>
      runTxStatus(runtime, {
        ...(optionalString(args, "orderId") === undefined ? {} : { orderId: optionalString(args, "orderId") }),
        ...(optionalString(args, "txHash") === undefined ? {} : { txHash: optionalString(args, "txHash") }),
      }),
  },
];

/** Build the MCP server without connecting a transport (testable). */
export function createServer(): McpServer {
  const server = new McpServer({ name: "agentmarket", version: VERSION });
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: unknown) => {
        try {
          return success(await tool.run(createRuntime(), (args ?? {}) as ToolArgs));
        } catch (error) {
          return failure(error, tool.command);
        }
      },
    );
  }
  return server;
}

async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  try {
    return realpathSync(invoked) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`agentmarket-mcp failed to start: ${message}\n`);
    process.exitCode = 1;
  });
}
