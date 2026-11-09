import { parseAddress } from "../lib/parse.js";
import type { Runtime } from "../runtime.js";
import {
  assertChain,
  baseResult,
  readCollection,
  readRegistryStatus,
  requireAddress,
  sameAddress,
  shortError,
  type CommandResult,
} from "./common.js";

export interface CollectionInfoOptions {
  collection: string;
}

/** Read-only collection metadata plus its NFT registry record. */
export async function runCollectionInfo(runtime: Runtime, options: CollectionInfoOptions): Promise<CommandResult> {
  await assertChain(runtime);
  const collection = parseAddress(options.collection, "--collection");
  const registryAddress = requireAddress(runtime, "nftRegistry");
  const info = await readCollection(runtime.publicClient, collection);
  const registry = await readRegistryStatus(runtime.publicClient, registryAddress, collection, {
    policy: info.policy,
    creator: info.creator,
  });

  const warnings: string[] = [];
  if (!registry.registered) {
    warnings.push(`Collection ${collection} is not registered in the NFT registry ${registryAddress}.`);
  }
  if (
    runtime.deployment.nftFactory !== undefined &&
    !sameAddress(info.factory, runtime.deployment.nftFactory)
  ) {
    warnings.push(
      `Collection factory is ${info.factory}, not the address-book nftFactory ${runtime.deployment.nftFactory}.`,
    );
  }
  let factoryMatches = true;
  if (runtime.deployment.nftFactory !== undefined) {
    try {
      const factoryCode = await runtime.publicClient.getCode({ address: info.factory });
      factoryMatches = factoryCode !== undefined && factoryCode !== "0x";
      if (!factoryMatches) warnings.push(`Collection factory ${info.factory} has no contract code.`);
    } catch (error) {
      warnings.push(`Could not check collection factory code: ${shortError(error)}`);
    }
  }

  return {
    ...baseResult(runtime, "collection info"),
    collection: {
      address: info.address,
      name: info.name,
      symbol: info.symbol,
      creator: info.creator,
      policy: info.policy,
      factory: info.factory,
      maxSupply: info.maxSupply.toString(),
      totalMinted: info.totalMinted.toString(),
      remainingSupply: (info.maxSupply - info.totalMinted).toString(),
      baseURI: info.baseURI,
      metadataURI: info.metadataURI,
      metadataResolver: info.metadataResolver,
    },
    registry,
    factoryMatches,
    warnings: [...new Set(warnings)],
  };
}
