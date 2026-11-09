import { decodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { agentmarketAbi, nftAbi } from "../src/abis.js";
import { runMarketList } from "../src/core/market-list.js";
import { CliError } from "../src/errors.js";
import { BSC_ADDRESS, connectedBawHandler, ok, removeDir } from "./helpers/fake-baw.js";
import {
  COLLECTION,
  MARKET,
  NFT_REGISTRY,
  TREASURY,
  VENUE_REGISTRY,
  fakePublicClient,
  type FakeClientOptions,
  type ReadContractCall,
} from "./helpers/fake-client.js";
import { harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

const OWNER = BSC_ADDRESS as Address;

function baseReads(overrides: {
  registered?: boolean;
  owner?: Address;
  approved?: Address;
  approvedForAll?: boolean;
  listingActive?: boolean;
  listingSeller?: Address;
} = {}) {
  return (call: ReadContractCall): unknown => {
    switch (call.functionName) {
      case "isRegistered":
        return overrides.registered ?? true;
      case "ownerOf":
        return overrides.owner ?? OWNER;
      case "getApproved":
        return overrides.approved ?? zeroAddress;
      case "isApprovedForAll":
        return overrides.approvedForAll ?? false;
      case "listingOf":
        return {
          order: {
            seller: overrides.listingSeller ?? OWNER,
            collection: COLLECTION,
            tokenId: 7n,
            price: 0n,
            paymentAsset: zeroAddress,
            deadline: 0n,
            nonce: 0n,
          },
          feeBps: 0,
          active: overrides.listingActive ?? false,
        };
      case "nftRegistry":
        return NFT_REGISTRY;
      case "venueRegistry":
        return VENUE_REGISTRY;
      case "treasury":
        return TREASURY;
      case "feeBps":
        return 100;
      case "maxFeeBps":
        return 500;
      case "governance":
      case "pendingGovernance":
        return zeroAddress;
      default:
        throw new Error(`Unexpected read: ${call.functionName}`);
    }
  };
}

function clientWithReads(reads: FakeClientOptions["readContract"]) {
  return fakePublicClient({ readContract: reads });
}

function previewCalls(fake: { calls: string[][] }) {
  return fake.calls.filter((call) => call[0] === "contract-call" && call[1] === "preview");
}

describe("market list preflight", () => {
  it("returns needsApproval with an approve preview and does not preview list", async () => {
    const publicClient = clientWithReads(baseReads({ approved: zeroAddress }));
    const { runtime, fake, journal, dir } = harness(publicClient, {
      handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-approve" }) }),
    });
    dirs.push(dir);

    const result = await runMarketList(runtime, { collection: COLLECTION, tokenId: "7", price: "0.5" });
    expect(result.status).toBe("needsApproval");
    expect(result.preview).toBeNull();
    expect(result.call).toBeNull();
    expect(result.priceWei).toBe("500000000000000000");
    expect(result.approveAllCommand).toContain("nft approve-all");
    const needsApproval = result.needsApproval as Array<Record<string, unknown>>;
    expect(needsApproval).toHaveLength(1);
    expect(needsApproval[0]).toMatchObject({ kind: "approve", spender: MARKET, requestId: "req-approve" });
    expect((needsApproval[0]!.preview as Record<string, unknown>).nextCommand).toBe(
      "agentmarket tx execute --request-id req-approve --confirm",
    );

    const calls = previewCalls(fake);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call[call.indexOf("--to") + 1]).toBe(COLLECTION);
    const decoded = decodeFunctionData({
      abi: nftAbi,
      data: call[call.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([MARKET, 7n]);

    // The preview is bound to chain + wallet and single-use.
    const record = await journal.consumePreview("req-approve", { chainId: 56, wallet: BSC_ADDRESS });
    expect(record).toMatchObject({ action: "nft approve", functionName: "approve", chainId: 56 });
    await expect(
      journal.consumePreview("req-approve", { chainId: 56, wallet: BSC_ADDRESS }),
    ).rejects.toMatchObject({ code: "PREVIEW_ALREADY_USED" });
  });

  it("previews Agentmarket.list once the market is approved", async () => {
    const publicClient = clientWithReads(baseReads({ approved: MARKET }));
    const { runtime, fake, journal, dir } = harness(publicClient, {
      handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-list" }) }),
    });
    dirs.push(dir);

    const result = await runMarketList(runtime, { collection: COLLECTION, tokenId: "7", price: "0.5" });
    expect(result.status).toBe("preview");
    expect((result.approval as Record<string, unknown>).approvedForMarket).toBe(true);
    expect(result.preview).toMatchObject({ requestId: "req-list" });
    expect((result.preview as Record<string, unknown>).nextCommand).toBe(
      "agentmarket tx execute --request-id req-list --confirm",
    );

    const calls = previewCalls(fake);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call[call.indexOf("--to") + 1]).toBe(MARKET);
    expect(call[call.indexOf("--value") + 1]).toBe("0");
    const decoded = decodeFunctionData({
      abi: agentmarketAbi,
      data: call[call.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.functionName).toBe("list");
    expect(decoded.args).toEqual([COLLECTION, 7n, 500_000_000_000_000_000n, 0n]);

    const record = await journal.consumePreview("req-list", { chainId: 56, wallet: BSC_ADDRESS });
    expect(record).toMatchObject({ action: "market list", functionName: "list", value: "0" });
  });

  it("rejects unregistered collections, non-owners, and past deadlines before previewing", async () => {
    const unregistered = clientWithReads(baseReads({ registered: false }));
    const first = harness(unregistered, { handler: connectedBawHandler() });
    dirs.push(first.dir);
    await expect(
      runMarketList(first.runtime, { collection: COLLECTION, tokenId: "7", price: "1" }),
    ).rejects.toMatchObject({ code: "COLLECTION_NOT_REGISTERED" });
    expect(previewCalls(first.fake)).toHaveLength(0);

    const nonOwner = clientWithReads(baseReads({ owner: MARKET }));
    const second = harness(nonOwner, { handler: connectedBawHandler() });
    dirs.push(second.dir);
    await expect(
      runMarketList(second.runtime, { collection: COLLECTION, tokenId: "7", price: "1" }),
    ).rejects.toMatchObject({ code: "NOT_TOKEN_OWNER" });
    expect(previewCalls(second.fake)).toHaveLength(0);

    const pastDeadline = clientWithReads(baseReads());
    const third = harness(pastDeadline, {
      handler: connectedBawHandler(),
    });
    dirs.push(third.dir);
    const error = await runMarketList(third.runtime, {
      collection: COLLECTION,
      tokenId: "7",
      price: "1",
      deadline: "1600000000",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe("INVALID_DEADLINE");
    expect(previewCalls(third.fake)).toHaveLength(0);
  });

  it("warns when the wallet already has an active listing", async () => {
    const publicClient = clientWithReads(baseReads({ approved: MARKET, listingActive: true }));
    const { runtime, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);
    const result = await runMarketList(runtime, { collection: COLLECTION, tokenId: "7", price: "1" });
    expect((result.warnings as string[]).join(" ")).toContain("overwrites");
  });
});
