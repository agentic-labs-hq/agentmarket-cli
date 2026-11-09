import { zeroAddress, type Address } from "viem";

import { nftFactoryAbi, policyRegistryAbi } from "../abis.js";
import { buildCollectionCreateCall } from "../calldata.js";
import { CliError } from "../errors.js";
import { parseAddress, parsePositiveUint } from "../lib/parse.js";
import { validateCollectionName, validateCollectionSymbol, validateMaxSupply, validateUri } from "../lib/validate.js";
import { previewCallAndRecord, previewWarnings } from "../preview.js";
import type { Runtime } from "../runtime.js";
import { loadWalletForPreview } from "../wallet.js";
import {
  assertChain,
  baseResult,
  requireAddress,
  sameAddress,
  shortError,
  type CommandResult,
} from "./common.js";

export interface CollectionCreateOptions {
  name: string;
  symbol: string;
  maxSupply: string;
  baseUri?: string;
  metadataUri: string;
  resolver?: string;
  policy?: string;
}

/**
 * Build AgenticNFTFactory.createCollection calldata and preview it through BAW.
 * The new collection address is emitted by CollectionCreated after execution;
 * it is not available in the preview.
 */
export async function runCollectionCreate(
  runtime: Runtime,
  options: CollectionCreateOptions,
): Promise<CommandResult> {
  await assertChain(runtime);
  const name = options.name;
  const symbol = options.symbol;
  const maxSupply = parsePositiveUint(options.maxSupply, "--max-supply");
  const baseURI = options.baseUri ?? "";
  const metadataURI = options.metadataUri;
  validateCollectionName(name);
  validateCollectionSymbol(symbol);
  validateMaxSupply(maxSupply);
  validateUri(metadataURI, "--metadata-uri");

  const factory = requireAddress(runtime, "nftFactory");
  const resolver =
    options.resolver === undefined || sameAddress(options.resolver, zeroAddress)
      ? zeroAddress
      : parseAddress(options.resolver, "--resolver");

  if (resolver === zeroAddress) {
    if (baseURI === "") {
      throw new CliError(
        "METADATA_MODE_REQUIRED",
        "Pass --base-uri for baseURI metadata, or --resolver for resolver metadata.",
      );
    }
    validateUri(baseURI, "--base-uri");
  } else if (baseURI !== "") {
    validateUri(baseURI, "--base-uri");
  }
  const warnings: string[] = [];

  let policy: Address = zeroAddress;
  let policySource: "current" | "explicit" = "current";
  let resolvedPolicy: Address = zeroAddress;
  if (options.policy !== undefined && !sameAddress(options.policy, zeroAddress)) {
    policy = parseAddress(options.policy, "--policy");
    policySource = "explicit";
    const allowed = await runtime.publicClient.readContract({
      address: runtime.deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "isPolicyAllowed",
      args: [policy],
    });
    if (!allowed) {
      throw new CliError("POLICY_NOT_ALLOWED", `Policy ${policy} is not registered/allowed by the policy registry.`);
    }
    resolvedPolicy = policy;
  } else {
    const current = await runtime.publicClient.readContract({
      address: runtime.deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "currentPolicy",
    });
    if (current === zeroAddress) {
      throw new CliError("POLICY_NOT_SET", "The policy registry has no current policy; pass --policy explicitly.");
    }
    const allowed = await runtime.publicClient.readContract({
      address: runtime.deployment.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "isPolicyAllowed",
      args: [current],
    });
    if (!allowed) {
      throw new CliError("POLICY_NOT_ALLOWED", `Current policy ${current} is not registered/allowed.`);
    }
    resolvedPolicy = current;
  }

  if (resolver !== zeroAddress) {
    try {
      const code = await runtime.publicClient.getCode({ address: resolver });
      if (code === "0x") {
        throw new CliError(
          "RESOLVER_HAS_NO_CODE",
          `Metadata resolver ${resolver} has no contract code; the factory will reject it.`,
        );
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      warnings.push(`Could not check metadata resolver ${resolver} code before preview: ${shortError(error)}`);
    }
  }

  try {
    const [factoryPolicyRegistry, factoryAssetRegistry] = await Promise.all([
      runtime.publicClient.readContract({
        address: factory,
        abi: nftFactoryAbi,
        functionName: "policyRegistry",
      }),
      runtime.publicClient.readContract({
        address: factory,
        abi: nftFactoryAbi,
        functionName: "assetRegistry",
      }),
    ]);
    if (!sameAddress(factoryPolicyRegistry, runtime.deployment.policyRegistry)) {
      warnings.push(
        `NFT factory policy registry is ${factoryPolicyRegistry}, not the address-book policy registry ${runtime.deployment.policyRegistry}.`,
      );
    }
    if (
      runtime.deployment.nftRegistry !== undefined &&
      !sameAddress(factoryAssetRegistry, runtime.deployment.nftRegistry)
    ) {
      warnings.push(
        `NFT factory asset registry is ${factoryAssetRegistry}, not the address-book nftRegistry ${runtime.deployment.nftRegistry}.`,
      );
    }
  } catch (error) {
    warnings.push(`Could not verify NFT factory wiring: ${shortError(error)}`);
  }

  const wallet = await loadWalletForPreview(runtime.baw);
  const call = buildCollectionCreateCall({
    factory,
    name,
    symbol,
    policy,
    maxSupply,
    baseURI,
    metadataURI,
    metadataResolver: resolver,
  });
  const envelope = await previewCallAndRecord(runtime, wallet.address, call);

  return {
    ...baseResult(runtime, "collection create"),
    wallet,
    collection: {
      name,
      symbol,
      maxSupply: maxSupply.toString(),
      baseURI,
      metadataURI,
      metadataResolver: resolver,
      policy: resolvedPolicy,
      policyArgument: policy,
      policySource,
      factory,
      creator: wallet.address,
      address: null,
      addressNote: "The new collection address is emitted by the CollectionCreated event after execution; it is not available in the preview.",
    },
    call: envelope.call,
    preview: envelope.preview,
    next: {
      note: "Review the preview, then execute with the nextCommand. Read the new collection address from the CollectionCreated event receipt.",
      command: envelope.preview.nextCommand,
    },
    warnings: [...new Set([...warnings, ...previewWarnings(envelope.preview)])],
  };
}
