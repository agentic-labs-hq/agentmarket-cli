import { zeroAddress, type Address, type PublicClient } from "viem";

import {
  agentIdRegistryAbi,
  agentmarketAbi,
  identityAdapterAbi,
  nftAbi,
  nftRegistryAbi,
  policyRegistryAbi,
  transferPolicyAbi,
} from "../abis.js";
import { deploymentAddress, type AddressBookKey, type Deployment } from "../deployment.js";
import { CliError } from "../errors.js";
import { formatBnb, formatTokenAmount, formatUnixSeconds } from "../lib/parse.js";
import type { Runtime } from "../runtime.js";

export type CommandResult = Record<string, unknown>;
export type CheckStatus = "ok" | "fail" | "warn";

export interface Check {
  name: string;
  status: CheckStatus;
  detail?: string;
}

/** Common metadata present in every command result. */
export function baseResult(runtime: Runtime, command: string): CommandResult {
  return {
    ok: true,
    command,
    chainId: runtime.deployment.chainId,
    network: runtime.deployment.network,
    rpcHost: runtime.rpcHost,
  };
}

export function gwei(wei: bigint): string {
  return formatTokenAmount(wei, 9);
}

export function shortError(error: unknown): string {
  if (error !== null && typeof error === "object" && "shortMessage" in error) {
    const short = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof short === "string" && short.length > 0) return short;
  }
  return error instanceof Error ? error.message : String(error);
}

export function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Resolve a required address-book entry; missing NFT addresses fail loudly. */
export function requireAddress(runtime: Runtime, key: AddressBookKey): Address {
  return deploymentAddress(runtime.deployment, key);
}

/** Verify the RPC is on the chain named by the address book. */
export async function assertChain(runtime: Runtime): Promise<number> {
  const chainId = await runtime.publicClient.getChainId();
  if (chainId !== runtime.deployment.chainId) {
    throw new CliError(
      "CHAIN_MISMATCH",
      `RPC reports chain ${chainId}, but the address book is for chain ${runtime.deployment.chainId} (${runtime.deployment.sourcePath}).`,
      { rpcChainId: chainId, deploymentChainId: runtime.deployment.chainId },
    );
  }
  return chainId;
}

export interface CollectionInfo {
  address: Address;
  name: string;
  symbol: string;
  creator: Address;
  policy: Address;
  factory: Address;
  maxSupply: bigint;
  totalMinted: bigint;
  baseURI: string;
  metadataURI: string;
  metadataResolver: Address;
}

/** Read the immutable collection metadata used by every collection/NFT command. */
export async function readCollection(publicClient: PublicClient, collection: Address): Promise<CollectionInfo> {
  try {
    const [name, symbol, creator, policy, factory, maxSupply, totalMinted, baseURI, metadataURI, metadataResolver] =
      await Promise.all([
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "name" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "symbol" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "creator" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "policy" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "factory" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "maxSupply" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "totalMinted" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "baseURI" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "metadataURI" }),
        publicClient.readContract({ address: collection, abi: nftAbi, functionName: "metadataResolver" }),
      ]);
    return {
      address: collection,
      name,
      symbol,
      creator,
      policy,
      factory,
      maxSupply,
      totalMinted,
      baseURI,
      metadataURI,
      metadataResolver,
    };
  } catch (error) {
    throw new CliError("COLLECTION_READ_FAILED", `Could not read the NFT collection at ${collection}: ${shortError(error)}`, {
      collection,
    });
  }
}

export interface RegistryStatus {
  address: Address;
  registered: boolean;
  policy: Address | null;
  creator: Address | null;
  policyMatchesCollection: boolean | null;
  creatorMatchesCollection: boolean | null;
}

/** Read the NFT registry record for a collection. */
export async function readRegistryStatus(
  publicClient: PublicClient,
  registry: Address,
  collection: Address,
  expected: { policy: Address; creator: Address },
): Promise<RegistryStatus> {
  try {
    const registered = await publicClient.readContract({
      address: registry,
      abi: nftRegistryAbi,
      functionName: "isRegistered",
      args: [collection],
    });
    if (!registered) {
      return {
        address: registry,
        registered: false,
        policy: null,
        creator: null,
        policyMatchesCollection: null,
        creatorMatchesCollection: null,
      };
    }
    const [policy, creator] = await Promise.all([
      publicClient.readContract({ address: registry, abi: nftRegistryAbi, functionName: "policyOf", args: [collection] }),
      publicClient.readContract({ address: registry, abi: nftRegistryAbi, functionName: "creatorOf", args: [collection] }),
    ]);
    return {
      address: registry,
      registered: true,
      policy,
      creator,
      policyMatchesCollection: sameAddress(policy, expected.policy),
      creatorMatchesCollection: sameAddress(creator, expected.creator),
    };
  } catch (error) {
    throw new CliError("REGISTRY_READ_FAILED", `Could not read the NFT registry at ${registry}: ${shortError(error)}`, {
      registry,
      collection,
    });
  }
}

export interface MarketConfig {
  address: Address;
  nftRegistry: Address;
  venueRegistry: Address;
  treasury: Address;
  feeBps: number;
  maxFeeBps: number;
}

export async function readMarketConfig(publicClient: PublicClient, market: Address): Promise<MarketConfig> {
  try {
    const [nftRegistry, venueRegistry, treasury, feeBps, maxFeeBps] = await Promise.all([
      publicClient.readContract({ address: market, abi: agentmarketAbi, functionName: "nftRegistry" }),
      publicClient.readContract({ address: market, abi: agentmarketAbi, functionName: "venueRegistry" }),
      publicClient.readContract({ address: market, abi: agentmarketAbi, functionName: "treasury" }),
      publicClient.readContract({ address: market, abi: agentmarketAbi, functionName: "feeBps" }),
      publicClient.readContract({ address: market, abi: agentmarketAbi, functionName: "maxFeeBps" }),
    ]);
    return {
      address: market,
      nftRegistry,
      venueRegistry,
      treasury,
      feeBps: Number(feeBps),
      maxFeeBps: Number(maxFeeBps),
    };
  } catch (error) {
    throw new CliError("MARKET_READ_FAILED", `Could not read Agentmarket at ${market}: ${shortError(error)}`, {
      market,
    });
  }
}

export interface ListingView {
  seller: Address;
  collection: Address;
  tokenId: bigint;
  price: bigint;
  paymentAsset: Address;
  deadline: bigint;
  nonce: bigint;
  feeBps: number;
  active: boolean;
}

/** Read `Agentmarket.listingOf` and flatten the nested Order tuple. */
export async function readListing(
  publicClient: PublicClient,
  market: Address,
  collection: Address,
  tokenId: bigint,
): Promise<ListingView> {
  try {
    const raw = (await publicClient.readContract({
      address: market,
      abi: agentmarketAbi,
      functionName: "listingOf",
      args: [collection, tokenId],
    })) as unknown as
      | {
          order: {
            seller: Address;
            collection: Address;
            tokenId: bigint;
            price: bigint;
            paymentAsset: Address;
            deadline: bigint;
            nonce: bigint;
          };
          feeBps: number;
          active: boolean;
        }
      | readonly unknown[];
    const shaped: { order: unknown; feeBps: unknown; active: unknown } = Array.isArray(raw)
      ? {
          order: (raw as readonly unknown[])[0],
          feeBps: (raw as readonly unknown[])[1],
          active: (raw as readonly unknown[])[2],
        }
      : (raw as { order: unknown; feeBps: unknown; active: unknown });
    const order = shaped.order as {
      seller: Address;
      collection: Address;
      tokenId: bigint;
      price: bigint;
      paymentAsset: Address;
      deadline: bigint;
      nonce: bigint;
    };
    return {
      seller: order.seller,
      collection: order.collection,
      tokenId: order.tokenId,
      price: order.price,
      paymentAsset: order.paymentAsset,
      deadline: order.deadline,
      nonce: order.nonce,
      feeBps: Number(shaped.feeBps),
      active: shaped.active === true,
    };
  } catch (error) {
    throw new CliError("LISTING_READ_FAILED", `Could not read the listing for ${collection} #${tokenId}: ${shortError(error)}`, {
      market,
      collection,
      tokenId: tokenId.toString(),
    });
  }
}

/** Read `Agentmarket.isExecutable`; the contract view is the source of truth. */
export async function readIsExecutable(
  publicClient: PublicClient,
  market: Address,
  collection: Address,
  tokenId: bigint,
): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: market,
      abi: agentmarketAbi,
      functionName: "isExecutable",
      args: [collection, tokenId],
    });
  } catch (error) {
    throw new CliError(
      "EXECUTABLE_READ_FAILED",
      `Could not read isExecutable(${collection}, ${tokenId}): ${shortError(error)}`,
      { market, collection, tokenId: tokenId.toString() },
    );
  }
}

/** JSON-safe listing representation shared by status/list/cancel/buy. */
export function listingJson(listing: ListingView): Record<string, unknown> {
  return {
    seller: listing.seller,
    collection: listing.collection,
    tokenId: listing.tokenId.toString(),
    priceWei: listing.price.toString(),
    priceBnb: formatBnb(listing.price),
    paymentAsset: listing.paymentAsset,
    deadline: listing.deadline.toString(),
    deadlineIso: formatUnixSeconds(listing.deadline),
    nonce: listing.nonce.toString(),
    feeBps: listing.feeBps,
    active: listing.active,
  };
}

export async function readOwnerOf(
  publicClient: PublicClient,
  collection: Address,
  tokenId: bigint,
): Promise<Address> {
  try {
    return await publicClient.readContract({
      address: collection,
      abi: nftAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch (error) {
    const message = shortError(error);
    const notFound = /nonexistent|invalid token|owner query for nonexistent/i.test(message);
    throw new CliError(
      notFound ? "NFT_NOT_FOUND" : "NFT_READ_FAILED",
      notFound
        ? `Token ${tokenId} does not exist in collection ${collection}.`
        : `Could not read ownerOf(${tokenId}) for ${collection}: ${message}`,
      { collection, tokenId: tokenId.toString() },
    );
  }
}

export interface ApprovalStatus {
  owner: Address;
  tokenApproved: Address;
  isApprovedForAll: boolean;
  approvedForMarket: boolean;
}

export async function readApprovalStatus(
  publicClient: PublicClient,
  collection: Address,
  tokenId: bigint,
  owner: Address,
  operator: Address,
): Promise<ApprovalStatus> {
  try {
    const [tokenApproved, approvedForAll] = await Promise.all([
      publicClient.readContract({
        address: collection,
        abi: nftAbi,
        functionName: "getApproved",
        args: [tokenId],
      }),
      publicClient.readContract({
        address: collection,
        abi: nftAbi,
        functionName: "isApprovedForAll",
        args: [owner, operator],
      }),
    ]);
    return {
      owner,
      tokenApproved,
      isApprovedForAll: approvedForAll,
      approvedForMarket: sameAddress(tokenApproved, operator) || approvedForAll,
    };
  } catch (error) {
    throw new CliError("APPROVAL_READ_FAILED", `Could not read NFT approvals for ${collection} #${tokenId}: ${shortError(error)}`, {
      collection,
      tokenId: tokenId.toString(),
    });
  }
}

export interface PolicySnapshot {
  registry: Address;
  current: Address;
  allowed: boolean;
  version: string | null;
  matchesAddressBook: boolean;
}

export async function readPolicySnapshot(
  publicClient: PublicClient,
  deployment: Deployment,
): Promise<PolicySnapshot> {
  try {
    const current = await publicClient.readContract({
      address: deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "currentPolicy",
    });
    const allowed =
      current === zeroAddress
        ? false
        : await publicClient.readContract({
            address: deployment.policyRegistry,
            abi: policyRegistryAbi,
            functionName: "isPolicyAllowed",
            args: [current],
          });
    let version: string | null = null;
    if (current !== zeroAddress) {
      try {
        const raw = await publicClient.readContract({
          address: deployment.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "policyVersion",
          args: [current],
        });
        version = raw.toString();
      } catch {
        version = null;
      }
    }
    return {
      registry: deployment.policyRegistry,
      current,
      allowed,
      version,
      matchesAddressBook: sameAddress(current, deployment.policy),
    };
  } catch (error) {
    throw new CliError("POLICY_READ_FAILED", `Could not read the policy registry: ${shortError(error)}`, {
      registry: deployment.policyRegistry,
    });
  }
}

export interface IdentitySnapshot {
  adapter: Address;
  kind: string | null;
  version: string | null;
  chainId: string | null;
  hasIdentity: boolean | null;
}

export interface IdentityMeta {
  adapter: Address;
  kind: string;
  version: string;
  chainId: string;
}

/** Read immutable identity adapter metadata (no wallet required). */
export async function readIdentityMeta(publicClient: PublicClient, adapter: Address): Promise<IdentityMeta> {
  const [kind, version, chainId] = await Promise.all([
    publicClient.readContract({ address: adapter, abi: identityAdapterAbi, functionName: "kind" }),
    publicClient.readContract({ address: adapter, abi: identityAdapterAbi, functionName: "version" }),
    publicClient.readContract({ address: adapter, abi: identityAdapterAbi, functionName: "chainId" }),
  ]);
  return { adapter, kind, version: version.toString(), chainId: chainId.toString() };
}

export interface AgentIdSnapshot {
  registry: Address;
  balance: string | null;
  handle: string | null;
}

export interface EligibilitySnapshot {
  address: Address;
  eligible: boolean | null;
  member: boolean | null;
  facility: boolean | null;
  category: number | null;
  revokedFacility: boolean | null;
  identity: IdentitySnapshot;
  agentId: AgentIdSnapshot;
  warnings: string[];
}

/** Read policy, identity adapter, and Agent ID registry views for one wallet. */
export async function readEligibility(
  publicClient: PublicClient,
  deployment: Deployment,
  wallet: Address,
): Promise<EligibilitySnapshot> {
  const warnings: string[] = [];
  let eligible: boolean | null = null;
  let member: boolean | null = null;
  let facility: boolean | null = null;
  let category: number | null = null;
  let revokedFacility: boolean | null = null;
  try {
    const [e, m, f, c, r] = await Promise.all([
      publicClient.readContract({
        address: deployment.policy,
        abi: transferPolicyAbi,
        functionName: "isEligible",
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.policy,
        abi: transferPolicyAbi,
        functionName: "isMember",
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.policy,
        abi: transferPolicyAbi,
        functionName: "isFacility",
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.policy,
        abi: transferPolicyAbi,
        functionName: "categoryOf",
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.policy,
        abi: transferPolicyAbi,
        functionName: "isRevokedFacility",
        args: [wallet],
      }),
    ]);
    eligible = e;
    member = m;
    facility = f;
    category = Number(c);
    revokedFacility = r;
  } catch (error) {
    warnings.push(`Could not read transfer policy ${deployment.policy}: ${shortError(error)}`);
  }

  const identity: IdentitySnapshot = {
    adapter: deployment.identityAdapter,
    kind: null,
    version: null,
    chainId: null,
    hasIdentity: null,
  };
  try {
    const meta = await readIdentityMeta(publicClient, deployment.identityAdapter);
    identity.kind = meta.kind;
    identity.version = meta.version;
    identity.chainId = meta.chainId;
    identity.hasIdentity = await publicClient.readContract({
      address: deployment.identityAdapter,
      abi: identityAdapterAbi,
      functionName: "hasIdentity",
      args: [wallet],
    });
  } catch (error) {
    warnings.push(`Could not read identity adapter ${deployment.identityAdapter}: ${shortError(error)}`);
  }

  const agentId: AgentIdSnapshot = { registry: deployment.agentIdRegistry, balance: null, handle: null };
  try {
    const [balance, handle] = await Promise.all([
      publicClient.readContract({
        address: deployment.agentIdRegistry,
        abi: agentIdRegistryAbi,
        functionName: "balanceOf",
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.agentIdRegistry,
        abi: agentIdRegistryAbi,
        functionName: "handleOf",
        args: [wallet],
      }),
    ]);
    agentId.balance = balance.toString();
    agentId.handle = handle === "" ? null : handle;
  } catch (error) {
    warnings.push(`Could not read Agent ID registry ${deployment.agentIdRegistry}: ${shortError(error)}`);
  }

  return {
    address: wallet,
    eligible,
    member,
    facility,
    category,
    revokedFacility,
    identity,
    agentId,
    warnings,
  };
}

export interface ContractCheck {
  key: AddressBookKey;
  address: Address | null;
  configured: boolean;
  hasCode: boolean;
  codeSize: number;
  error?: string;
}

/** Check that a configured address has runtime code; missing keys are reported. */
export async function checkContract(
  publicClient: PublicClient,
  deployment: Deployment,
  key: AddressBookKey,
): Promise<ContractCheck> {
  const address = deployment[key];
  if (address === undefined) {
    return {
      key,
      address: null,
      configured: false,
      hasCode: false,
      codeSize: 0,
      error: "not configured in the address book",
    };
  }
  try {
    const code = await publicClient.getCode({ address });
    const size = code === undefined || code === "0x" ? 0 : (code.length - 2) / 2;
    return { key, address, configured: true, hasCode: size > 0, codeSize: size };
  } catch (error) {
    return {
      key,
      address,
      configured: true,
      hasCode: false,
      codeSize: 0,
      error: shortError(error),
    };
  }
}

export async function readLatestTimestamp(publicClient: PublicClient): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return block.timestamp;
}

/** JSON-safe market config for status/doctor/list results. */
export function marketConfigJson(config: MarketConfig): Record<string, unknown> {
  return {
    address: config.address,
    nftRegistry: config.nftRegistry,
    venueRegistry: config.venueRegistry,
    treasury: config.treasury,
    feeBps: config.feeBps,
    maxFeeBps: config.maxFeeBps,
  };
}
