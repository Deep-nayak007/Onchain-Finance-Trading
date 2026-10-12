// Canonical JSON + hashes (ARCHITECTURE.md §6). Brain and Face MUST both use this file:
// the phone recomputes reasonHash from the API's ReceiptDetail and shows ✓ only on match.
//
// Rules: object keys sorted recursively (UTF-16 code unit order, same as Array.prototype.sort),
// no whitespace, arrays keep their order, strings/numbers encoded exactly as JSON.stringify.
// Object properties whose value is `undefined` are omitted (like JSON.stringify).
// Rejected (throws): non-finite numbers, bigint, functions, symbols, undefined in arrays or at
// the top level, and non-plain objects (Date, Map, class instances...).
import { keccak256, toBytes, type Hex } from "viem";

export class CanonicalJsonError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message} at ${path}`);
    this.name = "CanonicalJsonError";
  }
}

function isPlainObject(v: object): v is Record<string, unknown> {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalJsonError(`non-finite number ${value}`, path);
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value
          .map((item, i) => {
            if (item === undefined) throw new CanonicalJsonError("undefined in array", `${path}[${i}]`);
            return encode(item, `${path}[${i}]`);
          })
          .join(",")}]`;
      }
      if (!isPlainObject(value)) throw new CanonicalJsonError("non-plain object", path);
      const parts: string[] = [];
      for (const key of Object.keys(value).sort()) {
        const v = value[key];
        if (v === undefined) continue;
        parts.push(`${JSON.stringify(key)}:${encode(v, `${path}.${key}`)}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new CanonicalJsonError(`unsupported type ${typeof value}`, path);
  }
}

/** Deterministic JSON string: sorted keys, no whitespace. */
export function canonicalJSON(value: unknown): string {
  return encode(value, "$");
}

/** keccak256(utf8(canonicalJSON(value))) */
export function hashCanonical(value: unknown): Hex {
  return keccak256(toBytes(canonicalJSON(value)));
}

/** reasonHash = keccak256(utf8(canonicalJSON({ intent, decision }))) */
export function reasonHash(args: { intent: unknown; decision: unknown }): Hex {
  return hashCanonical({ intent: args.intent, decision: args.decision });
}

/** signalHash = keccak256(utf8(canonicalJSON(signalsSnapshot))) */
export function signalHash(signalsSnapshot: unknown): Hex {
  return hashCanonical(signalsSnapshot);
}

/** policyHash = keccak256(utf8(canonicalJSON(policy))) */
export function policyHash(policy: unknown): Hex {
  return hashCanonical(policy);
}
