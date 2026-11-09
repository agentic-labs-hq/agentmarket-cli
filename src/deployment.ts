import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getAddress, isAddress, zeroAddress, type Address } from "viem";

import { CliError } from "./errors.js";

/** Address-book keys defined by the Agentmarket CLI specification. */
export const ADDRESS_BOOK_KEYS = [
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
] as const;

export type AddressBookKey = (typeof ADDRESS_BOOK_KEYS)[number];

/** Keys that must be present before any command can run. */
export const REQUIRED_ADDRESS_KEYS = [
  "treasury",
  "policy",
  "identityAdapter",
  "agentIdRegistry",
  "policyRegistry",
  "venueRegistry",
] as const;

/** Keys that only exist after the NFT protocol / Agentmarket deployment. */
export const NFT_ADDRESS_KEYS = ["nftRegistry", "nftFactory", "agentmarket"] as const;

export type NftAddressKey = (typeof NFT_ADDRESS_KEYS)[number];

export interface Deployment {
  chainId: number;
  network: string;
  name: string;
  status: string;
  sourcePath: string;
  startBlock?: number;
  rpcUrl: string;
  governance?: Address;
  nftRegistry?: Address;
  nftFactory?: Address;
  agentmarket?: Address;
  treasury: Address;
  policy: Address;
  identityAdapter: Address;
  agentIdRegistry: Address;
  policyRegistry: Address;
  venueRegistry: Address;
  /** Original JSON object, useful for diagnostics without re-reading the file. */
  raw: Record<string, unknown>;
}

export const DEFAULT_DEPLOYMENT_PATH = fileURLToPath(new URL("../deployments/56.json", import.meta.url));

/** `AGENTMARKET_DEPLOYMENT_FILE` when set, otherwise the packaged mainnet book. */
export function defaultDeploymentPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AGENTMARKET_DEPLOYMENT_FILE?.trim();
  return configured === undefined || configured === "" ? DEFAULT_DEPLOYMENT_PATH : configured;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("DEPLOYMENT_INVALID", `${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function parseChainId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new CliError("DEPLOYMENT_INVALID", "deployment.chainId must be a positive safe integer.");
  }
  return value;
}

function parseString(value: unknown, key: string, required = true): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new CliError("DEPLOYMENT_INVALID", `deployment.${key} is required.`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CliError("DEPLOYMENT_INVALID", `deployment.${key} must be a string.`);
  }
  return value;
}

function parseAddress(value: unknown, key: string): Address {
  const raw = parseString(value, key);
  if (raw === undefined || !isAddress(raw)) {
    throw new CliError("DEPLOYMENT_INVALID", `deployment.${key} is not a valid EVM address.`);
  }
  let address: Address;
  try {
    address = getAddress(raw);
  } catch (error) {
    throw new CliError("DEPLOYMENT_INVALID", `deployment.${key} has an invalid EIP-55 checksum.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (address === zeroAddress) {
    throw new CliError("DEPLOYMENT_INVALID", `deployment.${key} must not be the zero address.`);
  }
  return address;
}

function parseOptionalAddress(value: unknown, key: string): Address | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parseAddress(value, key);
}

function parseStartBlock(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new CliError("DEPLOYMENT_INVALID", "deployment.startBlock must be a positive safe integer.");
  }
  return value;
}

function parseRpcUrl(value: unknown): string {
  const raw = parseString(value, "rpcUrl", false);
  if (raw === undefined) return "https://bsc-dataseed.bnbchain.org";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw new CliError("DEPLOYMENT_INVALID", "deployment.rpcUrl must be an http(s) URL.");
  }
  return raw;
}

function readJson(path: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new CliError("DEPLOYMENT_UNREADABLE", `Cannot read the deployment address book at ${path}.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CliError("DEPLOYMENT_INVALID", "The deployment address book is not valid JSON.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return requireObject(parsed, "deployment");
}

/**
 * Load and validate a deployment address book. No network calls are made.
 *
 * NFT/market addresses are optional so that doctor/status remain usable before
 * the NFT protocol is deployed. Commands that need one of those addresses call
 * `deploymentAddress()` and receive a clear NFT_NOT_CONFIGURED error; the
 * loader never substitutes the zero address.
 */
export function loadDeployment(path: string = defaultDeploymentPath()): Deployment {
  const raw = readJson(path);
  const chainId = parseChainId(raw.chainId);
  const network = parseString(raw.network, "network") ?? `chain-${chainId}`;

  const addresses = {
    treasury: parseAddress(raw.treasury, "treasury"),
    policy: parseAddress(raw.policy, "policy"),
    identityAdapter: parseAddress(raw.identityAdapter, "identityAdapter"),
    agentIdRegistry: parseAddress(raw.agentIdRegistry, "agentIdRegistry"),
    policyRegistry: parseAddress(raw.policyRegistry, "policyRegistry"),
    venueRegistry: parseAddress(raw.venueRegistry, "venueRegistry"),
  } satisfies Record<(typeof REQUIRED_ADDRESS_KEYS)[number], Address>;

  return {
    chainId,
    network,
    name: parseString(raw.name, "name", false) ?? "Agentmarket",
    status: parseString(raw.status, "status", false) ?? "unknown",
    sourcePath: path,
    ...(parseStartBlock(raw.startBlock) === undefined ? {} : { startBlock: parseStartBlock(raw.startBlock) }),
    rpcUrl: parseRpcUrl(raw.rpcUrl),
    ...(parseOptionalAddress(raw.governance, "governance") === undefined
      ? {}
      : { governance: parseOptionalAddress(raw.governance, "governance") }),
    ...(parseOptionalAddress(raw.nftRegistry, "nftRegistry") === undefined
      ? {}
      : { nftRegistry: parseOptionalAddress(raw.nftRegistry, "nftRegistry") }),
    ...(parseOptionalAddress(raw.nftFactory, "nftFactory") === undefined
      ? {}
      : { nftFactory: parseOptionalAddress(raw.nftFactory, "nftFactory") }),
    ...(parseOptionalAddress(raw.agentmarket, "agentmarket") === undefined
      ? {}
      : { agentmarket: parseOptionalAddress(raw.agentmarket, "agentmarket") }),
    ...addresses,
    raw,
  };
}

/**
 * Address for a deployment key. Missing NFT/market addresses are a hard,
 * explicit error: never fall back to the zero address.
 */
export function deploymentAddress(deployment: Deployment, key: AddressBookKey): Address {
  const value = deployment[key];
  if (value !== undefined) return value;
  const isNftKey = (NFT_ADDRESS_KEYS as readonly string[]).includes(key);
  throw new CliError(
    isNftKey ? "NFT_NOT_CONFIGURED" : "DEPLOYMENT_NOT_CONFIGURED",
    `deployment.${key} is not configured in ${deployment.sourcePath}. ${
      isNftKey
        ? "The NFT protocol / Agentmarket contracts are not deployed yet or the address book has not been updated."
        : "Update the address book before using this command."
    } Set "${key}" in the address book or point AGENTMARKET_DEPLOYMENT_FILE at a complete deployment file.`,
    { key, deployment: deployment.sourcePath, configured: false },
  );
}

/** True when the optional address is present in the address book. */
export function hasDeploymentAddress(deployment: Deployment, key: AddressBookKey): boolean {
  return deployment[key] !== undefined;
}

export interface AddressBookEntry {
  key: AddressBookKey;
  address: Address | null;
  configured: boolean;
}

/** JSON-safe address book for status output. */
export function addressBookEntries(deployment: Deployment): AddressBookEntry[] {
  return ADDRESS_BOOK_KEYS.map((key) => ({
    key,
    address: deployment[key] ?? null,
    configured: deployment[key] !== undefined,
  }));
}
