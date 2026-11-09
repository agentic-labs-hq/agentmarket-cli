import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { zeroAddress } from "viem";

import {
  ADDRESS_BOOK_KEYS,
  addressBookEntries,
  DEFAULT_DEPLOYMENT_PATH,
  defaultDeploymentPath,
  deploymentAddress,
  loadDeployment,
} from "../src/deployment.js";
import { CliError } from "../src/errors.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tempDeployment(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "agentmarket-deployment-"));
  dirs.push(dir);
  const path = join(dir, "56.json");
  writeFileSync(path, JSON.stringify(content), "utf8");
  return path;
}

const BASE = {
  chainId: 56,
  network: "bsc-test",
  rpcUrl: "https://rpc.example.invalid",
  startBlock: 1,
  governance: "0x88Db9a7FCf2e8abc0dDa5Ed88248e1e73E8aaa35",
  nftRegistry: "0x9000000000000000000000000000000000000002",
  nftFactory: "0x9000000000000000000000000000000000000003",
  agentmarket: "0x9000000000000000000000000000000000000001",
  treasury: "0x9000000000000000000000000000000000000004",
  policy: "0x9000000000000000000000000000000000000005",
  identityAdapter: "0x9000000000000000000000000000000000000006",
  agentIdRegistry: "0x9000000000000000000000000000000000000007",
  policyRegistry: "0x9000000000000000000000000000000000000008",
  venueRegistry: "0x9000000000000000000000000000000000000009",
};

describe("deployments/56.json", () => {
  const deployment = loadDeployment();

  it("loads the packaged Agentmarket BSC book with known protocol addresses", () => {
    expect(DEFAULT_DEPLOYMENT_PATH.endsWith("deployments/56.json")).toBe(true);
    expect(deployment.chainId).toBe(56);
    expect(deployment.network).toBe("bsc-mainnet");
    expect(deployment.startBlock).toBe(130298566);
    expect(deployment.governance).toBe("0x88Db9a7FCf2e8abc0dDa5Ed88248e1e73E8aaa35");
    expect(deployment.policy).toBe("0xdb7FA5F2DDEaCF0Dbd7cd8ACa12A43A1050D4Ff7");
    expect(deployment.identityAdapter).toBe("0xbf820DaA0AD3a13a10C7D1d493F985DD1109F894");
    expect(deployment.agentIdRegistry).toBe("0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F");
    expect(deployment.policyRegistry).toBe("0x7fb3A4a4df80C84a92F35B2fF356C6D201EDDc2A");
    expect(deployment.venueRegistry).toBe("0xD07B95112865f84a5563CDAB8CC69C0058784927");
    expect(deployment.treasury).toBe("0xd06b024f0A7F9509D9cd85e5BC44abfb82E5b4A8");
  });

  it("configures the deployed NFT and Agentmarket addresses", () => {
    expect(deployment.status).toBe("deployed");
    expect(deployment.nftRegistry).toBe("0x5B2e805B276D9d756f5CacF58a4599eeCc8e3550");
    expect(deployment.nftFactory).toBe("0x9902405C5Ca9800AFE031af837C442a0F2aCaD62");
    expect(deployment.agentmarket).toBe("0x4e2aCC31a1dE4cA5DfeeD43956c607e46dd66982");
    expect(deploymentAddress(deployment, "nftRegistry")).toBe(deployment.nftRegistry);
    expect(deploymentAddress(deployment, "agentmarket")).toBe(deployment.agentmarket);
  });

  it("still fails closed when an NFT address is missing", () => {
    const missing = loadDeployment(
      tempDeployment({ ...BASE, nftRegistry: null, nftFactory: null, agentmarket: null }),
    );
    expect(missing.nftRegistry).toBeUndefined();
    expect(missing.nftFactory).toBeUndefined();
    expect(missing.agentmarket).toBeUndefined();
    expect(() => deploymentAddress(missing, "nftRegistry")).toThrowError(
      expect.objectContaining({ code: "NFT_NOT_CONFIGURED" }),
    );
    expect(() => deploymentAddress(missing, "agentmarket")).toThrowError(/not configured/);
  });
});

describe("deployment loading", () => {
  it("loads a fully configured address book and exposes all keys", () => {
    const deployment = loadDeployment(tempDeployment(BASE));
    expect(deployment.nftRegistry).toBe("0x9000000000000000000000000000000000000002");
    expect(deployment.agentmarket).toBe("0x9000000000000000000000000000000000000001");
    expect(deploymentAddress(deployment, "agentmarket")).toBe(deployment.agentmarket);
    expect(addressBookEntries(deployment).map((entry) => entry.key)).toEqual([...ADDRESS_BOOK_KEYS]);
    expect(addressBookEntries(deployment).every((entry) => entry.configured)).toBe(true);
  });

  it("rejects missing required protocol addresses", () => {
    const content = { ...BASE } as Record<string, unknown>;
    delete content.policy;
    expect(() => loadDeployment(tempDeployment(content))).toThrowError(
      expect.objectContaining({ code: "DEPLOYMENT_INVALID" }),
    );
  });

  it("rejects a zero-address NFT slot instead of silently using zero", () => {
    expect(() => loadDeployment(tempDeployment({ ...BASE, nftRegistry: zeroAddress }))).toThrowError(
      expect.objectContaining({ code: "DEPLOYMENT_INVALID" }),
    );
  });

  it("rejects invalid JSON and unreadable paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentmarket-deployment-"));
    dirs.push(dir);
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json", "utf8");
    expect(() => loadDeployment(path)).toThrowError(expect.objectContaining({ code: "DEPLOYMENT_INVALID" }));
    expect(() => loadDeployment(join(dir, "missing.json"))).toThrowError(
      expect.objectContaining({ code: "DEPLOYMENT_UNREADABLE" }),
    );
  });

  it("honors AGENTMARKET_DEPLOYMENT_FILE for the default path", () => {
    expect(defaultDeploymentPath({ AGENTMARKET_DEPLOYMENT_FILE: "/tmp/custom-56.json" })).toBe(
      "/tmp/custom-56.json",
    );
    expect(defaultDeploymentPath({})).toBe(DEFAULT_DEPLOYMENT_PATH);
  });

  it("reports a clear deployment error code and key", () => {
    const deployment = loadDeployment(tempDeployment({ ...BASE, agentmarket: null, nftRegistry: null }));
    try {
      deploymentAddress(deployment, "agentmarket");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe("NFT_NOT_CONFIGURED");
      expect((error as CliError).details).toMatchObject({ key: "agentmarket", configured: false });
      expect((error as CliError).message).toContain("AGENTMARKET_DEPLOYMENT_FILE");
    }
  });
});
