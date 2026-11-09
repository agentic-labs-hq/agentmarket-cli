import { encodeFunctionData, type Address, type Hex } from "viem";

import { agentmarketAbi, nftAbi, nftFactoryAbi } from "./abis.js";

/** A prepared external-sign call. No signer is involved. */
export interface PreparedCall {
  action: string;
  to: Address;
  value: bigint;
  inputData: Hex;
  functionName: string;
}

export interface CollectionCreateCallParams {
  factory: Address;
  name: string;
  symbol: string;
  policy: Address;
  maxSupply: bigint;
  baseURI: string;
  metadataURI: string;
  metadataResolver: Address;
}

export function buildCollectionCreateCall(params: CollectionCreateCallParams): PreparedCall {
  return {
    action: "collection create",
    to: params.factory,
    value: 0n,
    inputData: encodeFunctionData({
      abi: nftFactoryAbi,
      functionName: "createCollection",
      args: [
        params.name,
        params.symbol,
        params.policy,
        params.maxSupply,
        params.baseURI,
        params.metadataURI,
        params.metadataResolver,
      ],
    }),
    functionName: "createCollection",
  };
}

export function buildCollectionMintCall(collection: Address, to: Address, count: bigint): PreparedCall {
  return {
    action: "collection mint",
    to: collection,
    value: 0n,
    inputData: encodeFunctionData({ abi: nftAbi, functionName: "mint", args: [to, count] }),
    functionName: "mint",
  };
}

export function buildCollectionMintBatchCall(
  collection: Address,
  recipients: readonly Address[],
  counts: readonly bigint[],
): PreparedCall {
  return {
    action: "collection mint",
    to: collection,
    value: 0n,
    inputData: encodeFunctionData({
      abi: nftAbi,
      functionName: "mintBatch",
      args: [[...recipients], [...counts]],
    }),
    functionName: "mintBatch",
  };
}

export function buildNftApproveCall(collection: Address, spender: Address, tokenId: bigint): PreparedCall {
  return {
    action: "nft approve",
    to: collection,
    value: 0n,
    inputData: encodeFunctionData({ abi: nftAbi, functionName: "approve", args: [spender, tokenId] }),
    functionName: "approve",
  };
}

export function buildNftApprovalForAllCall(collection: Address, operator: Address, approved: boolean): PreparedCall {
  return {
    action: "nft approve-all",
    to: collection,
    value: 0n,
    inputData: encodeFunctionData({
      abi: nftAbi,
      functionName: "setApprovalForAll",
      args: [operator, approved],
    }),
    functionName: "setApprovalForAll",
  };
}

export interface MarketListCallParams {
  market: Address;
  collection: Address;
  tokenId: bigint;
  price: bigint;
  deadline: bigint;
}

export function buildMarketListCall(params: MarketListCallParams): PreparedCall {
  return {
    action: "market list",
    to: params.market,
    value: 0n,
    inputData: encodeFunctionData({
      abi: agentmarketAbi,
      functionName: "list",
      args: [params.collection, params.tokenId, params.price, params.deadline],
    }),
    functionName: "list",
  };
}

export function buildMarketCancelCall(market: Address, collection: Address, tokenId: bigint): PreparedCall {
  return {
    action: "market cancel",
    to: market,
    value: 0n,
    inputData: encodeFunctionData({
      abi: agentmarketAbi,
      functionName: "cancel",
      args: [collection, tokenId],
    }),
    functionName: "cancel",
  };
}

export function buildMarketBuyCall(
  market: Address,
  collection: Address,
  tokenId: bigint,
  price: bigint,
): PreparedCall {
  return {
    action: "market buy",
    to: market,
    value: price,
    inputData: encodeFunctionData({
      abi: agentmarketAbi,
      functionName: "buy",
      args: [collection, tokenId],
    }),
    functionName: "buy",
  };
}

/** First 4-byte selector for human display; never used as an input. */
export function selectorOf(inputData: Hex): string {
  return inputData.length >= 10 ? inputData.slice(0, 10) : inputData;
}
