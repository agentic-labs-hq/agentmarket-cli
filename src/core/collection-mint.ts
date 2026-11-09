import { keccak256, toBytes, type Address } from "viem";

import { venueRegistryAbi } from "../abis.js";

import { buildCollectionMintBatchCall, buildCollectionMintCall } from "../calldata.js";
import { CliError, UsageError } from "../errors.js";
import { parseAddress, parsePositiveUint, parseRecipientCount, type RecipientCount } from "../lib/parse.js";
import { previewCallAndRecord, previewWarnings } from "../preview.js";
import type { Runtime } from "../runtime.js";
import { loadWalletForPreview } from "../wallet.js";
import {
  assertChain,
  baseResult,
  readCollection,
  sameAddress,
  shortError,
  type CommandResult,
} from "./common.js";

export interface CollectionMintOptions {
  collection: string;
  to?: string;
  count?: string;
  recipients?: string[];
}

const MAX_UINT256 = 2n ** 256n - 1n;

function resolveRecipients(options: CollectionMintOptions): RecipientCount[] {
  const recipientFlags = options.recipients ?? [];
  const hasTo = options.to !== undefined;
  const hasCount = options.count !== undefined;
  if (recipientFlags.length > 0 && (hasTo || hasCount)) {
    throw new UsageError("Use either --to/--count or one or more --recipient values, not both.");
  }
  if (recipientFlags.length > 0) {
    return recipientFlags.map((value, index) => parseRecipientCount(value, index));
  }
  if (!hasTo || !hasCount) {
    throw new UsageError("collection mint requires --to and --count, or one or more --recipient <address>:<count>.");
  }
  return [
    {
      address: parseAddress(options.to!, "--to"),
      count: parsePositiveUint(options.count!, "--count"),
    },
  ];
}

/** Build AgenticNFT.mint / mintBatch calldata and preview it through BAW. */
export async function runCollectionMint(runtime: Runtime, options: CollectionMintOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const recipients = resolveRecipients(options);
  const totalCount = recipients.reduce((sum, item) => {
    const next = sum + item.count;
    if (next > MAX_UINT256) throw new CliError("INVALID_INTEGER", "--count total exceeds uint256.");
    return next;
  }, 0n);

  const wallet = await loadWalletForPreview(runtime.baw);
  const info = await readCollection(runtime.publicClient, collection);
  if (!sameAddress(info.creator, wallet.address)) {
    throw new CliError(
      "NOT_COLLECTION_CREATOR",
      `Only the collection creator can mint. creator() is ${info.creator}; the connected wallet is ${wallet.address}.`,
      { collection, creator: info.creator, wallet: wallet.address },
    );
  }
  const remaining = info.maxSupply - info.totalMinted;
  if (totalCount > remaining) {
    throw new CliError(
      "SUPPLY_EXCEEDED",
      `Mint of ${totalCount} exceeds the remaining supply ${remaining} (maxSupply ${info.maxSupply}, totalMinted ${info.totalMinted}).`,
      {
        collection,
        requested: totalCount.toString(),
        remaining: remaining.toString(),
        maxSupply: info.maxSupply.toString(),
        totalMinted: info.totalMinted.toString(),
      },
    );
  }

  const warnings: string[] = [];
  const venue = runtime.deployment.venueRegistry;
  if (venue !== undefined) {
    const nftFacilityTypes = new Set(
      ["NFT_VAULT", "NFT_LAUNCH", "NFT_LOCKER", "NFT_GAME", "NFT_ESCROW"].map((kind) =>
        keccak256(toBytes(kind)).toLowerCase(),
      ),
    );
    for (const item of recipients) {
      try {
        const isFacility = await runtime.publicClient.readContract({
          address: venue,
          abi: venueRegistryAbi,
          functionName: "isFacility",
          args: [item.address],
        });
        if (!isFacility) continue;
        const facilityType = await runtime.publicClient.readContract({
          address: venue,
          abi: venueRegistryAbi,
          functionName: "facilityType",
          args: [item.address],
        });
        if (!nftFacilityTypes.has(facilityType.toLowerCase())) {
          warnings.push(
            `Recipient ${item.address} is a facility of type ${facilityType}, not one of the five NFT facility types. The NFT may have no transfer-out path; use an agent or an NFT facility.`,
          );
        }
      } catch (error) {
        warnings.push(`Could not check recipient ${item.address} facility type: ${shortError(error)}`);
      }
    }
  }

  const call =
    recipients.length === 1
      ? buildCollectionMintCall(collection, recipients[0]!.address, recipients[0]!.count)
      : buildCollectionMintBatchCall(
          collection,
          recipients.map((item) => item.address),
          recipients.map((item) => item.count),
        );
  const envelope = await previewCallAndRecord(runtime, wallet.address, call);

  return {
    ...baseResult(runtime, "collection mint"),
    wallet,
    collection: {
      address: collection,
      name: info.name,
      symbol: info.symbol,
      creator: info.creator,
      maxSupply: info.maxSupply.toString(),
      totalMinted: info.totalMinted.toString(),
      remainingSupplyBefore: remaining.toString(),
    },
    recipients: recipients.map((item: RecipientCount) => ({
      address: item.address as Address,
      count: item.count.toString(),
    })),
    totalCount: totalCount.toString(),
    mode: recipients.length === 1 ? "mint" : "mintBatch",
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand. The Minted event records the first token id and count.",
      command: envelope.preview.nextCommand,
    },
    warnings: [...warnings, ...previewWarnings(envelope.preview)],
  };
}
