import { encodeAbiParameters, zeroAddress, type Address } from "viem";

import { nftAbi, transferPolicyAbi } from "../abis.js";
import { buildMarketBuyCall } from "../calldata.js";
import { deploymentAddress } from "../deployment.js";
import { CliError } from "../errors.js";
import { formatBnb, formatUnixSeconds, parseAddress, parseUint } from "../lib/parse.js";
import { previewCallAndRecord, previewWarnings } from "../preview.js";
import type { Runtime } from "../runtime.js";
import { loadWalletForPreview } from "../wallet.js";
import {
  assertChain,
  baseResult,
  listingJson,
  readApprovalStatus,
  readIsExecutable,
  readLatestTimestamp,
  readListing,
  readOwnerOf,
  sameAddress,
  shortError,
  type CommandResult,
  type ListingView,
} from "./common.js";

export interface MarketBuyOptions {
  collection: string;
  tokenId: string;
}

async function explainInexecutable(
  runtime: Runtime,
  market: Address,
  listing: ListingView,
): Promise<string[]> {
  const reasons: string[] = [];
  if (listing.paymentAsset !== zeroAddress) {
    reasons.push(`Unsupported payment asset ${listing.paymentAsset}; V1 settles in native BNB only.`);
  }
  try {
    const now = await readLatestTimestamp(runtime.publicClient);
    if (listing.deadline !== 0n && now > listing.deadline) {
      reasons.push(`Listing expired at ${formatUnixSeconds(listing.deadline) ?? listing.deadline.toString()}.`);
    }
  } catch (error) {
    reasons.push(`Could not read the latest block timestamp: ${shortError(error)}`);
  }
  try {
    const owner = await readOwnerOf(runtime.publicClient, listing.collection, listing.tokenId);
    if (!sameAddress(owner, listing.seller)) {
      reasons.push(`Seller ${listing.seller} is no longer the owner (ownerOf is ${owner}).`);
    }
  } catch (error) {
    reasons.push(`Could not read the token owner: ${shortError(error)}`);
  }
  try {
    const approval = await readApprovalStatus(
      runtime.publicClient,
      listing.collection,
      listing.tokenId,
      listing.seller,
      market,
    );
    if (!approval.approvedForMarket) {
      reasons.push("The seller has not approved Agentmarket for this token.");
    }
  } catch (error) {
    reasons.push(`Could not read market approval: ${shortError(error)}`);
  }
  if (reasons.length === 0) {
    reasons.push("isExecutable returned false; the listing may have changed. Re-run market status.");
  }
  return reasons;
}

/** Read a listing, require it to be executable, and preview Agentmarket.buy. */
export async function runMarketBuy(runtime: Runtime, options: MarketBuyOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const tokenId = parseUint(options.tokenId, "--token-id");
  const market = deploymentAddress(runtime.deployment, "agentmarket");
  const wallet = await loadWalletForPreview(runtime.baw);
  const listing = await readListing(runtime.publicClient, market, collection, tokenId);

  if (!listing.active) {
    throw new CliError("LISTING_NOT_ACTIVE", `No active listing exists for ${collection} #${tokenId}.`, {
      market,
      collection,
      tokenId: tokenId.toString(),
    });
  }
  if (sameAddress(listing.seller, wallet.address)) {
    throw new CliError("SELF_PURCHASE", "The connected wallet is the listing seller; Agentmarket rejects self-purchase.", {
      market,
      collection,
      tokenId: tokenId.toString(),
      wallet: wallet.address,
    });
  }

  const warnings: string[] = [];
  const executable = await readIsExecutable(runtime.publicClient, market, collection, tokenId);
  if (!executable) {
    const reasons = await explainInexecutable(runtime, market, listing);
    throw new CliError(
      "LISTING_NOT_EXECUTABLE",
      `Listing ${collection} #${tokenId} is not executable: ${reasons.join(" ")}`,
      {
        market,
        collection,
        tokenId: tokenId.toString(),
        listing: listingJson(listing),
        reasons,
      },
    );
  }

  try {
    const policy = await runtime.publicClient.readContract({
      address: collection,
      abi: nftAbi,
      functionName: "policy",
    });
    const context = encodeAbiParameters([{ type: "uint8" }], [0]);
    const [allowed, reason] = await runtime.publicClient.readContract({
      address: policy,
      abi: transferPolicyAbi,
      functionName: "canTransfer",
      args: [collection, listing.seller, wallet.address, market, context],
    });
    if (!allowed) {
      throw new CliError(
        "TRANSFER_NOT_ALLOWED",
        `The collection policy denies this transfer (reason ${reason}). The seller or the connected wallet is not eligible; the chain would revert.`,
        { policy, reason, seller: listing.seller, buyer: wallet.address, collection, tokenId: tokenId.toString() },
      );
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    warnings.push(`Policy preflight could not be completed: ${shortError(error)}`);
  }

  try {
    const balance = await runtime.publicClient.getBalance({ address: wallet.address });
    if (balance < listing.price) {
      warnings.push(
        `The wallet balance ${formatBnb(balance)} BNB is below the listing price ${formatBnb(listing.price)} BNB (gas is extra).`,
      );
    }
  } catch {
    // A balance read failure must not block previewing an otherwise valid listing.
  }

  const call = buildMarketBuyCall(market, collection, tokenId, listing.price);
  const envelope = await previewCallAndRecord(runtime, wallet.address, call, { requireSimulationOk: true });

  return {
    ...baseResult(runtime, "market buy"),
    wallet,
    collection,
    tokenId: tokenId.toString(),
    listing: listingJson(listing),
    executable: true,
    valueWei: listing.price.toString(),
    priceBnb: formatBnb(listing.price),
    feeBps: listing.feeBps,
    marketplaceFeeWei: ((listing.price * BigInt(listing.feeBps)) / 10_000n).toString(),
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand. The BAW value is exactly the listing price in wei.",
      command: envelope.preview.nextCommand,
    },
    warnings: [...new Set([...warnings, ...previewWarnings(envelope.preview)])],
  };
}
