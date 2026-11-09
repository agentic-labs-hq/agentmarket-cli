import { CliError } from "../errors.js";

const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s]/u;

/** ERC-721 collection name used by the factory. */
export function validateCollectionName(name: string): void {
  const length = [...name].length;
  if (length < 1 || length > 64) throw new CliError("INVALID_NAME", "collection name must be 1-64 characters.");
  if (name !== name.trim()) throw new CliError("INVALID_NAME", "collection name must not have leading or trailing whitespace.");
  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    throw new CliError("INVALID_NAME", "collection name must not contain control characters.");
  }
}

/** ERC-721 symbol used by the factory. */
export function validateCollectionSymbol(symbol: string): void {
  const length = [...symbol].length;
  if (length < 1 || length > 16) throw new CliError("INVALID_SYMBOL", "collection symbol must be 1-16 characters.");
  if (CONTROL_OR_SPACE.test(symbol)) {
    throw new CliError("INVALID_SYMBOL", "collection symbol must not contain spaces or control characters.");
  }
}

/** Base URI / metadata URI as stored on-chain (never uploaded or fetched). */
export function validateUri(value: string, label: string): void {
  const length = [...value].length;
  if (length < 1 || length > 2048) throw new CliError("INVALID_URI", `${label} must be 1-2048 characters.`);
  if (CONTROL_OR_SPACE.test(value)) throw new CliError("INVALID_URI", `${label} must not contain whitespace or control characters.`);
}

export function validateMaxSupply(value: bigint): void {
  if (value <= 0n) throw new CliError("INVALID_SUPPLY", "--max-supply must be greater than zero.");
}
