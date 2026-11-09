import { nftFactoryAbi, nftRegistryAbi } from "../abis.js";
import type { AddressBookKey } from "../deployment.js";
import type { Runtime } from "../runtime.js";
import { checkAgenticWallet } from "./wallet-checks.js";
import {
  assertChain,
  baseResult,
  checkContract,
  gwei,
  marketConfigJson,
  readEligibility,
  readIdentityMeta,
  readMarketConfig,
  readPolicySnapshot,
  sameAddress,
  shortError,
  type Check,
  type CommandResult,
} from "./common.js";

interface WiringReport {
  registryPolicyRegistry: string | null;
  factoryAssetRegistry: string | null;
  factoryPolicyRegistry: string | null;
}

async function readWiring(runtime: Runtime): Promise<WiringReport> {
  const { publicClient, deployment } = runtime;
  const report: WiringReport = {
    registryPolicyRegistry: null,
    factoryAssetRegistry: null,
    factoryPolicyRegistry: null,
  };
  if (deployment.nftRegistry !== undefined) {
    try {
      report.registryPolicyRegistry = await publicClient.readContract({
        address: deployment.nftRegistry,
        abi: nftRegistryAbi,
        functionName: "policyRegistry",
      });
    } catch {
      report.registryPolicyRegistry = null;
    }
  }
  if (deployment.nftFactory !== undefined) {
    try {
      [report.factoryAssetRegistry, report.factoryPolicyRegistry] = await Promise.all([
        publicClient.readContract({
          address: deployment.nftFactory,
          abi: nftFactoryAbi,
          functionName: "assetRegistry",
        }),
        publicClient.readContract({
          address: deployment.nftFactory,
          abi: nftFactoryAbi,
          functionName: "policyRegistry",
        }),
      ]);
    } catch {
      // Individual reads are reported as warnings below.
    }
  }
  return report;
}

/**
 * Read-only deployment + Binance Agentic Wallet health check. Never previews,
 * signs, or sends. BAW failures are captured and reported with healthy=false.
 */
export async function runDoctor(runtime: Runtime): Promise<CommandResult> {
  const { publicClient, deployment, baw } = runtime;
  const warnings: string[] = [];
  const checks: Check[] = [];

  const chainId = await assertChain(runtime);
  checks.push({ name: `chain id ${deployment.chainId}`, status: "ok" });
  if (chainId !== 56) {
    checks.push({ name: "BSC mainnet (56)", status: "fail", detail: `address book is for chain ${chainId}` });
  } else {
    checks.push({ name: "BSC mainnet (56)", status: "ok" });
  }

  const [blockNumber, gasPrice] = await Promise.all([
    publicClient.getBlockNumber({ cacheTime: 0 }),
    publicClient.getGasPrice(),
  ]);

  const wallet = await checkAgenticWallet(baw, {
    tolerant: true,
    bnbBalance: (address) => publicClient.getBalance({ address }),
  });
  checks.push(...wallet.checks);
  warnings.push(...wallet.warnings);

  const contractKeys: AddressBookKey[] = [
    "nftRegistry",
    "nftFactory",
    "agentmarket",
    "treasury",
    "policy",
    "identityAdapter",
    "agentIdRegistry",
    "policyRegistry",
    "venueRegistry",
  ];
  const contractChecks = await Promise.all(
    contractKeys.map((key) => checkContract(publicClient, deployment, key)),
  );
  for (const contract of contractChecks) {
    const missingNft = ["nftRegistry", "nftFactory", "agentmarket"].includes(contract.key);
    checks.push({
      name: `${contract.key} code`,
      status: contract.hasCode ? "ok" : "fail",
      detail: contract.hasCode
        ? `${contract.codeSize} bytes`
        : contract.configured
          ? `no code at ${contract.address}`
          : missingNft
            ? "not configured: NFT protocol / Agentmarket is not deployed in this address book"
            : "not configured in the address book",
    });
  }

  let market = null;
  if (deployment.agentmarket !== undefined) {
    try {
      market = await readMarketConfig(publicClient, deployment.agentmarket);
      checks.push({
        name: "market fee",
        status: market.feeBps <= market.maxFeeBps ? "ok" : "fail",
        detail: `feeBps=${market.feeBps} maxFeeBps=${market.maxFeeBps}`,
      });
      checks.push({
        name: "market treasury",
        status: "ok",
        detail: market.treasury,
      });
      if (deployment.nftRegistry !== undefined) {
        checks.push({
          name: "market nft registry wiring",
          status: sameAddress(market.nftRegistry, deployment.nftRegistry) ? "ok" : "fail",
          detail: `market=${market.nftRegistry} addressBook=${deployment.nftRegistry}`,
        });
      }
      if (deployment.venueRegistry !== undefined) {
        checks.push({
          name: "market venue registry wiring",
          status: sameAddress(market.venueRegistry, deployment.venueRegistry) ? "ok" : "warn",
          detail: `market=${market.venueRegistry} addressBook=${deployment.venueRegistry}`,
        });
      }
      if (!sameAddress(market.treasury, deployment.treasury)) {
        warnings.push(
          `Agentmarket treasury is ${market.treasury}, but the address book treasury is ${deployment.treasury}; governance can change the treasury.`,
        );
      }
    } catch (error) {
      checks.push({ name: "market config", status: "fail", detail: shortError(error) });
      warnings.push(`Could not read Agentmarket configuration: ${shortError(error)}`);
    }
  } else {
    checks.push({
      name: "market config",
      status: "fail",
      detail: "agentmarket is not configured: Agentmarket is not deployed in this address book",
    });
  }

  let policy = null;
  try {
    policy = await readPolicySnapshot(publicClient, deployment);
    checks.push({
      name: "current policy allowed",
      status: policy.allowed ? "ok" : "fail",
      detail: `${policy.current}${policy.version === null ? "" : ` (version ${policy.version})`}`,
    });
    checks.push({
      name: "current policy matches address book",
      status: policy.matchesAddressBook ? "ok" : "warn",
      detail: `current=${policy.current} addressBook=${deployment.policy}`,
    });
  } catch (error) {
    checks.push({ name: "policy registry", status: "fail", detail: shortError(error) });
  }

  let wiring = null;
  try {
    wiring = await readWiring(runtime);
    if (deployment.nftRegistry !== undefined && wiring.registryPolicyRegistry !== null) {
      checks.push({
        name: "nft registry factory wiring",
        status: sameAddress(wiring.registryPolicyRegistry, deployment.policyRegistry) ? "ok" : "fail",
        detail: `registry.policyRegistry=${wiring.registryPolicyRegistry}`,
      });
    }
    if (deployment.nftFactory !== undefined && wiring.factoryAssetRegistry !== null) {
      checks.push({
        name: "nft factory registry wiring",
        status:
          deployment.nftRegistry !== undefined && sameAddress(wiring.factoryAssetRegistry, deployment.nftRegistry)
            ? "ok"
            : "fail",
        detail: `factory.assetRegistry=${wiring.factoryAssetRegistry}`,
      });
    }
  } catch (error) {
    warnings.push(`Could not read NFT factory/registry wiring: ${shortError(error)}`);
  }

  let identity = null;
  try {
    identity = await readIdentityMeta(publicClient, deployment.identityAdapter);
    checks.push({
      name: "identity adapter",
      status: identity.chainId === "56" ? "ok" : "warn",
      detail: `kind=${identity.kind} version=${identity.version} chainId=${identity.chainId}`,
    });
  } catch (error) {
    checks.push({ name: "identity adapter", status: "fail", detail: shortError(error) });
  }

  let eligibility = null;
  if (wallet.address !== null) {
    eligibility = await readEligibility(publicClient, deployment, wallet.address);
    warnings.push(...eligibility.warnings);
    checks.push({
      name: "agent id eligible",
      status: eligibility.eligible === true ? "ok" : "warn",
      detail:
        eligibility.eligible === true
          ? `agentId=${eligibility.agentId.handle ?? "present"}`
          : "wallet is not eligible under the protocol policy",
    });
  }

  const ok = checks.every((check) => check.status !== "fail");
  const healthy =
    ok &&
    chainId === 56 &&
    wallet.available &&
    wallet.status === "CONNECTED" &&
    wallet.devMode.enabled === true;

  return {
    ...baseResult(runtime, "doctor"),
    ok,
    healthy,
    blockNumber: blockNumber.toString(),
    gasPriceWei: gasPrice.toString(),
    gasPriceGwei: gwei(gasPrice),
    addressBook: {
      chainId: deployment.chainId,
      network: deployment.network,
      startBlock: deployment.startBlock ?? null,
      governance: deployment.governance ?? null,
      nftRegistry: deployment.nftRegistry ?? null,
      nftFactory: deployment.nftFactory ?? null,
      agentmarket: deployment.agentmarket ?? null,
      treasury: deployment.treasury,
      policy: deployment.policy,
      identityAdapter: deployment.identityAdapter,
      agentIdRegistry: deployment.agentIdRegistry,
      policyRegistry: deployment.policyRegistry,
      venueRegistry: deployment.venueRegistry,
    },
    contracts: contractChecks,
    market: market === null ? null : marketConfigJson(market),
    policy,
    wiring,
    identity,
    eligibility,
    baw: wallet,
    checks,
    warnings: [...new Set(warnings)],
  };
}
