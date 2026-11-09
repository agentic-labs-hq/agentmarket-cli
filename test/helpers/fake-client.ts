import { getAddress, type Address, type PublicClient } from "viem";

import type { Deployment } from "../../src/deployment.js";

export interface ReadContractCall {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
}

export interface FakeClientOptions {
  chainId?: number;
  blockNumber?: bigint;
  gasPrice?: bigint;
  balance?: bigint;
  blockTimestamp?: bigint;
  /** Per-address code overrides; a null/undefined value means no code. */
  code?: Record<string, string | null | undefined>;
  readContract?: (call: ReadContractCall) => unknown;
}

export interface FakePublicClient {
  client: PublicClient;
  reads: ReadContractCall[];
  getCodeCalls: Address[];
  getBalanceCalls: Address[];
}

/**
 * Build a viem PublicClient double. Tests never hit the network: every method
 * used by the CLI is backed by the supplied handler or a deterministic default.
 */
export function fakePublicClient(options: FakeClientOptions = {}): FakePublicClient {
  const reads: ReadContractCall[] = [];
  const getCodeCalls: Address[] = [];
  const getBalanceCalls: Address[] = [];
  const code = options.code ?? {};
  const client = {
    getChainId: async () => options.chainId ?? 56,
    getBlockNumber: async () => options.blockNumber ?? 100n,
    getGasPrice: async () => options.gasPrice ?? 1_000_000_000n,
    getBalance: async ({ address }: { address: Address }) => {
      getBalanceCalls.push(address);
      return options.balance ?? 10n ** 18n;
    },
    getBlock: async () => ({ timestamp: options.blockTimestamp ?? 1_700_000_000n }),
    getCode: async ({ address }: { address: Address }) => {
      getCodeCalls.push(address);
      if (Object.prototype.hasOwnProperty.call(code, address)) return code[address] ?? "0x";
      if (Object.prototype.hasOwnProperty.call(code, address.toLowerCase())) {
        return code[address.toLowerCase()] ?? "0x";
      }
      return "0x6000";
    },
    readContract: async (call: ReadContractCall) => {
      reads.push(call);
      if (options.readContract === undefined) {
        throw new Error(`Unexpected readContract call: ${call.functionName}`);
      }
      return options.readContract(call);
    },
  } as unknown as PublicClient;
  return { client, reads, getCodeCalls, getBalanceCalls };
}

export const MARKET = getAddress("0x9000000000000000000000000000000000000001");
export const NFT_REGISTRY = getAddress("0x9000000000000000000000000000000000000002");
export const NFT_FACTORY = getAddress("0x9000000000000000000000000000000000000003");
export const TREASURY = getAddress("0x9000000000000000000000000000000000000004");
export const POLICY = getAddress("0x9000000000000000000000000000000000000005");
export const IDENTITY_ADAPTER = getAddress("0x9000000000000000000000000000000000000006");
export const AGENT_ID_REGISTRY = getAddress("0x9000000000000000000000000000000000000007");
export const POLICY_REGISTRY = getAddress("0x9000000000000000000000000000000000000008");
export const VENUE_REGISTRY = getAddress("0x9000000000000000000000000000000000000009");
export const GOVERNANCE = getAddress("0x900000000000000000000000000000000000000a");
export const COLLECTION = getAddress("0x900000000000000000000000000000000000000b");
export const OTHER_ADDRESS = getAddress("0x900000000000000000000000000000000000000c");

/** Fully configured deployment fixture (NFT addresses present). */
export function fixtureDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    chainId: 56,
    network: "bsc-mainnet",
    name: "Agentmarket test",
    status: "test",
    sourcePath: "/tmp/agentmarket-56.json",
    startBlock: 130298566,
    rpcUrl: "https://bsc-dataseed.bnbchain.org",
    governance: GOVERNANCE,
    nftRegistry: NFT_REGISTRY,
    nftFactory: NFT_FACTORY,
    agentmarket: MARKET,
    treasury: TREASURY,
    policy: POLICY,
    identityAdapter: IDENTITY_ADAPTER,
    agentIdRegistry: AGENT_ID_REGISTRY,
    policyRegistry: POLICY_REGISTRY,
    venueRegistry: VENUE_REGISTRY,
    raw: {},
    ...overrides,
  };
}
