import type { Runtime } from "../runtime.js";
import { checkAgenticWallet } from "./wallet-checks.js";
import {
  assertChain,
  baseResult,
  gwei,
  marketConfigJson,
  readEligibility,
  readMarketConfig,
  readPolicySnapshot,
  shortError,
  type CommandResult,
} from "./common.js";

/**
 * Read-only snapshot: BSC head, gas price, address book, Agentmarket config,
 * policy, and the Binance Agentic Wallet. BAW unavailability is reported with
 * healthy=false rather than aborting the RPC snapshot.
 */
export async function runStatus(runtime: Runtime): Promise<CommandResult> {
  const { publicClient, deployment, baw } = runtime;
  const warnings: string[] = [];

  await assertChain(runtime);

  const [blockNumber, gasPrice] = await Promise.all([
    publicClient.getBlockNumber({ cacheTime: 0 }),
    publicClient.getGasPrice(),
  ]);

  const wallet = await checkAgenticWallet(baw, {
    tolerant: true,
    bnbBalance: (address) => publicClient.getBalance({ address }),
  });
  warnings.push(...wallet.warnings);

  const eligibility =
    wallet.address === null ? null : await readEligibility(publicClient, deployment, wallet.address);
  if (eligibility !== null) warnings.push(...eligibility.warnings);

  let market = null;
  if (deployment.agentmarket === undefined) {
    warnings.push(
      "Agentmarket is not configured in the address book; market commands are unavailable until the deployment file is updated.",
    );
  } else {
    try {
      market = await readMarketConfig(publicClient, deployment.agentmarket);
    } catch (error) {
      warnings.push(`Could not read Agentmarket configuration: ${shortError(error)}`);
    }
  }

  let policy = null;
  try {
    policy = await readPolicySnapshot(publicClient, deployment);
  } catch (error) {
    warnings.push(`Could not read policy state: ${shortError(error)}`);
  }

  const nftConfigured =
    deployment.nftRegistry !== undefined &&
    deployment.nftFactory !== undefined &&
    deployment.agentmarket !== undefined;
  const healthy =
    nftConfigured &&
    market !== null &&
    policy !== null &&
    policy.allowed &&
    wallet.available &&
    wallet.status === "CONNECTED" &&
    wallet.devMode.enabled === true;

  return {
    ...baseResult(runtime, "status"),
    healthy,
    blockNumber: blockNumber.toString(),
    gasPriceWei: gasPrice.toString(),
    gasPriceGwei: gwei(gasPrice),
    nftConfigured,
    addressBook: {
      chainId: deployment.chainId,
      network: deployment.network,
      rpcUrl: runtime.rpcHost,
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
    market: market === null ? null : marketConfigJson(market),
    policy,
    wallet,
    eligibility,
    warnings: [...new Set(warnings)],
  };
}
