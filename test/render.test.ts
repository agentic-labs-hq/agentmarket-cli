import { describe, expect, it } from "vitest";

import { CliError, errorPayload } from "../src/errors.js";
import { renderErrorHuman, renderHuman } from "../src/render.js";

const WALLET = {
  address: "0x1111111111111111111111111111111111111111",
  status: "CONNECTED",
  devMode: { enabled: true, expiresAt: 1_800_000_000_000 },
  bnbBalance: "1",
};

const PREVIEW = {
  requestId: "req-1",
  parsedTx: { transactionType: "Send" },
  simulationResult: { simulationCode: "000000000", simulationErrorDetail: null },
  risks: { riskDetails: [] },
  requireConfirmation: false,
  expiresAt: 1_800_000_000_000,
  nextCommand: "agentmarket tx execute --request-id req-1 --confirm",
};

describe("human rendering", () => {
  it("renders a listing preview and the next execute command", () => {
    const text = renderHuman({
      ok: true,
      command: "market list",
      status: "preview",
      wallet: WALLET,
      collection: "0x2222222222222222222222222222222222222222",
      tokenId: "7",
      priceBnb: "0.5",
      priceWei: "500000000000000000",
      deadlineIso: null,
      market: {
        address: "0x3333333333333333333333333333333333333333",
        feeBps: 100,
        treasury: "0x4444444444444444444444444444444444444444",
      },
      approval: { approvedForMarket: true, getApproved: "0x3333333333333333333333333333333333333333" },
      call: {
        functionName: "list",
        to: "0x3333333333333333333333333333333333333333",
        valueWei: "0",
      },
      preview: PREVIEW,
      warnings: [],
    });
    expect(text).toContain("market list — PREVIEW");
    expect(text).toContain("Price: 0.5 BNB");
    expect(text).toContain("Request ID: req-1");
    expect(text).toContain("agentmarket tx execute --request-id req-1 --confirm");
    expect(text).toContain("Developer Mode: enabled");
  });

  it("renders needsApproval steps without a list preview", () => {
    const text = renderHuman({
      ok: true,
      command: "market list",
      status: "needsApproval",
      wallet: WALLET,
      collection: "0x2222222222222222222222222222222222222222",
      tokenId: "7",
      priceBnb: "0.5",
      priceWei: "500000000000000000",
      deadlineIso: null,
      market: { address: "0x3333333333333333333333333333333333333333", feeBps: 100, treasury: "0x4" },
      approval: { approvedForMarket: false, getApproved: "0x0000000000000000000000000000000000000000" },
      needsApproval: [
        {
          kind: "approve",
          token: "0x2222222222222222222222222222222222222222",
          tokenId: "7",
          spender: "0x3333333333333333333333333333333333333333",
          reason: "Agentmarket is not approved for this token",
          preview: { requestId: "req-a", requireConfirmation: false },
          nextCommand: "agentmarket tx execute --request-id req-a --confirm",
        },
      ],
      approveAllCommand: "agentmarket nft approve-all --collection 0x2222",
      warnings: [],
    });
    expect(text).toContain("Needs approval first");
    expect(text).toContain("req-a");
    expect(text).toContain("agentmarket nft approve-all");
    expect(text).not.toContain("Request ID: req-1");
  });

  it("renders collection create and market buy previews", () => {
    const create = renderHuman({
      ok: true,
      command: "collection create",
      wallet: WALLET,
      collection: {
        name: "Example",
        symbol: "EGT",
        maxSupply: "1000",
        baseURI: "ipfs://base/",
        metadataURI: "ipfs://meta",
        metadataResolver: "0x0000000000000000000000000000000000000000",
        policy: "0x5555555555555555555555555555555555555555",
        policySource: "current",
        creator: WALLET.address,
        address: null,
      },
      call: { functionName: "createCollection", to: "0x6666", valueWei: "0" },
      preview: PREVIEW,
      warnings: [],
    });
    expect(create).toContain("collection create — PREVIEW ONLY");
    expect(create).toContain("maxSupply: 1000");

    const buy = renderHuman({
      ok: true,
      command: "market buy",
      wallet: WALLET,
      collection: "0x2222222222222222222222222222222222222222",
      tokenId: "7",
      listing: { seller: "0x8", priceBnb: "0.5" },
      priceBnb: "0.5",
      valueWei: "500000000000000000",
      feeBps: 100,
      marketplaceFeeWei: "5000000000000000",
      call: { functionName: "buy", to: "0x3333", valueWei: "500000000000000000" },
      preview: PREVIEW,
      warnings: [],
    });
    expect(buy).toContain("Value: 500000000000000000 wei");
    expect(buy).toContain("fee=5000000000000000 wei");
  });

  it("renders doctor and status snapshots", () => {
    const doctor = renderHuman({
      ok: true,
      command: "doctor",
      healthy: false,
      network: "bsc-mainnet",
      chainId: 56,
      rpcHost: "bsc-dataseed.bnbchain.org",
      blockNumber: "100",
      gasPriceGwei: "1",
      baw: { available: false, error: { code: "BAW_UNAVAILABLE", message: "not installed" } },
      checks: [{ name: "nftRegistry code", status: "fail", detail: "not configured" }],
      contracts: [{ key: "nftRegistry", configured: false }],
      warnings: ["NFT not deployed"],
    });
    expect(doctor).toContain("BAW: unavailable");
    expect(doctor).toContain("Result: unhealthy");
    expect(doctor).toContain("Not configured: nftRegistry");

    const status = renderHuman({
      ok: true,
      command: "status",
      healthy: false,
      network: "bsc-mainnet",
      chainId: 56,
      rpcHost: "bsc-dataseed.bnbchain.org",
      blockNumber: "100",
      gasPriceGwei: "1",
      wallet: { available: true, status: "CONNECTED", devMode: { enabled: false } },
      addressBook: { chainId: 56, network: "bsc-mainnet", nftRegistry: null },
      warnings: [],
    });
    expect(status).toContain("Health: degraded");
    expect(status).toContain("nftRegistry: —");
  });

  it("includes BAW risks in human error output", () => {
    const payload = errorPayload(
      new CliError("BAW_PREVIEW_REJECTED", "High risk transaction", {
        bawError: {
          name: "AGENT_DEV_MODE_RISK_BLOCKED",
          data: {
            risks: {
              riskDetails: [{ riskType: "RISK", title: "High Risk Address", description: "Flagged target" }],
            },
          },
        },
      }),
      "market list",
    );
    const text = renderErrorHuman(payload);
    expect(text).toContain("High risk transaction");
    expect(text).toContain("High Risk Address");
    expect(text).toContain("Flagged target");
  });
});
