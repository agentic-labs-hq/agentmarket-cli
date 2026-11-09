import type { Runtime } from "../runtime.js";
import { nftRegistryAbi } from "../abis.js";
import { parseAddress, parseUint } from "../lib/parse.js";
import {
  assertChain,
  baseResult,
  listingJson,
  readApprovalStatus,
  readIsExecutable,
  readListing,
  readOwnerOf,
  requireAddress,
  shortError,
  type CommandResult,
} from "./common.js";

export interface MarketStatusOptions {
  collection: string;
  tokenId: string;
}

/** Read-only listing, executability, ownership, and market approval snapshot. */
export async function runMarketStatus(runtime: Runtime, options: MarketStatusOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const tokenId = parseUint(options.tokenId, "--token-id");
  const market = requireAddress(runtime, "agentmarket");
  const warnings: string[] = [];

  const [listing, executable, owner] = await Promise.all([
    readListing(runtime.publicClient, market, collection, tokenId),
    readIsExecutable(runtime.publicClient, market, collection, tokenId),
    readOwnerOf(runtime.publicClient, collection, tokenId),
  ]);
  const approval = await readApprovalStatus(runtime.publicClient, collection, tokenId, owner, market);

  let registered: boolean | null = null;
  if (runtime.deployment.nftRegistry !== undefined) {
    try {
      registered = await runtime.publicClient.readContract({
        address: runtime.deployment.nftRegistry,
        abi: nftRegistryAbi,
        functionName: "isRegistered",
        args: [collection],
      });
    } catch (error) {
      warnings.push(`Could not read the NFT registry: ${shortError(error)}`);
    }
  }

  if (registered === false) {
    warnings.push(`Collection ${collection} is not registered in the NFT registry ${runtime.deployment.nftRegistry}.`);
  }
  if (listing.active && listing.collection.toLowerCase() !== collection.toLowerCase()) {
    warnings.push("The stored listing collection does not match the requested collection.");
  }
  return {
    ...baseResult(runtime, "market status"),
    market: { address: market },
    collection,
    tokenId: tokenId.toString(),
    owner,
    registered,
    listing: listingJson(listing),
    executable,
    approval: {
      market,
      getApproved: approval.tokenApproved,
      isApprovedForAll: approval.isApprovedForAll,
      approvedForMarket: approval.approvedForMarket,
    },
    warnings: [...new Set(warnings)],
  };
}
