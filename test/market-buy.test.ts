import { zeroAddress, type Address } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { runMarketBuy } from "../src/core/market-buy.js";
import { CliError } from "../src/errors.js";
import { BSC_ADDRESS, connectedBawHandler, ok, removeDir } from "./helpers/fake-baw.js";
import {
  COLLECTION,
  MARKET,
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

const PRICE = 500_000_000_000_000_000n;
const SELLER = OTHER_ADDRESS as Address;

function reads(options: {
  executable?: boolean;
  active?: boolean;
  seller?: Address;
  owner?: Address;
  approved?: Address;
  transferAllowed?: boolean;
  transferReason?: string;
} = {}) {
  return (call: ReadContractCall): unknown => {
    switch (call.functionName) {
      case "listingOf":
        return {
          order: {
            seller: options.seller ?? SELLER,
            collection: COLLECTION,
            tokenId: 7n,
            price: PRICE,
            paymentAsset: zeroAddress,
            deadline: 0n,
            nonce: 0n,
          },
          feeBps: 100,
          active: options.active ?? true,
        };
      case "isExecutable":
        return options.executable ?? true;
      case "ownerOf":
        return options.owner ?? SELLER;
      case "getApproved":
        return options.approved ?? MARKET;
      case "isApprovedForAll":
        return false;
      case "policy":
        return POLICY;
      case "canTransfer":
        return [options.transferAllowed ?? true, options.transferReason ?? `0x${"00".repeat(32)}`];
      default:
        throw new Error(`Unexpected read: ${call.functionName}`);
    }
  };
}

function previewCalls(fake: { calls: string[][] }) {
  return fake.calls.filter((call) => call[0] === "contract-call" && call[1] === "preview");
}

describe("market buy", () => {
  it("previews buy with value equal to the listing price in wei", async () => {
    const publicClient = fakePublicClient({ readContract: reads() });
    const { runtime, fake, dir } = harness(publicClient, {
      handler: connectedBawHandler({ onPreview: () => ok({ requestId: "req-buy" }) }),
    });
    dirs.push(dir);

    const result = await runMarketBuy(runtime, { collection: COLLECTION, tokenId: "7" });
    expect(result.valueWei).toBe(PRICE.toString());
    expect(result.priceBnb).toBe("0.5");
    expect(result.executable).toBe(true);
    expect(result.marketplaceFeeWei).toBe("5000000000000000");

    const calls = previewCalls(fake);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call[call.indexOf("--to") + 1]).toBe(MARKET);
    expect(call[call.indexOf("--value") + 1]).toBe(PRICE.toString());
  });

  it("refuses a listing the collection policy denies", async () => {
    const publicClient = fakePublicClient({
      readContract: reads({ transferAllowed: false, transferReason: `0x${"11".repeat(32)}` }),
    });
    const { runtime, fake, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);

    await expect(runMarketBuy(runtime, { collection: COLLECTION, tokenId: "7" })).rejects.toMatchObject({
      code: "TRANSFER_NOT_ALLOWED",
    });
    expect(previewCalls(fake)).toHaveLength(0);
  });

  it("refuses a preview whose BAW simulation failed", async () => {
    const publicClient = fakePublicClient({ readContract: reads() });
    const { runtime, fake, dir } = harness(publicClient, {
      handler: connectedBawHandler({
        onPreview: () => ok({ requestId: "req-buy", simulationResult: { simulationErrorDetail: "execution reverted" } }),
      }),
    });
    dirs.push(dir);

    await expect(runMarketBuy(runtime, { collection: COLLECTION, tokenId: "7" })).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
    expect(previewCalls(fake)).toHaveLength(1);
  });

  it("refuses a non-executable listing and sends nothing", async () => {
    const publicClient = fakePublicClient({
      readContract: reads({ executable: false, approved: zeroAddress }),
    });
    const { runtime, fake, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);

    const error = await runMarketBuy(runtime, { collection: COLLECTION, tokenId: "7" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe("LISTING_NOT_EXECUTABLE");
    expect((error as CliError).details?.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("not approved")]),
    );
    expect(previewCalls(fake)).toHaveLength(0);
  });

  it("refuses an inactive listing and a self-purchase without previewing", async () => {
    const inactive = fakePublicClient({ readContract: reads({ active: false }) });
    const first = harness(inactive, { handler: connectedBawHandler() });
    dirs.push(first.dir);
    await expect(runMarketBuy(first.runtime, { collection: COLLECTION, tokenId: "7" })).rejects.toMatchObject({
      code: "LISTING_NOT_ACTIVE",
    });
    expect(previewCalls(first.fake)).toHaveLength(0);

    const self = fakePublicClient({ readContract: reads({ seller: BSC_ADDRESS as Address }) });
    const second = harness(self, { handler: connectedBawHandler() });
    dirs.push(second.dir);
    await expect(runMarketBuy(second.runtime, { collection: COLLECTION, tokenId: "7" })).rejects.toMatchObject({
      code: "SELF_PURCHASE",
    });
    expect(previewCalls(second.fake)).toHaveLength(0);
  });

  it("reports an expired listing in the executability reasons", async () => {
    const publicClient = fakePublicClient({
      blockTimestamp: 1_800_000_001n,
      readContract: (call) => {
        if (call.functionName === "listingOf") {
          return {
            order: {
              seller: SELLER,
              collection: COLLECTION,
              tokenId: 7n,
              price: PRICE,
              paymentAsset: zeroAddress,
              deadline: 1_800_000_000n,
              nonce: 0n,
            },
            feeBps: 100,
            active: true,
          };
        }
        return reads({ executable: false, approved: MARKET })(call);
      },
    });
    const { runtime, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);
    const error = await runMarketBuy(runtime, { collection: COLLECTION, tokenId: "7" }).catch(
      (caught: unknown) => caught,
    );
    expect((error as CliError).code).toBe("LISTING_NOT_EXECUTABLE");
    expect(((error as CliError).details?.reasons as string[]).join(" ")).toContain("expired");
  });
});
