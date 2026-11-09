import { decodeFunctionData, zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";

import { agentmarketAbi, nftAbi, nftFactoryAbi } from "../src/abis.js";
import {
  buildCollectionCreateCall,
  buildCollectionMintBatchCall,
  buildCollectionMintCall,
  buildMarketBuyCall,
  buildMarketCancelCall,
  buildMarketListCall,
  buildNftApprovalForAllCall,
  buildNftApproveCall,
  selectorOf,
} from "../src/calldata.js";

const FACTORY = "0x1111111111111111111111111111111111111111" as Address;
const COLLECTION = "0x2222222222222222222222222222222222222222" as Address;
const MARKET = "0x3333333333333333333333333333333333333333" as Address;
const WALLET = "0x4444444444444444444444444444444444444444" as Address;
const OTHER = "0x5555555555555555555555555555555555555555" as Address;
const POLICY = "0x6666666666666666666666666666666666666666" as Address;
const RESOLVER = "0x7777777777777777777777777777777777777777" as Address;
const ZERO = zeroAddress as Address;

describe("collection create calldata", () => {
  it("encodes the seven createCollection parameters", () => {
    const call = buildCollectionCreateCall({
      factory: FACTORY,
      name: "Example Collection",
      symbol: "EGT",
      policy: POLICY,
      maxSupply: 1000n,
      baseURI: "ipfs://base/",
      metadataURI: "ipfs://meta.json",
      metadataResolver: RESOLVER,
    });
    expect(call.to).toBe(FACTORY);
    expect(call.value).toBe(0n);
    expect(call.functionName).toBe("createCollection");
    expect(selectorOf(call.inputData)).toHaveLength(10);

    const decoded = decodeFunctionData({ abi: nftFactoryAbi, data: call.inputData });
    expect(decoded.functionName).toBe("createCollection");
    expect(decoded.args).toEqual([
      "Example Collection",
      "EGT",
      POLICY,
      1000n,
      "ipfs://base/",
      "ipfs://meta.json",
      RESOLVER,
    ]);
  });
});

describe("collection mint calldata", () => {
  it("encodes mint(to, count)", () => {
    const call = buildCollectionMintCall(COLLECTION, WALLET, 3n);
    expect(call.to).toBe(COLLECTION);
    expect(call.value).toBe(0n);
    const decoded = decodeFunctionData({ abi: nftAbi, data: call.inputData });
    expect(decoded.functionName).toBe("mint");
    expect(decoded.args).toEqual([WALLET, 3n]);
  });

  it("encodes mintBatch(recipients, counts)", () => {
    const call = buildCollectionMintBatchCall(COLLECTION, [WALLET, OTHER], [2n, 1n]);
    const decoded = decodeFunctionData({ abi: nftAbi, data: call.inputData });
    expect(decoded.functionName).toBe("mintBatch");
    expect(decoded.args).toEqual([
      [WALLET, OTHER],
      [2n, 1n],
    ]);
  });
});

describe("NFT approval calldata", () => {
  it("encodes approve(spender, tokenId) and approve(0, tokenId)", () => {
    const approve = buildNftApproveCall(COLLECTION, MARKET, 7n);
    const decoded = decodeFunctionData({ abi: nftAbi, data: approve.inputData });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([MARKET, 7n]);

    const revoke = buildNftApproveCall(COLLECTION, ZERO, 7n);
    const decodedRevoke = decodeFunctionData({ abi: nftAbi, data: revoke.inputData });
    expect(decodedRevoke.args).toEqual([ZERO, 7n]);
  });

  it("encodes setApprovalForAll(operator, approved)", () => {
    const grant = buildNftApprovalForAllCall(COLLECTION, MARKET, true);
    const decodedGrant = decodeFunctionData({ abi: nftAbi, data: grant.inputData });
    expect(decodedGrant.functionName).toBe("setApprovalForAll");
    expect(decodedGrant.args).toEqual([MARKET, true]);

    const revoke = buildNftApprovalForAllCall(COLLECTION, MARKET, false);
    const decodedRevoke = decodeFunctionData({ abi: nftAbi, data: revoke.inputData });
    expect(decodedRevoke.args).toEqual([MARKET, false]);
  });
});

describe("market calldata", () => {
  it("encodes list with human price converted to wei and deadline", () => {
    const call = buildMarketListCall({
      market: MARKET,
      collection: COLLECTION,
      tokenId: 7n,
      price: 500_000_000_000_000_000n,
      deadline: 1_800_000_000n,
    });
    expect(call.to).toBe(MARKET);
    expect(call.value).toBe(0n);
    const decoded = decodeFunctionData({ abi: agentmarketAbi, data: call.inputData });
    expect(decoded.functionName).toBe("list");
    expect(decoded.args).toEqual([COLLECTION, 7n, 500_000_000_000_000_000n, 1_800_000_000n]);
  });

  it("encodes cancel", () => {
    const call = buildMarketCancelCall(MARKET, COLLECTION, 7n);
    const decoded = decodeFunctionData({ abi: agentmarketAbi, data: call.inputData });
    expect(decoded.functionName).toBe("cancel");
    expect(decoded.args).toEqual([COLLECTION, 7n]);
  });

  it("encodes buy with value equal to the listing price", () => {
    const price = 2_000_000_000_000_000_000n;
    const call = buildMarketBuyCall(MARKET, COLLECTION, 7n, price);
    expect(call.to).toBe(MARKET);
    expect(call.value).toBe(price);
    const decoded = decodeFunctionData({ abi: agentmarketAbi, data: call.inputData });
    expect(decoded.functionName).toBe("buy");
    expect(decoded.args).toEqual([COLLECTION, 7n]);
  });
});
