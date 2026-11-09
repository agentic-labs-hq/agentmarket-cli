import { buildMarketCancelCall } from "../calldata.js";
import { CliError } from "../errors.js";
import { parseAddress, parseUint } from "../lib/parse.js";
import { previewCallAndRecord, previewWarnings } from "../preview.js";
import type { Runtime } from "../runtime.js";
import { loadWalletForPreview } from "../wallet.js";
import {
  assertChain,
  baseResult,
  listingJson,
  readListing,
  requireAddress,
  sameAddress,
  type CommandResult,
} from "./common.js";

export interface MarketCancelOptions {
  collection: string;
  tokenId: string;
}

/** Build Agentmarket.cancel and preview it. Only the listing seller can cancel. */
export async function runMarketCancel(runtime: Runtime, options: MarketCancelOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const tokenId = parseUint(options.tokenId, "--token-id");
  const market = requireAddress(runtime, "agentmarket");

  const wallet = await loadWalletForPreview(runtime.baw);
  const listing = await readListing(runtime.publicClient, market, collection, tokenId);
  if (!listing.active) {
    throw new CliError("LISTING_NOT_ACTIVE", `No active listing exists for ${collection} #${tokenId}.`, {
      market,
      collection,
      tokenId: tokenId.toString(),
    });
  }
  if (!sameAddress(listing.seller, wallet.address)) {
    throw new CliError(
      "NOT_LISTING_SELLER",
      `Only the listing seller can cancel. seller is ${listing.seller}; the connected wallet is ${wallet.address}.`,
      { market, collection, tokenId: tokenId.toString(), seller: listing.seller, wallet: wallet.address },
    );
  }

  const call = buildMarketCancelCall(market, collection, tokenId);
  const envelope = await previewCallAndRecord(runtime, wallet.address, call);

  return {
    ...baseResult(runtime, "market cancel"),
    wallet,
    listing: listingJson(listing),
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand.",
      command: envelope.preview.nextCommand,
    },
    warnings: previewWarnings(envelope.preview),
  };
}
