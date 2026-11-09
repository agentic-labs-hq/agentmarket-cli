import { UsageError } from "./errors.js";

export type FlagKind = "boolean" | "value" | "repeatable";
export type FlagSpec = Record<string, FlagKind>;
export type FlagValue = string | boolean | string[];

const BASE_FLAGS: FlagSpec = { json: "boolean", help: "boolean" };

export interface CommandSpec {
  /** Short one-line description used by help output. */
  summary: string;
  flags: FlagSpec;
}

/** Complete preview/read command surface. There is no broadcast/dry-run mode. */
export const COMMANDS: Record<string, CommandSpec> = {
  doctor: {
    summary: "read-only RPC + NFT deployment + Binance Agentic Wallet health check",
    flags: {},
  },
  status: {
    summary: "read-only chain/address-book/market/wallet snapshot",
    flags: {},
  },
  skill: {
    summary: "print the packaged SKILL.md operational guide",
    flags: {},
  },
  "collection info": {
    summary: "read an NFT collection and its registry record",
    flags: {
      collection: "value",
    },
  },
  "collection create": {
    summary: "build and preview a gated NFT collection creation",
    flags: {
      name: "value",
      symbol: "value",
      "max-supply": "value",
      "base-uri": "value",
      "metadata-uri": "value",
      resolver: "value",
      policy: "value",
    },
  },
  "collection mint": {
    summary: "build and preview NFT mint or mintBatch",
    flags: {
      collection: "value",
      to: "value",
      count: "value",
      recipient: "repeatable",
    },
  },
  "nft info": {
    summary: "read NFT owner, token URI, and collection basics",
    flags: {
      collection: "value",
      "token-id": "value",
    },
  },
  "nft approve": {
    summary: "build and preview a single-token market approval or revoke",
    flags: {
      collection: "value",
      "token-id": "value",
      spender: "value",
      revoke: "boolean",
    },
  },
  "nft approve-all": {
    summary: "build and preview setApprovalForAll or its revoke",
    flags: {
      collection: "value",
      operator: "value",
      revoke: "boolean",
    },
  },
  "market status": {
    summary: "read a listing, executability, ownership, and approval",
    flags: {
      collection: "value",
      "token-id": "value",
    },
  },
  "market list": {
    summary: "check approval and preview an Agentmarket listing",
    flags: {
      collection: "value",
      "token-id": "value",
      price: "value",
      deadline: "value",
    },
  },
  "market cancel": {
    summary: "build and preview cancellation of your listing",
    flags: {
      collection: "value",
      "token-id": "value",
    },
  },
  "market buy": {
    summary: "read a listing and preview Agentmarket buy with the exact value",
    flags: {
      collection: "value",
      "token-id": "value",
    },
  },
  "tx execute": {
    summary: "execute one previewed BAW request (requires --confirm)",
    flags: {
      "request-id": "value",
      confirm: "boolean",
    },
  },
  "tx status": {
    summary: "query a transaction by tx hash or a locally journaled order id",
    flags: {
      "order-id": "value",
      "tx-hash": "value",
    },
  },
};

export interface ParsedCommand {
  command: string;
  flags: Record<string, FlagValue>;
}

function commandError(message: string): never {
  throw new UsageError(message);
}

/** Resolve the command path, rejecting unknown or incomplete command tokens. */
export function resolveCommand(argv: readonly string[]): { command: string; rest: string[] } {
  if (argv.length === 0) return { command: "help", rest: [] };
  const first = argv[0]!;
  if (first === "--help" || first === "-h" || first === "help") return { command: "help", rest: argv.slice(1) };
  if (first === "--version" || first === "version") return { command: "version", rest: argv.slice(1) };

  let key: string;
  let length: number;
  if (first === "doctor" || first === "status" || first === "skill") {
    key = first;
    length = 1;
  } else if (first === "collection") {
    const sub = argv[1];
    if (sub !== "info" && sub !== "create" && sub !== "mint") {
      commandError(
        'Unknown collection command. Expected "agentmarket collection info", "collection create", or "collection mint".',
      );
    }
    key = `collection ${sub}`;
    length = 2;
  } else if (first === "nft") {
    const sub = argv[1];
    if (sub !== "info" && sub !== "approve" && sub !== "approve-all") {
      commandError(
        'Unknown nft command. Expected "agentmarket nft info", "nft approve", or "nft approve-all".',
      );
    }
    key = `nft ${sub}`;
    length = 2;
  } else if (first === "market") {
    const sub = argv[1];
    if (sub !== "status" && sub !== "list" && sub !== "cancel" && sub !== "buy") {
      commandError(
        'Unknown market command. Expected "agentmarket market status|list|cancel|buy".',
      );
    }
    key = `market ${sub}`;
    length = 2;
  } else if (first === "tx") {
    const sub = argv[1];
    if (sub !== "execute" && sub !== "status") {
      commandError('Unknown tx command. Expected "agentmarket tx execute" or "agentmarket tx status".');
    }
    key = `tx ${sub}`;
    length = 2;
  } else {
    commandError(`Unknown command "${first}". Run "agentmarket --help" for usage.`);
  }

  if (!(key in COMMANDS)) commandError(`Command "${key}" is not implemented.`);
  return { command: key, rest: argv.slice(length) };
}

/** Parse `--flag value`, `--flag=value`, boolean flags, and repeatable flags. */
export function parseFlags(
  args: readonly string[],
  spec: FlagSpec,
  command = "command",
  baseFlags: FlagSpec = BASE_FLAGS,
): Record<string, FlagValue> {
  const allSpec: FlagSpec = { ...baseFlags, ...spec };
  const flags: Record<string, FlagValue> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "-h") {
      flags.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      commandError(`Unexpected argument "${arg}" for ${command}. Options must start with "--".`);
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    if (name === "" || name.startsWith("-")) commandError(`Invalid option "${arg}".`);
    const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);
    const kind = allSpec[name];
    if (kind === undefined) commandError(`Unknown option "--${name}" for ${command}.`);

    if (kind === "boolean") {
      if (inlineValue !== undefined) commandError(`Option "--${name}" does not take a value.`);
      if (flags[name] !== undefined) commandError(`Option "--${name}" was provided more than once.`);
      flags[name] = true;
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        commandError(`Option "--${name}" needs a value.`);
      }
      value = next;
      index += 1;
    }
    if (value === "") commandError(`Option "--${name}" needs a non-empty value.`);

    if (kind === "repeatable") {
      const existing = flags[name];
      if (existing === undefined) flags[name] = [value];
      else if (Array.isArray(existing)) existing.push(value);
      else commandError(`Option "--${name}" cannot mix single and repeated values.`);
    } else {
      if (flags[name] !== undefined) commandError(`Option "--${name}" was provided more than once.`);
      flags[name] = value;
    }
  }
  return flags;
}

export function parseCliArgs(argv: readonly string[]): ParsedCommand {
  const { command, rest } = resolveCommand(argv);
  if (command === "help" || command === "version") return { command, flags: {} };
  const spec = COMMANDS[command];
  if (spec === undefined) commandError(`Unknown command "${command}".`);
  return { command, flags: parseFlags(rest, spec.flags, `"agentmarket ${command}"`) };
}

export function flagString(flags: Record<string, FlagValue>, name: string, required = false): string | undefined {
  const value = flags[name];
  if (value === undefined) {
    if (required) throw new UsageError(`Missing required option --${name}.`);
    return undefined;
  }
  if (typeof value !== "string") throw new UsageError(`Option --${name} must be a single value.`);
  return value;
}

export function flagBool(flags: Record<string, FlagValue>, name: string): boolean {
  const value = flags[name];
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new UsageError(`Option --${name} is a boolean flag.`);
  return value;
}

export function flagStrings(flags: Record<string, FlagValue>, name: string, required = false): string[] {
  const value = flags[name];
  if (value === undefined) {
    if (required) throw new UsageError(`Missing required option --${name}.`);
    return [];
  }
  if (!Array.isArray(value)) throw new UsageError(`Option --${name} must be provided one or more times.`);
  return value;
}
