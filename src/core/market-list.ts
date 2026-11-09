import { buildMarketListCall, buildNftApproveCall } from "../calldata.js";
import { CliError } from "../errors.js";
import { formatBnb, formatUnixSeconds, parseAddress, parseBnb, parseUint } from "../lib/parse.js";
import { previewCallAndRecord, previewWarnings, type PreviewEnvelope } from "../preview.js";
import type { Runtime } from "../runtime.js";
import { loadWalletForPreview } from "../wallet.js";
import { nftRegistryAbi } from "../abis.js";
import {
  assertChain,
  baseResult,
  listingJson,
  readApprovalStatus,
  readLatestTimestamp,
  readListing,
  readOwnerOf,
  requireAddress,
  sameAddress,
  type CommandResult,
} from "./common.js";

export interface MarketListOptions {
  collection: string;
  tokenId: string;
  price: string;
  deadline?: string;
}

const MAX_UINT64 = 2n ** 64n - 1n;

/**
 * Preflight an Agentmarket listing. If the market is not approved for the NFT,
 * returns status=needsApproval with an approve preview and does NOT preview the
 * list. With approval in place it previews Agentmarket.list.
 */
export async function runMarketList(runtime: Runtime, options: MarketListOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const tokenId = parseUint(options.tokenId, "--token-id");
  const price = parseBnb(options.price, "--price");
  const deadline = options.deadline === undefined ? 0n : parseUint(options.deadline, "--deadline", MAX_UINT64);
  const market = requireAddress(runtime, "agentmarket");
  const registry = requireAddress(runtime, "nftRegistry");

  if (deadline !== 0n) {
    const now = await readLatestTimestamp(runtime.publicClient);
    if (deadline <= now) {
      throw new CliError(
        "INVALID_DEADLINE",
        `--deadline ${deadline} is not in the future (latest block timestamp ${now}).`,
        { deadline: deadline.toString(), now: now.toString() },
      );
    }
  }

  const wallet = await loadWalletForPreview(runtime.baw);
  const registered = await runtime.publicClient.readContract({
    address: registry,
    abi: nftRegistryAbi,
    functionName: "isRegistered",
    args: [collection],
  });
  if (!registered) {
    throw new CliError(
      "COLLECTION_NOT_REGISTERED",
      `Collection ${collection} is not registered in the NFT registry ${registry}; Agentmarket only lists registered collections.`,
      { collection, registry },
    );
  }

  const owner = await readOwnerOf(runtime.publicClient, collection, tokenId);
  if (!sameAddress(owner, wallet.address)) {
    throw new CliError(
      "NOT_TOKEN_OWNER",
      `Only the token owner can list it. ownerOf(${tokenId}) is ${owner}; the connected wallet is ${wallet.address}.`,
      { collection, tokenId: tokenId.toString(), owner, wallet: wallet.address },
    );
  }

  const [existingListing, approval] = await Promise.all([
    readListing(runtime.publicClient, market, collection, tokenId),
    readApprovalStatus(runtime.publicClient, collection, tokenId, owner, market),
  ]);

  const warnings: string[] = [];
  if (approval.isApprovedForAll) {
    warnings.push(
      "Agentmarket is approved for all tokens in this collection. approve-all survives NFT transfers: moving the token away does not cancel this listing, and revoking approval does not cancel it either. Use `agentmarket market cancel` to cancel.",
    );
  }
  if (existingListing.active && sameAddress(existingListing.seller, wallet.address)) {
    warnings.push("This token already has an active listing from this wallet; the new list call overwrites it.");
  }

  const base = {
    ...baseResult(runtime, "market list"),
    wallet,
    status: "preview",
    collection,
    tokenId: tokenId.toString(),
    registry,
    owner,
    priceWei: price.toString(),
    priceBnb: formatBnb(price),
    deadline: deadline.toString(),
    deadlineIso: formatUnixSeconds(deadline),
    market: { address: market },
    existingListing: existingListing.active ? listingJson(existingListing) : null,
    approval: {
      market,
      getApproved: approval.tokenApproved,
      isApprovedForAll: approval.isApprovedForAll,
      approvedForMarket: approval.approvedForMarket,
    },
  };

  if (!approval.approvedForMarket) {
    const approveCall = buildNftApproveCall(collection, market, tokenId);
    const approveEnvelope = await previewCallAndRecord(runtime, wallet.address, approveCall);
    return {
      ...base,
      status: "needsApproval",
      needsApproval: [
        {
          kind: "approve",
          token: collection,
          tokenId: tokenId.toString(),
          spender: market,
          current: {
            getApproved: approval.tokenApproved,
            isApprovedForAll: approval.isApprovedForAll,
          },
          reason: "Agentmarket is not approved for this token",
          preview: approveEnvelope.preview,
          requestId: approveEnvelope.preview.requestId,
          nextCommand: approveEnvelope.preview.nextCommand,
        },
      ],
      approveAllCommand: `agentmarket nft approve-all --collection ${collection}`,
      next: {
        note: "Approve the market first (single-token approve is previewed above; approve-all is an alternative), execute it, then re-run market list.",
        command: approveEnvelope.preview.nextCommand,
        rePreviewCommand: `agentmarket market list --collection ${collection} --token-id ${tokenId} --price ${options.price}${
          options.deadline === undefined ? "" : ` --deadline ${options.deadline}`
        }`,
      },
      call: null,
      preview: null,
      warnings: [...new Set([...warnings, ...previewWarnings(approveEnvelope.preview)])],
    };
  }

  const call = buildMarketListCall({ market, collection, tokenId, price, deadline });
  const envelope: PreviewEnvelope = await previewCallAndRecord(runtime, wallet.address, call);
  return {
    ...base,
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand. The listing fee is snapshotted when list is executed.",
      command: envelope.preview.nextCommand,
    },
    warnings: [...new Set([...warnings, ...previewWarnings(envelope.preview)])],
  };
}
