import { describe, expect, it } from "vitest";

import {
  COMMANDS,
  flagBool,
  flagString,
  flagStrings,
  parseCliArgs,
  parseFlags,
  resolveCommand,
} from "../src/args.js";
import { UsageError } from "../src/errors.js";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

describe("command resolution", () => {
  it("resolves the Agentmarket command surface", () => {
    for (const command of [
      "doctor",
      "status",
      "skill",
      "collection info",
      "collection create",
      "collection mint",
      "nft info",
      "nft approve",
      "nft approve-all",
      "market status",
      "market list",
      "market cancel",
      "market buy",
      "tx execute",
      "tx status",
    ]) {
      const tokens = command.split(" ");
      expect(resolveCommand(tokens).command).toBe(command);
    }
    expect(resolveCommand([]).command).toBe("help");
    expect(resolveCommand(["--help"]).command).toBe("help");
    expect(resolveCommand(["version"]).command).toBe("version");
    expect(Object.keys(COMMANDS)).toHaveLength(15);
  });

  it("rejects unknown, incomplete, and old FT commands", () => {
    expect(() => resolveCommand(["nope"])).toThrowError(UsageError);
    expect(() => resolveCommand(["collection"])).toThrowError(UsageError);
    expect(() => resolveCommand(["collection", "burn"])).toThrowError(UsageError);
    expect(() => resolveCommand(["nft"])).toThrowError(UsageError);
    expect(() => resolveCommand(["nft", "transfer"])).toThrowError(UsageError);
    expect(() => resolveCommand(["market"])).toThrowError(UsageError);
    expect(() => resolveCommand(["tx"])).toThrowError(UsageError);
    expect(() => resolveCommand(["token", "create"])).toThrowError(UsageError);
    expect(() => resolveCommand(["dex", "swap"])).toThrowError(UsageError);
  });
});

describe("flag parsing", () => {
  it("parses doctor --json", () => {
    const parsed = parseCliArgs(["doctor", "--json"]);
    expect(parsed.flags.json).toBe(true);
    expect(flagBool(parsed.flags, "json")).toBe(true);
  });

  it("parses collection create flags", () => {
    const parsed = parseCliArgs([
      "collection",
      "create",
      "--name",
      "Example",
      "--symbol=EGT",
      "--max-supply",
      "1000",
      "--base-uri",
      "ipfs://base/",
      "--metadata-uri",
      "ipfs://meta.json",
    ]);
    expect(parsed.command).toBe("collection create");
    expect(flagString(parsed.flags, "name")).toBe("Example");
    expect(flagString(parsed.flags, "symbol")).toBe("EGT");
    expect(flagString(parsed.flags, "max-supply")).toBe("1000");
    expect(flagString(parsed.flags, "base-uri")).toBe("ipfs://base/");
    expect(flagString(parsed.flags, "metadata-uri")).toBe("ipfs://meta.json");
  });

  it("parses repeated mint recipients and single-recipient mode", () => {
    const batch = parseCliArgs([
      "collection",
      "mint",
      "--collection",
      A,
      "--recipient",
      `${A}:2`,
      `--recipient=${B}:1`,
    ]);
    expect(batch.command).toBe("collection mint");
    expect(flagStrings(batch.flags, "recipient")).toEqual([`${A}:2`, `${B}:1`]);

    const single = parseCliArgs(["collection", "mint", "--collection", A, "--to", B, "--count", "3"]);
    expect(flagString(single.flags, "to")).toBe(B);
    expect(flagString(single.flags, "count")).toBe("3");
  });

  it("parses nft approvals, market list, and tx flags", () => {
    const approve = parseCliArgs(["nft", "approve", "--collection", A, "--token-id", "7", "--revoke"]);
    expect(flagString(approve.flags, "token-id")).toBe("7");
    expect(flagBool(approve.flags, "revoke")).toBe(true);

    const approveAll = parseCliArgs(["nft", "approve-all", "--collection", A, "--operator", B]);
    expect(flagString(approveAll.flags, "operator")).toBe(B);

    const list = parseCliArgs([
      "market",
      "list",
      "--collection",
      A,
      "--token-id",
      "7",
      "--price",
      "0.5",
      "--deadline",
      "1800000000",
    ]);
    expect(flagString(list.flags, "price")).toBe("0.5");
    expect(flagString(list.flags, "deadline")).toBe("1800000000");

    const execute = parseCliArgs(["tx", "execute", "--request-id", "req-1", "--confirm"]);
    expect(flagString(execute.flags, "request-id")).toBe("req-1");
    expect(flagBool(execute.flags, "confirm")).toBe(true);

    const byOrder = parseCliArgs(["tx", "status", "--order-id", "order-1"]);
    expect(flagString(byOrder.flags, "order-id")).toBe("order-1");
    const byHash = parseCliArgs(["tx", "status", "--tx-hash", `0x${"ab".repeat(32)}`]);
    expect(flagString(byHash.flags, "tx-hash")).toBe(`0x${"ab".repeat(32)}`);
  });

  it("rejects unknown, duplicate, missing, and positional arguments", () => {
    expect(() => parseFlags(["--nope"], {}, "test")).toThrowError(UsageError);
    expect(() => parseFlags(["--json", "--json"], {}, "test")).toThrowError(UsageError);
    expect(() => parseFlags(["--json=true"], {}, "test")).toThrowError(UsageError);
    expect(() => parseFlags(["--fee"], { fee: "value" }, "test")).toThrowError(UsageError);
    expect(() => parseFlags(["stray"], {}, "test")).toThrowError(UsageError);
  });

  it("removes FT and broadcast flags entirely", () => {
    expect(() => parseCliArgs(["collection", "create", "--broadcast"])).toThrowError(UsageError);
    expect(() => parseCliArgs(["collection", "create", "--dry-run"])).toThrowError(UsageError);
    expect(() => parseCliArgs(["nft", "approve", "--token-id", "7", "--token", A])).toThrowError(UsageError);
    expect(() => parseCliArgs(["market", "buy", "--collection", A, "--token-id", "7", "--value", "1"]))
      .toThrowError(UsageError);
  });

  it("supports --help on a subcommand", () => {
    const parsed = parseCliArgs(["market", "status", "--help"]);
    expect(parsed.flags.help).toBe(true);
  });
});
