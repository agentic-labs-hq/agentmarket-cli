import { zeroAddress, type Hex } from "viem";
import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "../src/core/doctor.js";
import { runStatus } from "../src/core/status.js";
import { BSC_ADDRESS, connectedBawHandler, removeDir } from "./helpers/fake-baw.js";
import {
  AGENT_ID_REGISTRY,
  IDENTITY_ADAPTER,
  MARKET,
  NFT_FACTORY,
  NFT_REGISTRY,
  POLICY,
  POLICY_REGISTRY,
  TREASURY,
  VENUE_REGISTRY,
  fakePublicClient,
  fixtureDeployment,
  type ReadContractCall,
} from "./helpers/fake-client.js";
import { harness } from "./helpers/harness.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

const KIND = `0x${"11".repeat(32)}` as Hex;

function fullReads(call: ReadContractCall): unknown {
  switch (call.functionName) {
    case "currentPolicy":
      return POLICY;
    case "isPolicyAllowed":
      return true;
    case "policyVersion":
      return 1n;
    case "isEligible":
    case "isMember":
    case "hasIdentity":
      return true;
    case "isFacility":
    case "isRevokedFacility":
      return false;
    case "categoryOf":
      return 0;
    case "kind":
      return KIND;
    case "version":
      return 1n;
    case "chainId":
      return 56n;
    case "balanceOf":
      return 1n;
    case "handleOf":
      return "agent";
    case "nftRegistry":
      return NFT_REGISTRY;
    case "venueRegistry":
      return VENUE_REGISTRY;
    case "treasury":
      return TREASURY;
    case "feeBps":
      return 100;
    case "maxFeeBps":
      return 500;
    case "governance":
    case "pendingGovernance":
      return zeroAddress;
    case "policyRegistry":
      return POLICY_REGISTRY;
    case "assetRegistry":
      return NFT_REGISTRY;
    default:
      throw new Error(`Unexpected read: ${call.functionName}`);
  }
}

describe("doctor", () => {
  it("reports BAW unavailability structurally with healthy=false", async () => {
    const publicClient = fakePublicClient({ readContract: fullReads });
    const { runtime, dir } = harness(publicClient, {
      handler: () => {
        throw new Error("baw is not installed");
      },
    });
    dirs.push(dir);

    const result = await runDoctor(runtime);
    expect(result.ok).toBe(false);
    expect(result.healthy).toBe(false);
    expect(result.baw).toMatchObject({ available: false });
    expect((result.baw as Record<string, unknown>).error).toMatchObject({ code: "BAW_UNAVAILABLE" });
    expect(JSON.stringify(result)).toContain("baw is not installed");
    expect((result.checks as Array<Record<string, unknown>>).some((check) => check.status === "fail")).toBe(true);
  });

  it("reports healthy=true for a fully wired deployment and connected wallet", async () => {
    const publicClient = fakePublicClient({ readContract: fullReads });
    const { runtime, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);

    const result = await runDoctor(runtime);
    expect(result.healthy).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.market).toMatchObject({ address: MARKET, feeBps: 100, maxFeeBps: 500 });
    expect(result.addressBook).toMatchObject({
      nftRegistry: NFT_REGISTRY,
      nftFactory: NFT_FACTORY,
      agentmarket: MARKET,
      treasury: TREASURY,
      policy: POLICY,
      identityAdapter: IDENTITY_ADAPTER,
      agentIdRegistry: AGENT_ID_REGISTRY,
      policyRegistry: POLICY_REGISTRY,
      venueRegistry: VENUE_REGISTRY,
    });
    expect((result.baw as Record<string, unknown>).address).toBe(BSC_ADDRESS);
    expect((result.eligibility as Record<string, unknown>).eligible).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("reports missing NFT addresses as failed checks without using zero", async () => {
    const deployment = fixtureDeployment({ nftRegistry: undefined, nftFactory: undefined, agentmarket: undefined });
    const publicClient = fakePublicClient({ readContract: fullReads });
    const { runtime, dir } = harness(publicClient, { deployment, handler: connectedBawHandler() });
    dirs.push(dir);

    const result = await runDoctor(runtime);
    expect(result.healthy).toBe(false);
    expect(result.market).toBeNull();
    const contracts = result.contracts as Array<Record<string, unknown>>;
    for (const key of ["nftRegistry", "nftFactory", "agentmarket"]) {
      expect(contracts.find((entry) => entry.key === key)).toMatchObject({
        configured: false,
        hasCode: false,
        address: null,
      });
    }
    expect(JSON.stringify(result)).toContain("not deployed");
  });
});

describe("status", () => {
  it("returns a degraded snapshot when market is not configured", async () => {
    const deployment = fixtureDeployment({ nftRegistry: undefined, nftFactory: undefined, agentmarket: undefined });
    const publicClient = fakePublicClient({ readContract: fullReads });
    const { runtime, dir } = harness(publicClient, { deployment, handler: connectedBawHandler() });
    dirs.push(dir);

    const result = await runStatus(runtime);
    expect(result.healthy).toBe(false);
    expect(result.nftConfigured).toBe(false);
    expect(result.market).toBeNull();
    expect((result.warnings as string[]).join(" ")).toContain("Agentmarket is not configured");
    expect(result.addressBook).toMatchObject({
      nftRegistry: null,
      nftFactory: null,
      agentmarket: null,
      policy: POLICY,
    });
  });

  it("returns healthy=true when everything is configured and BAW is connected", async () => {
    const publicClient = fakePublicClient({ readContract: fullReads });
    const { runtime, dir } = harness(publicClient, { handler: connectedBawHandler() });
    dirs.push(dir);
    const result = await runStatus(runtime);
    expect(result.healthy).toBe(true);
    expect(result.market).toMatchObject({ address: MARKET });
    expect(result.policy).toMatchObject({ allowed: true, matchesAddressBook: true });
  });
});
