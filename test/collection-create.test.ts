import { decodeFunctionData, getAddress, zeroAddress, type Hex } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { nftFactoryAbi } from "../src/abis.js";
import { runCollectionCreate } from "../src/core/collection-create.js";
import { BSC_ADDRESS, connectedBawHandler, ok, removeDir } from "./helpers/fake-baw.js";
import {
  NFT_FACTORY,
  NFT_REGISTRY,
  POLICY,
  POLICY_REGISTRY,
  fakePublicClient,
  type ReadContractCall,
} from "./helpers/fake-client.js";
import { harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

const RESOLVER = getAddress("0x900000000000000000000000000000000000000d");

function reads(options: { allowed?: boolean } = {}) {
  return (call: ReadContractCall): unknown => {
    switch (call.functionName) {
      case "currentPolicy":
        return POLICY;
      case "isPolicyAllowed":
        return options.allowed ?? true;
      case "policyRegistry":
        return POLICY_REGISTRY;
      case "assetRegistry":
        return NFT_REGISTRY;
      default:
        throw new Error(`Unexpected read: ${call.functionName}`);
    }
  };
}

function previewCalls(fake: { calls: string[][] }) {
  return fake.calls.filter((call) => call[0] === "contract-call" && call[1] === "preview");
}

const BASE = {
  name: "Example Collection",
  symbol: "EXAMPLE",
  maxSupply: "100",
  baseUri: "ipfs://base/",
  metadataUri: "ipfs://meta.json",
};

describe("collection create", () => {
  it("resolves the current policy but encodes the zero-address sentinel", async () => {
    const { runtime, fake, journal, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-create" }) }),
    });
    dirs.push(dir);

    const result = await runCollectionCreate(runtime, BASE);
    expect(result.collection).toMatchObject({
      policy: POLICY,
      policyArgument: zeroAddress,
      policySource: "current",
      creator: BSC_ADDRESS,
      factory: NFT_FACTORY,
      address: null,
    });

    const calls = previewCalls(fake);
    expect(calls).toHaveLength(1);
    expect(calls[0]![calls[0]!.indexOf("--to") + 1]).toBe(NFT_FACTORY);
    expect(calls[0]![calls[0]!.indexOf("--value") + 1]).toBe("0");
    const decoded = decodeFunctionData({
      abi: nftFactoryAbi,
      data: calls[0]![calls[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.functionName).toBe("createCollection");
    expect(decoded.args).toEqual([
      "Example Collection",
      "EXAMPLE",
      zeroAddress,
      100n,
      "ipfs://base/",
      "ipfs://meta.json",
      zeroAddress,
    ]);

    const record = await journal.consumePreview("req-create", { chainId: 56, wallet: BSC_ADDRESS });
    expect(record).toMatchObject({ action: "collection create", functionName: "createCollection" });
  });

  it("honors an explicit policy and resolver", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);

    const result = await runCollectionCreate(runtime, {
      ...BASE,
      policy: POLICY,
      resolver: RESOLVER,
    });
    expect(result.collection).toMatchObject({ policy: POLICY, policyArgument: POLICY, policySource: "explicit" });
    const decoded = decodeFunctionData({
      abi: nftFactoryAbi,
      data: previewCalls(fake)[0]![previewCalls(fake)[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.args[2]).toBe(POLICY);
    expect(decoded.args[6]).toBe(RESOLVER);
  });

  it("rejects a policy that is not allowed and a zero supply before previewing", async () => {
    const denied = harness(fakePublicClient({ readContract: reads({ allowed: false }) }), {
      handler: connectedBawHandler(),
    });
    dirs.push(denied.dir);
    await expect(
      runCollectionCreate(denied.runtime, { ...BASE, policy: POLICY }),
    ).rejects.toMatchObject({ code: "POLICY_NOT_ALLOWED" });
    expect(previewCalls(denied.fake)).toHaveLength(0);

    const zeroSupply = harness(fakePublicClient({ readContract: reads() }), { handler: connectedBawHandler() });
    dirs.push(zeroSupply.dir);
    await expect(runCollectionCreate(zeroSupply.runtime, { ...BASE, maxSupply: "0" })).rejects.toMatchObject({
      code: "INVALID_INTEGER",
    });
    expect(previewCalls(zeroSupply.fake)).toHaveLength(0);
  });

  it("allows an empty baseURI when a resolver is set", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);

    await runCollectionCreate(runtime, { ...BASE, baseUri: "", resolver: RESOLVER });
    const decoded = decodeFunctionData({
      abi: nftFactoryAbi,
      data: previewCalls(fake)[0]![previewCalls(fake)[0]!.indexOf("--inputData") + 1] as Hex,
    });
    expect(decoded.args[4]).toBe("");
    expect(decoded.args[6]).toBe(RESOLVER);
  });

  it("requires baseURI or a resolver", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads() }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);

    await expect(runCollectionCreate(runtime, { ...BASE, baseUri: "" })).rejects.toMatchObject({
      code: "METADATA_MODE_REQUIRED",
    });
    expect(previewCalls(fake)).toHaveLength(0);
  });

  it("rejects a resolver with no code", async () => {
    const publicClient = fakePublicClient({
      readContract: reads(),
      code: { [RESOLVER]: "0x" },
    });
    const { runtime, fake, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);
    await expect(
      runCollectionCreate(runtime, { ...BASE, resolver: RESOLVER }),
    ).rejects.toMatchObject({ code: "RESOLVER_HAS_NO_CODE" });
    expect(previewCalls(fake)).toHaveLength(0);
  });
});
