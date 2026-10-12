import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { CanonicalJsonError, canonicalJSON, hashCanonical, policyHash, reasonHash, signalHash } from "../src/canonical";

describe("canonicalJSON", () => {
  it("is independent of key insertion order", () => {
    const a = { b: 1, a: "x", c: true };
    const b = { c: true, a: "x", b: 1 };
    expect(canonicalJSON(a)).toBe('{"a":"x","b":1,"c":true}');
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it("sorts nested object keys recursively", () => {
    const v = { z: { y: { b: 2, a: 1 }, x: [{ d: 4, c: 3 }] }, a: null };
    expect(canonicalJSON(v)).toBe('{"a":null,"z":{"x":[{"c":3,"d":4}],"y":{"a":1,"b":2}}}');
  });

  it("keeps array order", () => {
    expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJSON([3, 1, 2])).not.toBe(canonicalJSON([1, 2, 3]));
  });

  it("emits no whitespace", () => {
    expect(canonicalJSON({ a: [1, { b: "c d" }] })).toBe('{"a":[1,{"b":"c d"}]}');
  });

  it("encodes strings and numbers like JSON.stringify", () => {
    expect(canonicalJSON({ s: 'q"\\\n é', n: 0.1, e: 1e21, z: -0 })).toBe(
      `{"e":1e+21,"n":0.1,"s":${JSON.stringify('q"\\\n é')},"z":0}`,
    );
  });

  it("sorts keys by UTF-16 code unit order", () => {
    expect(canonicalJSON({ b: 1, B: 2, a: 3, _: 4 })).toBe('{"B":2,"_":4,"a":3,"b":1}');
  });

  it("omits undefined object properties", () => {
    expect(canonicalJSON({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite number %s", (n) => {
    expect(() => canonicalJSON({ a: [n] })).toThrow(CanonicalJsonError);
    expect(() => canonicalJSON({ a: [n] })).toThrow(/non-finite number .* at \$\.a\[0\]/);
  });

  it.each([
    ["bigint", 1n],
    ["function", () => 1],
    ["symbol", Symbol("x")],
    ["Date", new Date(0)],
    ["Map", new Map()],
    ["undefined top-level", undefined],
  ])("rejects %s", (_name, v) => {
    expect(() => canonicalJSON(v)).toThrow(CanonicalJsonError);
  });

  it("rejects undefined inside arrays", () => {
    expect(() => canonicalJSON([1, undefined])).toThrow(/undefined in array/);
  });

  it("accepts null-prototype objects", () => {
    const o = Object.assign(Object.create(null) as object, { b: 1, a: 2 });
    expect(canonicalJSON(o)).toBe('{"a":2,"b":1}');
  });
});

describe("hashes", () => {
  it("hash = keccak256(utf8(canonicalJSON(x)))", () => {
    const v = { b: [1, 2], a: "ü" };
    expect(hashCanonical(v)).toBe(keccak256(toBytes('{"a":"ü","b":[1,2]}')));
  });

  it("reasonHash wraps { intent, decision }", () => {
    const intent = { id: "i" };
    const decision = { allowed: true };
    expect(reasonHash({ intent, decision })).toBe(hashCanonical({ decision, intent }));
  });

  it("signalHash and policyHash hash the value itself", () => {
    expect(signalHash({ a: 1 })).toBe(hashCanonical({ a: 1 }));
    expect(policyHash({ version: 1 })).toBe(hashCanonical({ version: 1 }));
  });
});
