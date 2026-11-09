#!/usr/bin/env node
import {
  flagBool,
  flagString,
  flagStrings,
  parseCliArgs,
  type FlagValue,
} from "./args.js";
import { runCollectionCreate } from "./core/collection-create.js";
import { runCollectionInfo } from "./core/collection-info.js";
import { runCollectionMint } from "./core/collection-mint.js";
import { runDoctor } from "./core/doctor.js";
import { runMarketBuy } from "./core/market-buy.js";
import { runMarketCancel } from "./core/market-cancel.js";
import { runMarketList } from "./core/market-list.js";
import { runMarketStatus } from "./core/market-status.js";
import { runNftApprove, runNftApproveAll } from "./core/nft-approve.js";
import { runNftInfo } from "./core/nft-info.js";
import { runStatus } from "./core/status.js";
import { runTxExecute } from "./core/tx-execute.js";
import { runTxStatus } from "./core/tx-status.js";
import { errorPayload } from "./errors.js";
import { helpFor, MAIN_HELP } from "./help.js";
import { writeJson } from "./json.js";
import { renderErrorHuman, renderHuman } from "./render.js";
import { createRuntime, type Runtime } from "./runtime.js";
import { readSkillText } from "./skill.js";
import { VERSION } from "./version.js";

const jsonRequested = (argv: readonly string[]): boolean => argv.includes("--json");

async function dispatch(
  command: string,
  flags: Record<string, FlagValue>,
  runtime: Runtime,
): Promise<Record<string, unknown>> {
  switch (command) {
    case "doctor":
      return runDoctor(runtime);
    case "status":
      return runStatus(runtime);
    case "collection info":
      return runCollectionInfo(runtime, {
        collection: flagString(flags, "collection", true)!,
      });
    case "collection create":
      return runCollectionCreate(runtime, {
        name: flagString(flags, "name", true)!,
        symbol: flagString(flags, "symbol", true)!,
        maxSupply: flagString(flags, "max-supply", true)!,
        baseUri: flagString(flags, "base-uri") ?? "",
        metadataUri: flagString(flags, "metadata-uri", true)!,
        ...(flagString(flags, "resolver") === undefined ? {} : { resolver: flagString(flags, "resolver") }),
        ...(flagString(flags, "policy") === undefined ? {} : { policy: flagString(flags, "policy") }),
      });
    case "collection mint":
      return runCollectionMint(runtime, {
        collection: flagString(flags, "collection", true)!,
        ...(flagString(flags, "to") === undefined ? {} : { to: flagString(flags, "to") }),
        ...(flagString(flags, "count") === undefined ? {} : { count: flagString(flags, "count") }),
        recipients: flagStrings(flags, "recipient"),
      });
    case "nft info":
      return runNftInfo(runtime, {
        collection: flagString(flags, "collection", true)!,
        tokenId: flagString(flags, "token-id", true)!,
      });
    case "nft approve":
      return runNftApprove(runtime, {
        collection: flagString(flags, "collection", true)!,
        tokenId: flagString(flags, "token-id", true)!,
        revoke: flagBool(flags, "revoke"),
        ...(flagString(flags, "spender") === undefined ? {} : { spender: flagString(flags, "spender") }),
      });
    case "nft approve-all":
      return runNftApproveAll(runtime, {
        collection: flagString(flags, "collection", true)!,
        revoke: flagBool(flags, "revoke"),
        ...(flagString(flags, "operator") === undefined ? {} : { operator: flagString(flags, "operator") }),
      });
    case "market status":
      return runMarketStatus(runtime, {
        collection: flagString(flags, "collection", true)!,
        tokenId: flagString(flags, "token-id", true)!,
      });
    case "market list":
      return runMarketList(runtime, {
        collection: flagString(flags, "collection", true)!,
        tokenId: flagString(flags, "token-id", true)!,
        price: flagString(flags, "price", true)!,
        ...(flagString(flags, "deadline") === undefined ? {} : { deadline: flagString(flags, "deadline") }),
      });
    case "market cancel":
      return runMarketCancel(runtime, {
        collection: flagString(flags, "collection", true)!,
        tokenId: flagString(flags, "token-id", true)!,
      });
    case "market buy":
      return runMarketBuy(runtime, {
        collection: flagString(flags, "collection", true)!,
        tokenId: flagString(flags, "token-id", true)!,
      });
    case "tx execute":
      return runTxExecute(runtime, {
        requestId: flagString(flags, "request-id", true)!,
        confirm: flagBool(flags, "confirm"),
      });
    case "tx status":
      return runTxStatus(runtime, {
        ...(flagString(flags, "order-id") === undefined ? {} : { orderId: flagString(flags, "order-id") }),
        ...(flagString(flags, "tx-hash") === undefined ? {} : { txHash: flagString(flags, "tx-hash") }),
      });
    default:
      throw new Error(`Unhandled command "${command}".`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    const payload = errorPayload(error);
    if (jsonRequested(argv)) writeJson(payload);
    else process.stderr.write(`${renderErrorHuman(payload)}\n`);
    process.exitCode = 1;
    return;
  }

  if (parsed.command === "help") {
    process.stdout.write(`${MAIN_HELP}\n`);
    return;
  }
  if (parsed.command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (flagBool(parsed.flags, "help")) {
    process.stdout.write(`${helpFor(parsed.command)}\n`);
    return;
  }

  if (parsed.command === "skill") {
    const skill = readSkillText();
    if (flagBool(parsed.flags, "json")) {
      writeJson({ ok: true, command: "skill", skill });
    } else {
      process.stdout.write(skill.endsWith("\n") ? skill : `${skill}\n`);
    }
    return;
  }

  const json = flagBool(parsed.flags, "json");
  try {
    const runtime = createRuntime();
    const result = await dispatch(parsed.command, parsed.flags, runtime);
    if (json) writeJson(result);
    else process.stdout.write(`${renderHuman(result)}\n`);
  } catch (error) {
    const payload = errorPayload(error, parsed.command);
    if (json) writeJson(payload);
    else process.stderr.write(`${renderErrorHuman(payload)}\n`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const payload = errorPayload(error);
  if (jsonRequested(process.argv.slice(2))) writeJson(payload);
  else process.stderr.write(`${renderErrorHuman(payload)}\n`);
  process.exitCode = 1;
});
