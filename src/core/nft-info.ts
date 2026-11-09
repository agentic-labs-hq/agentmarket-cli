import { parseAddress, parseUint } from "../lib/parse.js";
import type { Runtime } from "../runtime.js";
import { nftAbi } from "../abis.js";
import { CliError } from "../errors.js";
import {
  assertChain,
  baseResult,
  readCollection,
  readOwnerOf,
  shortError,
  type CommandResult,
} from "./common.js";

export interface NftInfoOptions {
  collection: string;
  tokenId: string;
}

/** Read-only NFT owner + token URI + collection basics. */
export async function runNftInfo(runtime: Runtime, options: NftInfoOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const tokenId = parseUint(options.tokenId, "--token-id");
  const [owner, info] = await Promise.all([
    readOwnerOf(runtime.publicClient, collection, tokenId),
    readCollection(runtime.publicClient, collection),
  ]);

  let tokenURI: string;
  try {
    tokenURI = await runtime.publicClient.readContract({
      address: collection,
      abi: nftAbi,
      functionName: "tokenURI",
      args: [tokenId],
    });
  } catch (error) {
    throw new CliError(
      "TOKEN_URI_READ_FAILED",
      `Could not read tokenURI(${tokenId}) for ${collection}: ${shortError(error)}`,
      { collection, tokenId: tokenId.toString() },
    );
  }

  return {
    ...baseResult(runtime, "nft info"),
    nft: {
      collection,
      tokenId: tokenId.toString(),
      owner,
      tokenURI,
    },
    collection: {
      address: info.address,
      name: info.name,
      symbol: info.symbol,
      creator: info.creator,
      policy: info.policy,
      maxSupply: info.maxSupply.toString(),
      totalMinted: info.totalMinted.toString(),
      metadataURI: info.metadataURI,
      baseURI: info.baseURI,
      metadataResolver: info.metadataResolver,
    },
    warnings: [],
  };
}
