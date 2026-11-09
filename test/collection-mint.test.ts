import { decodeFunctionData, type Hex } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { nftAbi } from "../src/abis.js";
import { runCollectionMint } from "../src/core/collection-mint.js";
import { BSC_ADDRESS, connectedBawHandler, ok, removeDir } from "./helpers/fake-baw.js";
import {
  COLLECTION,
  OTHER_ADDRESS,
  POLICY,
  fakePublicClient,
  type ReadContractCall,
} from "./helpers/fake-client.js";
import { harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

function reads(options: { creator?: string; maxSupply?: bigint; totalMinted?: bigint } = {}) {
  return (call: ReadContractCall): unknown => {
    switch (call.functionName) {
      case "name":
        return "Example";
      case "symbol":
        return "EGT";
      case "creator":
        return options.creator ?? BSC_ADDRESS;
      case "policy":
        return POLICY;
      case "factory":
        return OTHER_ADDRESS;
      case "maxSupply":
        return options.maxSupply ?? 10n;
      case "totalMinted":
        return options.totalMinted ?? 2n;
      case "baseURI":
        return "ipfs://base/";
      case "metadataURI":
        return "ipfs://meta.json";
      case "metadataResolver":
        return "0x0000000000000000000000000000000000000000";
      default:
        throw new Error(`Unexpected read: ${call.functionName}`);
    }
  };
}

function previewCalls(fake: { calls: string[][] }) {
  return fake.calls.filter((call) => call[0] === "contract-call" && call[1] === "preview");
}

describe("collection mint", () => {
  it("previews mint(to, count) for a single recipient", async () => {
    const { runtime, fake, dir } = harness(
      fakePublicClient({ readContract: reads() }),
      { handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-mint" }) }) },
    );
    dirs.push(dir);

    const result = await runCollectionMint(runtime, {
      collection: COLLECTION,
      to: OTHER_ADDRESS,
      count: "2",
    });
    expect(result.mode).toBe("mint");
    expect(result.totalCount).toBe("2");
    expect(result.collection).toMatchObject({ remainingSupplyBefore: "8", maxSupply: "10", totalMinted: "2" });

    const calls = previewCalls(fake);
    expect(calls).toHaveLength(1);
    expect(calls[0]![calls[0]!.indexOf("--to") + 1]).toBe(COLLECTION);
    const decoded = decodeFunctionData({ abi: nftAbi, data: calls[0]![calls[0]!.indexOf("--inputData") + 1] as Hex });
    expect(decoded.functionName).toBe("mint");
    expect(decoded.args).toEqual([OTHER_ADDRESS, 2n]);
  });

  it("previews mintBatch for multiple recipients", async () => {
    const { runtime, fake, dir } = harness(
      fakePublicClient({ readContract: reads() }),
      { handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-batch" }) }) },
    );
    dirs.push(dir);

    const result = await runCollectionMint(runtime, {
      collection: COLLECTION,
      recipients: [`${OTHER_ADDRESS}:2`, `${BSC_ADDRESS}:1`],
    });
    expect(result.mode).toBe("mintBatch");
    expect(result.totalCount).toBe("3");
    expect(result.recipients).toEqual([
      { address: OTHER_ADDRESS, count: "2" },
      { address: BSC_ADDRESS, count: "1" },
    ]);

    const calls = previewCalls(fake);
    const decoded = decodeFunctionData({ abi: nftAbi, data: calls[0]![calls[0]!.indexOf("--inputData") + 1] as Hex });
    expect(decoded.functionName).toBe("mintBatch");
    expect(decoded.args).toEqual([[OTHER_ADDRESS, BSC_ADDRESS], [2n, 1n]]);
  });

  it("rejects a non-creator wallet and an over-supply mint before previewing", async () => {
    const nonCreator = harness(
      fakePublicClient({ readContract: reads({ creator: OTHER_ADDRESS }) }),
      { handler: connectedBawHandler() },
    );
    dirs.push(nonCreator.dir);
    await expect(
      runCollectionMint(nonCreator.runtime, { collection: COLLECTION, to: OTHER_ADDRESS, count: "1" }),
    ).rejects.toMatchObject({ code: "NOT_COLLECTION_CREATOR" });
    expect(previewCalls(nonCreator.fake)).toHaveLength(0);

    const overSupply = harness(fakePublicClient({ readContract: reads() }), { handler: connectedBawHandler() });
    dirs.push(overSupply.dir);
    await expect(
      runCollectionMint(overSupply.runtime, { collection: COLLECTION, to: OTHER_ADDRESS, count: "9" }),
    ).rejects.toMatchObject({ code: "SUPPLY_EXCEEDED" });
    expect(previewCalls(overSupply.fake)).toHaveLength(0);
  });

  it("rejects mixed single/batch flags, missing flags, and non-positive counts", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);
    await expect(
      runCollectionMint(runtime, {
        collection: COLLECTION,
        to: OTHER_ADDRESS,
        count: "1",
        recipients: [`${BSC_ADDRESS}:1`],
      }),
    ).rejects.toMatchObject({ code: "USAGE" });
    await expect(runCollectionMint(runtime, { collection: COLLECTION })).rejects.toMatchObject({ code: "USAGE" });
    await expect(
      runCollectionMint(runtime, { collection: COLLECTION, recipients: [`${BSC_ADDRESS}:0`] }),
    ).rejects.toMatchObject({ code: "INVALID_INTEGER" });
    expect(previewCalls(fake)).toHaveLength(0);
  });
});
