import type { ErrorPayload } from "./errors.js";
import { toJsonSafe } from "./json.js";

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return String(value);
}

function bool(value: unknown): string {
  return value === true ? "yes" : value === false ? "no" : "—";
}

function warningLines(value: unknown): string[] {
  const warnings = arr(value).map(String);
  if (warnings.length === 0) return [];
  return ["", "Warnings:", ...warnings.map((warning) => `  ! ${warning}`)];
}

function checkLines(value: unknown): string[] {
  return arr(value)
    .map(obj)
    .map((check) => {
      const status = text(check.status);
      const label = status === "ok" ? "OK  " : status === "warn" ? "WARN" : "FAIL";
      return `  ${label} ${text(check.name)}${check.detail === undefined ? "" : ` — ${text(check.detail)}`}`;
    });
}

function formatExpiry(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function renderBaw(value: unknown): string[] {
  const baw = obj(value);
  if (baw.available === false || (baw.error !== null && baw.error !== undefined)) {
    const error = obj(baw.error);
    return [
      `BAW: unavailable${error.code === undefined ? "" : ` (${text(error.code)})`}${error.message === undefined ? "" : ` — ${text(error.message)}`}`,
    ];
  }
  const identity = [
    baw.version === undefined || baw.version === null ? null : `version=${text(baw.version)}`,
    baw.status === undefined || baw.status === null ? null : `status=${text(baw.status)}`,
    baw.address === undefined || baw.address === null ? null : `address=${text(baw.address)}`,
  ].filter((item): item is string => item !== null);
  const lines = [`BAW: ${identity.length === 0 ? "not queried" : identity.join(" ")}`];
  const devMode = obj(baw.devMode);
  lines.push(
    `  Developer Mode: ${devMode.enabled === true ? "enabled" : "disabled"}${
      devMode.expiresAt === null || devMode.expiresAt === undefined ? "" : ` (expires ${formatExpiry(devMode.expiresAt)})`
    }`,
  );
  const agentId = obj(baw.agentId);
  if (Object.keys(agentId).length > 0) {
    lines.push(
      `  Agent ID: eligible=${text(agentId.eligible)} member=${text(agentId.member)} facility=${text(agentId.facility)} handle=${text(agentId.handle)}`,
    );
  }
  if (baw.bnbBalance !== null && baw.bnbBalance !== undefined) lines.push(`  BNB balance: ${text(baw.bnbBalance)}`);
  if (baw.txLock !== null && baw.txLock !== undefined) lines.push(`  tx-lock: ${text(baw.txLock)}`);
  return lines;
}

function renderCall(value: unknown): string[] {
  const call = obj(value);
  if (call.to === undefined) return [];
  return [`Call: ${text(call.functionName)} -> ${text(call.to)} (value=${text(call.valueWei ?? call.value)} wei)`];
}

function renderRisks(value: unknown): string[] {
  const risks = obj(value);
  const lines: string[] = [];
  const details = arr(risks.riskDetails).map(obj);
  if (details.length === 0) lines.push("  (no transaction-level risks reported)");
  for (const risk of details) {
    lines.push(`  [${text(risk.riskType)}] ${text(risk.title)} — ${text(risk.description)}`);
  }
  const addresses = obj(risks.addresses);
  for (const [address, infoValue] of Object.entries(addresses)) {
    const info = obj(infoValue);
    const addressRisks = arr(info.riskDetails).map(obj);
    lines.push(`  Address ${address} riskLevel=${text(info.riskLevel)}`);
    for (const risk of addressRisks) {
      lines.push(`    [${text(risk.riskType)}] ${text(risk.title)} — ${text(risk.description)}`);
    }
  }
  return lines;
}

function renderPreview(value: unknown): string[] {
  const preview = obj(value);
  if (preview.requestId === undefined) return [];
  const lines: string[] = [
    "",
    "Preview (nothing sent):",
    `  Request ID: ${text(preview.requestId)}`,
    `  Expires: ${formatExpiry(preview.expiresAt)}`,
    `  Requires Binance App confirmation: ${preview.requireConfirmation === true ? "YES" : "no"}`,
  ];
  const parsed = obj(preview.parsedTx);
  if (Object.keys(parsed).length > 0) {
    lines.push("  Parsed transaction:");
    for (const [key, item] of Object.entries(parsed)) {
      lines.push(`    ${key}: ${typeof item === "object" ? JSON.stringify(item) : text(item)}`);
    }
  }
  const simulation = obj(preview.simulationResult);
  if (Object.keys(simulation).length > 0) {
    lines.push(
      `  Simulation: code=${text(simulation.simulationCode)} error=${text(simulation.simulationErrorDetail)} balanceChanges=${arr(
        simulation.balanceChanges,
      ).length} allowanceChanges=${arr(simulation.allowanceChanges).length} authorityChanges=${arr(simulation.authorityChanges).length}`,
    );
  }
  lines.push("  Risks:");
  lines.push(...renderRisks(preview.risks));
  lines.push(`  Next: ${text(preview.nextCommand)}`);
  return lines;
}

function renderNeedsApproval(value: unknown): string[] {
  const steps = arr(value).map(obj);
  if (steps.length === 0) return [];
  const lines: string[] = ["", "Needs approval first (previewed, not executed):"];
  steps.forEach((step, index) => {
    const preview = obj(step.preview);
    lines.push(
      `  ${index + 1}. ${text(step.kind).toUpperCase()} token ${text(step.tokenId)} of ${text(step.token)} -> spender ${text(step.spender)}`,
    );
    lines.push(`     reason: ${text(step.reason)}`);
    lines.push(`     requestId: ${text(preview.requestId)}`);
    lines.push(`     next: ${text(step.nextCommand)}`);
  });
  return lines;
}

function renderAddressBook(value: unknown): string[] {
  const book = obj(value);
  const keys = [
    "chainId",
    "network",
    "rpcUrl",
    "startBlock",
    "governance",
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
  if (Object.keys(book).length === 0) return [];
  return ["Address book:", ...keys.map((key) => `  ${key}: ${text(book[key])}`)];
}

function renderDoctor(data: Json): string {
  const lines: string[] = [];
  lines.push(`Agentmarket doctor — ${text(data.network)} (chain ${text(data.chainId)})`);
  lines.push(`RPC ${text(data.rpcHost)} | block ${text(data.blockNumber)} | gas ${text(data.gasPriceGwei)} gwei`);
  lines.push(...renderBaw(data.baw));
  lines.push("");
  lines.push("Checks:");
  lines.push(...checkLines(data.checks));
  const market = obj(data.market);
  if (market.address !== undefined) {
    lines.push("");
    lines.push(
      `Agentmarket ${text(market.address)} | feeBps=${text(market.feeBps)} max=${text(market.maxFeeBps)} treasury=${text(
        market.treasury,
      )}`,
    );
  }
  const policy = obj(data.policy);
  if (policy.current !== undefined) {
    lines.push(`Policy: current=${text(policy.current)} allowed=${text(policy.allowed)} version=${text(policy.version)}`);
  }
  const identity = obj(data.identity);
  if (identity.adapter !== undefined) {
    lines.push(
      `Identity adapter: ${text(identity.adapter)} kind=${text(identity.kind)} version=${text(identity.version)} chainId=${text(
        identity.chainId,
      )}`,
    );
  }
  const eligibility = obj(data.eligibility);
  if (eligibility.address !== undefined) {
    const agentId = obj(eligibility.agentId);
    lines.push(
      `Agent ID: wallet=${text(eligibility.address)} eligible=${text(eligibility.eligible)} handle=${text(agentId.handle)} balance=${text(
        agentId.balance,
      )}`,
    );
  }
  const missing = arr(data.contracts)
    .map(obj)
    .filter((item) => item.configured === false);
  if (missing.length > 0) {
    lines.push("");
    lines.push(`Not configured: ${missing.map((item) => text(item.key)).join(", ")}`);
  }
  lines.push(...warningLines(data.warnings));
  lines.push("");
  lines.push(`Result: ${data.healthy === true ? "healthy" : "unhealthy"}`);
  return lines.join("\n");
}

function renderStatus(data: Json): string {
  const lines: string[] = [];
  lines.push(`Agentmarket status — ${text(data.network)} (chain ${text(data.chainId)})`);
  lines.push(`Health: ${data.healthy === true ? "healthy" : "degraded"}`);
  lines.push(`RPC ${text(data.rpcHost)} | block ${text(data.blockNumber)} | gas ${text(data.gasPriceGwei)} gwei`);
  lines.push(...renderBaw(data.wallet));
  lines.push(...renderAddressBook(data.addressBook));
  const market = obj(data.market);
  if (market.address !== undefined) {
    lines.push(
      `Agentmarket: ${text(market.address)} feeBps=${text(market.feeBps)} max=${text(market.maxFeeBps)} treasury=${text(
        market.treasury,
      )}`,
    );
  }
  const policy = obj(data.policy);
  if (policy.current !== undefined) lines.push(`Policy: ${text(policy.current)} (allowed=${text(policy.allowed)})`);
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderCollection(data: Json, action: string): string[] {
  const collection = obj(data.collection);
  const lines = [`${action} — ${text(collection.name)} (${text(collection.symbol)}) ${text(collection.address)}`];
  lines.push(
    `Creator: ${text(collection.creator)} | policy: ${text(collection.policy)} | factory: ${text(collection.factory)}`,
  );
  lines.push(
    `Supply: minted ${text(collection.totalMinted)} / max ${text(collection.maxSupply)}${
      collection.remainingSupply === undefined ? "" : ` (remaining ${text(collection.remainingSupply)})`
    }`,
  );
  if (collection.baseURI !== undefined) lines.push(`Base URI: ${text(collection.baseURI)}`);
  if (collection.metadataURI !== undefined) lines.push(`Metadata URI: ${text(collection.metadataURI)}`);
  if (collection.metadataResolver !== undefined) lines.push(`Metadata resolver: ${text(collection.metadataResolver)}`);
  return lines;
}

function renderCollectionInfo(data: Json): string {
  const lines = renderCollection(data, "collection info");
  const registry = obj(data.registry);
  lines.push(`Registry ${text(registry.address)}: registered=${bold(registry.registered)}`);
  if (registry.registered === true) {
    lines.push(
      `  policyOf=${text(registry.policy)} (matches=${bool(registry.policyMatchesCollection)}) creatorOf=${text(
        registry.creator,
      )} (matches=${bool(registry.creatorMatchesCollection)})`,
    );
  }
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderNftInfo(data: Json): string {
  const nft = obj(data.nft);
  const lines = [`nft info — ${text(obj(data.collection).name)} #${text(nft.tokenId)}`];
  lines.push(`Collection: ${text(nft.collection)}`);
  lines.push(`Owner: ${text(nft.owner)}`);
  lines.push(`Token URI: ${text(nft.tokenURI)}`);
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderCollectionCreate(data: Json): string {
  const collection = obj(data.collection);
  const lines = ["collection create — PREVIEW ONLY (not sent)"];
  lines.push(...renderBaw(data.wallet));
  lines.push(`Name/Symbol: ${text(collection.name)} / ${text(collection.symbol)} | maxSupply: ${text(collection.maxSupply)}`);
  lines.push(`Base URI: ${text(collection.baseURI)} | metadata URI: ${text(collection.metadataURI)}`);
  lines.push(`Resolver: ${text(collection.metadataResolver)} | policy: ${text(collection.policy)} (${text(collection.policySource)})`);
  lines.push(`Creator: ${text(collection.creator)}`);
  lines.push(...renderCall(data.call));
  lines.push(...renderPreview(data.preview));
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderCollectionMint(data: Json): string {
  const collection = obj(data.collection);
  const lines = [`collection mint — PREVIEW ONLY (not sent) | mode: ${text(data.mode)}`];
  lines.push(...renderBaw(data.wallet));
  lines.push(
    `Collection ${text(collection.address)} ${text(collection.name)} (${text(collection.symbol)}) | remaining ${text(
      collection.remainingSupplyBefore,
    )}`,
  );
  lines.push(`Total to mint: ${text(data.totalCount)}`);
  for (const recipient of arr(data.recipients).map(obj)) {
    lines.push(`  ${text(recipient.address)}: ${text(recipient.count)}`);
  }
  lines.push(...renderCall(data.call));
  lines.push(...renderPreview(data.preview));
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderNftApprove(data: Json): string {
  const approval = obj(data.approval);
  const lines = ["nft approve — PREVIEW ONLY (not sent)"];
  lines.push(...renderBaw(data.wallet));
  lines.push(
    `${approval.revoke === true ? "REVOKE" : "APPROVE"} token ${text(approval.tokenId)} of ${text(approval.collection)} -> spender ${text(
      approval.spender,
    )}`,
  );
  lines.push(`Owner: ${text(approval.owner)}`);
  lines.push(...renderCall(data.call));
  lines.push(...renderPreview(data.preview));
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderNftApproveAll(data: Json): string {
  const approval = obj(data.approval);
  const lines = ["nft approve-all — PREVIEW ONLY (not sent)"];
  lines.push(...renderBaw(data.wallet));
  lines.push(
    `${approval.approved === true ? "APPROVE ALL" : "REVOKE ALL"} in ${text(approval.collection)} for operator ${text(
      approval.operator,
    )}`,
  );
  lines.push(`Currently approved: ${bool(approval.currentlyApproved)}`);
  lines.push(...renderCall(data.call));
  lines.push(...renderPreview(data.preview));
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderMarketStatus(data: Json): string {
  const listing = obj(data.listing);
  const approval = obj(data.approval);
  const lines = [`market status — ${text(data.collection)} #${text(data.tokenId)}`];
  lines.push(`Owner: ${text(data.owner)} | registered: ${bool(data.registered)} | executable: ${bold(data.executable)}`);
  lines.push(
    `Listing: active=${bool(listing.active)} seller=${text(listing.seller)} price=${text(listing.priceBnb)} BNB deadline=${text(
      listing.deadlineIso,
    )} feeBps=${text(listing.feeBps)}`,
  );
  lines.push(
    `Approval: market=${text(approval.market)} getApproved=${text(approval.getApproved)} isApprovedForAll=${bool(
      approval.isApprovedForAll,
    )} approved=${bold(approval.approvedForMarket)}`,
  );
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderMarketList(data: Json): string {
  const lines = [`market list — ${text(data.status).toUpperCase()} | ${text(data.collection)} #${text(data.tokenId)}`];
  lines.push(...renderBaw(data.wallet));
  lines.push(`Price: ${text(data.priceBnb)} BNB (${text(data.priceWei)} wei) | deadline: ${text(data.deadlineIso)}`);
  const market = obj(data.market);
  lines.push(`Market ${text(market.address)} feeBps=${text(market.feeBps)} treasury=${text(market.treasury)}`);
  const approval = obj(data.approval);
  lines.push(`Approval: approved=${bold(approval.approvedForMarket)} getApproved=${text(approval.getApproved)}`);
  if (data.status === "needsApproval") {
    lines.push(...renderNeedsApproval(data.needsApproval));
    if (typeof data.approveAllCommand === "string") {
      lines.push(`Alternative: ${data.approveAllCommand}`);
    }
  } else {
    lines.push(...renderCall(data.call));
    lines.push(...renderPreview(data.preview));
  }
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderMarketCancel(data: Json): string {
  const listing = obj(data.listing);
  const lines = ["market cancel — PREVIEW ONLY (not sent)"];
  lines.push(...renderBaw(data.wallet));
  lines.push(
    `Listing: ${text(listing.collection)} #${text(listing.tokenId)} seller=${text(listing.seller)} price=${text(
      listing.priceBnb,
    )} BNB`,
  );
  lines.push(...renderCall(data.call));
  lines.push(...renderPreview(data.preview));
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderMarketBuy(data: Json): string {
  const listing = obj(data.listing);
  const lines = ["market buy — PREVIEW ONLY (not sent)"];
  lines.push(...renderBaw(data.wallet));
  lines.push(
    `Listing: ${text(data.collection)} #${text(data.tokenId)} seller=${text(listing.seller)} price=${text(data.priceBnb)} BNB`,
  );
  lines.push(`Value: ${text(data.valueWei)} wei | feeBps=${text(data.feeBps)} fee=${text(data.marketplaceFeeWei)} wei`);
  lines.push(...renderCall(data.call));
  lines.push(...renderPreview(data.preview));
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderTxExecute(data: Json): string {
  const status = text(data.status);
  const txHash = text(data.txHash);
  const headline =
    status === "PENDING_CONFIRMATION"
      ? "tx execute — PENDING App confirmation (not yet confirmed)"
      : txHash !== "—" && txHash !== "null"
        ? "tx execute — broadcast (not yet confirmed)"
        : "tx execute — submitted to Binance Agentic Wallet";
  const lines = [headline];
  lines.push(`Request ID: ${text(data.requestId)}`);
  lines.push(`Status: ${status} | orderId: ${text(data.orderId)} | txHash: ${txHash}`);
  if (data.message !== null) lines.push(`Message: ${text(data.message)}`);
  const next = obj(data.next);
  lines.push(`Next: ${text(next.command)}`);
  lines.push(`Note: ${text(next.note)}`);
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function renderTxStatus(data: Json): string {
  const lines = ["tx status"];
  lines.push(`Source: ${text(data.source)} | status: ${text(data.status)} | txHash: ${text(data.txHash)}`);
  if (data.orderId !== undefined) lines.push(`Order ID: ${text(data.orderId)} | requestId: ${text(data.requestId)}`);
  const tx = obj(data.tx);
  if (Object.keys(tx).length > 0) {
    lines.push(`BAW: chain=${text(tx.binanceChainId)} status=${text(tx.status)} time=${text(tx.txTime)}`);
  }
  if (data.note !== undefined) lines.push(`Note: ${text(data.note)}`);
  lines.push(...warningLines(data.warnings));
  return lines.join("\n");
}

function bold(value: unknown): string {
  return value === true ? "YES" : value === false ? "no" : "—";
}

/** Human-readable error text, including BAW risk details when present. */
export function renderErrorHuman(payload: ErrorPayload): string {
  const lines = [`error [${payload.error.code}]: ${payload.error.message}`];
  const details = obj(payload.error.details);
  const bawError = obj(details.bawError);
  const riskContainer = obj(obj(bawError.data).risks);
  if (Object.keys(riskContainer).length > 0) {
    lines.push("Risks:", ...renderRisks(riskContainer).map((line) => line.replace(/^  /, "")));
  }
  const call = obj(details.call);
  if (call.to !== undefined) {
    lines.push(`Call: ${text(call.functionName)} -> ${text(call.to)} (value=${text(call.valueWei)} wei)`);
  }
  return lines.join("\n");
}

/** Human-readable text for a successful command result; also used as MCP text content. */
export function renderHuman(result: Json): string {
  const data = toJsonSafe(result) as Json;
  switch (data.command) {
    case "doctor":
      return renderDoctor(data);
    case "status":
      return renderStatus(data);
    case "collection info":
      return renderCollectionInfo(data);
    case "nft info":
      return renderNftInfo(data);
    case "collection create":
      return renderCollectionCreate(data);
    case "collection mint":
      return renderCollectionMint(data);
    case "nft approve":
      return renderNftApprove(data);
    case "nft approve-all":
      return renderNftApproveAll(data);
    case "market status":
      return renderMarketStatus(data);
    case "market list":
      return renderMarketList(data);
    case "market cancel":
      return renderMarketCancel(data);
    case "market buy":
      return renderMarketBuy(data);
    case "tx execute":
      return renderTxExecute(data);
    case "tx status":
      return renderTxStatus(data);
    default:
      return JSON.stringify(data, null, 2);
  }
}
