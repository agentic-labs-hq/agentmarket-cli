import { decodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { nftAbi } from "../src/abis.js";
import { runNftApprove, runNftApproveAll } from "../src/core/nft-approve.js";
import { BSC_ADDRESS, connectedBawHandler, ok, removeDir } from "./helpers/fake-baw.js";
import {
  COLLECTION,
  MARKET,
  OTHER_ADDRESS,
  fakePublicClient,
  type ReadContractCall,
} from "./helpers/fake-client.js";
import { harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

const OWNER = BSC_ADDRESS as Address;

function reads(options: { owner?: Address; approved?: Address; approvedForAll?: boolean } = {}) {
  return (call: ReadContractCall): unknown => {
    switch (call.functionName) {
      case "ownerOf":
        return options.owner ?? OWNER;
      case "getApproved":
        return options.approved ?? zeroAddress;
      case "isApprovedForAll":
        return options.approvedForAll ?? false;
      default:
        throw new Error(`Unexpected read: ${call.functionName}`);
    }
  };
}

function previewCalls(fake: { calls: string[][] }) {
  return fake.calls.filter((call) => call[0] === "contract-call" && call[1] === "preview");
}

describe("nft approve", () => {
  it("defaults the spender to Agentmarket and previews approve(market, tokenId)", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-approve" }) }),
    });
    dirs.push(dir);
    const result = await runNftApprove(runtime, { collection: COLLECTION, tokenId: "7", revoke: false });
    expect(result.approval).toMatchObject({ spender: MARKET, revoke: false, owner: OWNER });
    const calls = previewCalls(fake);
    expect(calls).toHaveLength(1);
    expect(calls[0]![calls[0]!.indexOf("--to") + 1]).toBe(COLLECTION);
    const decoded = decodeFunctionData({
      abi: nftAbi,
      data: calls[0]![calls[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([MARKET, 7n]);
  });

  it("encodes approve(0) for --revoke and uses an explicit spender for display", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);
    const result = await runNftApprove(runtime, {
      collection: COLLECTION,
      tokenId: "7",
      revoke: true,
      spender: OTHER_ADDRESS,
    });
    expect(result.approval).toMatchObject({ spender: zeroAddress, revoke: true });
    const decoded = decodeFunctionData({
      abi: nftAbi,
      data: previewCalls(fake)[0]![previewCalls(fake)[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.args).toEqual([zeroAddress, 7n]);
  });

  it("rejects a non-owner without previewing", async () => {
    const { runtime, fake, dir } = harness(
      fakePublicClient({ readContract: reads({ owner: OTHER_ADDRESS }) }),
      { handler: connectedBawHandler() },
    );
    dirs.push(dir);
    await expect(
      runNftApprove(runtime, { collection: COLLECTION, tokenId: "7", revoke: false }),
    ).rejects.toMatchObject({ code: "NOT_TOKEN_OWNER" });
    expect(previewCalls(fake)).toHaveLength(0);
  });
});

describe("nft approve-all", () => {
  it("defaults the operator to Agentmarket and previews setApprovalForAll(true)", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);
    const result = await runNftApproveAll(runtime, { collection: COLLECTION, revoke: false });
    expect(result.approval).toMatchObject({ operator: MARKET, approved: true });
    const decoded = decodeFunctionData({
      abi: nftAbi,
      data: previewCalls(fake)[0]![previewCalls(fake)[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.functionName).toBe("setApprovalForAll");
    expect(decoded.args).toEqual([MARKET, true]);
  });

  it("encodes setApprovalForAll(operator, false) for --revoke", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads({ approvedForAll: true }) }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);
    const result = await runNftApproveAll(runtime, { collection: COLLECTION, revoke: true });
    expect(result.approval).toMatchObject({ operator: MARKET, approved: false, currentlyApproved: true });
    const decoded = decodeFunctionData({
      abi: nftAbi,
      data: previewCalls(fake)[0]![previewCalls(fake)[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.args).toEqual([MARKET, false]);
  });
});
