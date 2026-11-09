import { zeroAddress } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { runMarketStatus } from "../src/core/market-status.js";
import { BSC_ADDRESS, connectedBawHandler, removeDir } from "./helpers/fake-baw.js";
import { COLLECTION, MARKET, fakePublicClient, type ReadContractCall } from "./helpers/fake-client.js";
import { harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

const reads = (call: ReadContractCall): unknown => {
  switch (call.functionName) {
    case "listingOf":
      return {
        order: {
          seller: BSC_ADDRESS,
          collection: COLLECTION,
          tokenId: 7n,
          price: 500_000_000_000_000_000n,
          paymentAsset: zeroAddress,
          deadline: 0n,
          nonce: 3n,
        },
        feeBps: 100,
        active: true,
      };
    case "isExecutable":
      return true;
    case "ownerOf":
      return BSC_ADDRESS;
    case "getApproved":
      return MARKET;
    case "isApprovedForAll":
      return false;
    case "isRegistered":
      return true;
    default:
      throw new Error(`Unexpected read: ${call.functionName}`);
  }
};

describe("market status", () => {
  it("returns the listing, executability, owner, and market approval without BAW", async () => {
    const { runtime, fake, dir } = harness(fakePublicClient({ readContract: reads }), {
      handler: connectedBawHandler(),
    });
    dirs.push(dir);

    const result = await runMarketStatus(runtime, { collection: COLLECTION, tokenId: "7" });
    expect(result).toMatchObject({
      owner: BSC_ADDRESS,
      executable: true,
      registered: true,
      tokenId: "7",
    });
    expect(result.listing).toMatchObject({
      seller: BSC_ADDRESS,
      priceWei: "500000000000000000",
      priceBnb: "0.5",
      feeBps: 100,
      active: true,
      nonce: "3",
    });
    expect(result.approval).toMatchObject({
      market: MARKET,
      getApproved: MARKET,
      isApprovedForAll: false,
      approvedForMarket: true,
    });
    expect(fake.calls).toEqual([]);
  });

  it("reports inactive listings and missing approval without throwing", async () => {
    const publicClient = fakePublicClient({
      readContract: (call) => {
        if (call.functionName === "listingOf") {
          return {
            order: {
              seller: BSC_ADDRESS,
              collection: COLLECTION,
              tokenId: 7n,
              price: 0n,
              paymentAsset: zeroAddress,
              deadline: 0n,
              nonce: 0n,
            },
            feeBps: 0,
            active: false,
          };
        }
        if (call.functionName === "isExecutable") return false;
        if (call.functionName === "ownerOf") return BSC_ADDRESS;
        if (call.functionName === "getApproved") return zeroAddress;
        if (call.functionName === "isApprovedForAll") return false;
        if (call.functionName === "isRegistered") return false;
        throw new Error(`Unexpected read: ${call.functionName}`);
      },
    });
    const { runtime, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);
    const result = await runMarketStatus(runtime, { collection: COLLECTION, tokenId: "7" });
    expect(result.executable).toBe(false);
    expect(result.registered).toBe(false);
    expect(result.listing).toMatchObject({ active: false });
    expect(result.approval).toMatchObject({ approvedForMarket: false });
    expect((result.warnings as string[]).join(" ")).toContain("not registered");
  });
});
