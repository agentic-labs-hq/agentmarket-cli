import { zeroAddress } from "viem";

import { nftAbi } from "../abis.js";
import { buildNftApprovalForAllCall, buildNftApproveCall } from "../calldata.js";
import { CliError } from "../errors.js";
import { parseAddress, parseUint } from "../lib/parse.js";
import { previewCallAndRecord, previewWarnings } from "../preview.js";
import type { Runtime } from "../runtime.js";
import { loadWalletForPreview } from "../wallet.js";
import {
  assertChain,
  baseResult,
  readApprovalStatus,
  readOwnerOf,
  requireAddress,
  sameAddress,
  type CommandResult,
} from "./common.js";

export interface NftApproveOptions {
  collection: string;
  tokenId: string;
  spender?: string;
  revoke: boolean;
}

/** Build ERC-721 approve(spender, tokenId) and preview it through BAW. */
export async function runNftApprove(runtime: Runtime, options: NftApproveOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const tokenId = parseUint(options.tokenId, "--token-id");
  const spender =
    options.spender === undefined ? requireAddress(runtime, "agentmarket") : parseAddress(options.spender, "--spender");
  const target = options.revoke ? zeroAddress : spender;

  const wallet = await loadWalletForPreview(runtime.baw);
  const owner = await readOwnerOf(runtime.publicClient, collection, tokenId);
  if (!sameAddress(owner, wallet.address)) {
    throw new CliError(
      "NOT_TOKEN_OWNER",
      `Only the token owner can approve. ownerOf(${tokenId}) is ${owner}; the connected wallet is ${wallet.address}.`,
      { collection, tokenId: tokenId.toString(), owner, wallet: wallet.address },
    );
  }
  const current = await readApprovalStatus(
    runtime.publicClient,
    collection,
    tokenId,
    owner,
    options.revoke ? spender : target,
  );
  const call = buildNftApproveCall(collection, target, tokenId);
  const envelope = await previewCallAndRecord(runtime, wallet.address, call);

  return {
    ...baseResult(runtime, "nft approve"),
    wallet,
    approval: {
      collection,
      tokenId: tokenId.toString(),
      spender: target,
      requestedSpender: spender,
      revoke: options.revoke,
      owner,
      current: {
        getApproved: current.tokenApproved,
        isApprovedForAll: current.isApprovedForAll,
      },
    },
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand.",
      command: envelope.preview.nextCommand,
    },
    warnings: previewWarnings(envelope.preview),
  };
}

export interface NftApproveAllOptions {
  collection: string;
  operator?: string;
  revoke: boolean;
}

/** Build ERC-721 setApprovalForAll(operator, approved) and preview it through BAW. */
export async function runNftApproveAll(runtime: Runtime, options: NftApproveAllOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const operator =
    options.operator === undefined
      ? requireAddress(runtime, "agentmarket")
      : parseAddress(options.operator, "--operator");
  const approved = !options.revoke;

  const wallet = await loadWalletForPreview(runtime.baw);
  let currentlyApproved: boolean | null = null;
  try {
    currentlyApproved = await runtime.publicClient.readContract({
      address: collection,
      abi: nftAbi,
      functionName: "isApprovedForAll",
      args: [wallet.address, operator],
    });
  } catch {
    currentlyApproved = null;
  }

  const call = buildNftApprovalForAllCall(collection, operator, approved);
  const envelope = await previewCallAndRecord(runtime, wallet.address, call);
  const warnings = previewWarnings(envelope.preview);
  if (approved) {
    warnings.push(
      "approve-all persists across NFT transfers: moving the token away does not cancel an existing listing, and revoking approval does not cancel it either. Use `agentmarket market cancel` to cancel.",
    );
  }

  return {
    ...baseResult(runtime, "nft approve-all"),
    wallet,
    approval: {
      collection,
      operator,
      approved,
      revoke: options.revoke,
      currentlyApproved,
    },
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand.",
      command: envelope.preview.nextCommand,
    },
    warnings,
  };
}
