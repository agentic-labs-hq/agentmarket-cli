import { createPublicClient, defineChain, http, type Chain, type PublicClient } from "viem";
import { bsc } from "viem/chains";

import { BawClient, BSC_BINANCE_CHAIN_ID } from "./baw.js";
import { defaultDeploymentPath, loadDeployment, type Deployment } from "./deployment.js";
import { CliError } from "./errors.js";
import { createStateStore, type StateStore } from "./state.js";

export const DEFAULT_RPC_URL = "https://bsc-dataseed.bnbchain.org";

/**
 * Read-only runtime: a viem public client for RPC reads, the address book, and
 * the Binance Agentic Wallet client used for preview/execute. There is
 * deliberately no signer and no local account.
 */
export interface Runtime {
  publicClient: PublicClient;
  deployment: Deployment;
  rpcUrl: string;
  /** Host only: never print the full URL because RPC providers embed API keys. */
  rpcHost: string;
  baw: BawClient;
  /** Local preview/execution journal; production uses the per-user state dir. */
  stateStore?: StateStore;
}

export interface RuntimeOptions {
  deployment?: Deployment;
  env?: NodeJS.ProcessEnv;
  /** Injectable BAW client for tests. */
  baw?: BawClient;
  /** Injectable viem public client for tests (no network). */
  publicClient?: PublicClient;
  /** Injectable state store for tests. */
  stateStore?: StateStore;
}

/**
 * The BAW client is BSC-mainnet-only: every contract-call preview/execute is
 * sent with `--binanceChainId 56`. Refuse write paths whose address book is on
 * another chain so reads, journal and signing can never disagree.
 */
export function assertBawChain(runtime: Runtime): void {
  const bawChainId = Number(BSC_BINANCE_CHAIN_ID);
  if (runtime.deployment.chainId !== bawChainId) {
    throw new CliError(
      "UNSUPPORTED_CHAIN",
      `This CLI previews and executes only on BSC mainnet (chain ${bawChainId}); the address book is chain ${runtime.deployment.chainId} (${runtime.deployment.sourcePath}). Read-only commands still work, but write operations are disabled.`,
      { deploymentChainId: runtime.deployment.chainId, bawChainId },
    );
  }
}

/** `AGENTMARKET_RPC_URL` when set, otherwise the deployment default, otherwise BSC public. */
export function resolveRpcUrl(deployment: Deployment, env: NodeJS.ProcessEnv = process.env): string {
  const value = env.AGENTMARKET_RPC_URL?.trim();
  const rpcUrl = value === undefined || value === "" ? deployment.rpcUrl || DEFAULT_RPC_URL : value;
  try {
    const url = new URL(rpcUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw new CliError("RPC_INVALID", "AGENTMARKET_RPC_URL must be a valid http(s) URL.");
  }
  return rpcUrl;
}

/** Host for display; strips credentials, paths, and query parameters. */
export function rpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return "invalid-rpc-url";
  }
}

export function chainFor(deployment: Deployment, rpcUrl: string): Chain {
  if (deployment.chainId === 56) return bsc;
  return defineChain({
    id: deployment.chainId,
    name: deployment.network,
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/**
 * Build the read-only runtime from the address book and environment. All
 * signing is delegated to the Binance Agentic Wallet via `baw`.
 */
export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const env = options.env ?? process.env;
  const deployment = options.deployment ?? loadDeployment(defaultDeploymentPath(env));
  const rpcUrl = resolveRpcUrl(deployment, env);
  const publicClient =
    options.publicClient ??
    createPublicClient({
      chain: chainFor(deployment, rpcUrl),
      transport: http(rpcUrl),
    });

  return {
    publicClient,
    deployment,
    rpcUrl,
    rpcHost: rpcHost(rpcUrl),
    baw: options.baw ?? new BawClient(),
    stateStore: options.stateStore ?? createStateStore(env),
  };
}
