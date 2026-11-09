import { formatUnits, getAddress, isAddress, parseUnits, zeroAddress, type Address } from "viem";

import { CliError } from "../errors.js";

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const INTEGER_PATTERN = /^-?\d+$/;
const UINT_PATTERN = /^\d+$/;
const MAX_UINT256 = 2n ** 256n - 1n;

/** Parse a human decimal string into base units, rejecting negatives/exponents. */
export function parseAmount(value: string, decimals: number, label: string): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new CliError("INVALID_DECIMALS", `${label}: token decimals must be between 0 and 255.`);
  }
  if (typeof value !== "string" || value.length === 0 || !DECIMAL_PATTERN.test(value)) {
    throw new CliError("INVALID_AMOUNT", `${label} must be a positive decimal string such as "1" or "1.5".`);
  }
  const fraction = value.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new CliError("INVALID_AMOUNT", `${label} has more than ${decimals} decimal places.`);
  }
  let amount: bigint;
  try {
    amount = parseUnits(value, decimals);
  } catch (error) {
    throw new CliError("INVALID_AMOUNT", `${label} is not a valid amount.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (amount > MAX_UINT256) {
    throw new CliError("INVALID_AMOUNT", `${label} exceeds uint256.`);
  }
  return amount;
}

/** Parse a human decimal string and require a non-zero value. */
export function parsePositiveAmount(value: string, decimals: number, label: string): bigint {
  const amount = parseAmount(value, decimals, label);
  if (amount <= 0n) throw new CliError("INVALID_AMOUNT", `${label} must be greater than zero.`);
  return amount;
}

/** Parse BNB as an 18-decimal human amount. */
export function parseBnb(value: string, label = "--price"): bigint {
  return parsePositiveAmount(value, 18, label);
}

/** Parse a non-negative integer string and enforce an optional inclusive maximum. */
export function parseUint(value: string, label: string, max: bigint = MAX_UINT256): bigint {
  if (typeof value !== "string" || !UINT_PATTERN.test(value)) {
    throw new CliError("INVALID_INTEGER", `${label} must be a non-negative integer.`);
  }
  const parsed = BigInt(value);
  if (parsed > max) throw new CliError("INVALID_INTEGER", `${label} exceeds the maximum ${max}.`);
  return parsed;
}

/** Parse a positive integer string and enforce an optional inclusive maximum. */
export function parsePositiveUint(value: string, label: string, max: bigint = MAX_UINT256): bigint {
  const parsed = parseUint(value, label, max);
  if (parsed <= 0n) throw new CliError("INVALID_INTEGER", `${label} must be greater than zero.`);
  return parsed;
}

/** Parse an integer and enforce inclusive bounds. */
export function parseInteger(value: string, label: string, bounds: { min?: number; max?: number } = {}): number {
  if (!INTEGER_PATTERN.test(value)) {
    throw new CliError("INVALID_INTEGER", `${label} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new CliError("INVALID_INTEGER", `${label} is outside the safe integer range.`);
  if (bounds.min !== undefined && parsed < bounds.min) {
    throw new CliError("INVALID_INTEGER", `${label} must be >= ${bounds.min}.`);
  }
  if (bounds.max !== undefined && parsed > bounds.max) {
    throw new CliError("INVALID_INTEGER", `${label} must be <= ${bounds.max}.`);
  }
  return parsed;
}

export function parseAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new CliError("INVALID_ADDRESS", `${label} is not a valid EVM address.`);
  }
  let address: Address;
  try {
    address = getAddress(value);
  } catch {
    throw new CliError("INVALID_ADDRESS", `${label} has an invalid EIP-55 checksum; use all-lowercase or the checksummed address.`);
  }
  if (address === zeroAddress) throw new CliError("INVALID_ADDRESS", `${label} must not be the zero address.`);
  return address;
}

/** Parse the `--recipient <address>:<count>` form used by collection mint. */
export interface RecipientCount {
  address: Address;
  count: bigint;
}

export function parseRecipientCount(value: string, index = 0): RecipientCount {
  const separator = value.lastIndexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new CliError(
      "INVALID_RECIPIENT",
      `--recipient[${index}] must use the form <address>:<count>, for example 0xabc...:2.`,
    );
  }
  const address = parseAddress(value.slice(0, separator), `--recipient[${index}] address`);
  const count = parsePositiveUint(value.slice(separator + 1), `--recipient[${index}] count`);
  return { address, count };
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/\.?0+$/, "");
}

/** Human BNB string for a wei amount. */
export function formatBnb(wei: bigint): string {
  return formatTokenAmount(wei, 18);
}

/** ISO timestamp for a Unix-seconds value; 0 or an out-of-range value is null. */
export function formatUnixSeconds(seconds: bigint): string | null {
  if (seconds === 0n) return null;
  const milliseconds = Number(seconds) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
