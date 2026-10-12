import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Spec = { paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, unknown> } };
const spec = parse(readFileSync(join(import.meta.dirname, "..", "openapi.yaml"), "utf8")) as Spec;

const require = createRequire(import.meta.url);
const fixture = (name: string): unknown => require(`@leash/shared/fixtures/${name}`);

const ajv = new Ajv2020({ strict: false, allErrors: true });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema({ $id: "openapi", components: spec.components });
const validate = (schema: string, value: unknown) => {
  const v = ajv.getSchema(`openapi#/components/schemas/${schema}`)!;
  const ok = v(value);
  expect(ok, JSON.stringify(v.errors)).toBe(true);
};

describe("openapi.yaml", () => {
  it("covers every §7.4 route", () => {
    const routes = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
    expect(routes.sort()).toEqual(
      [
        "POST /mandate/compile",
        "POST /agent/activate",
        "POST /agent/kill",
        "GET /agent/status/{account}",
        "GET /traders",
        "GET /receipts/{reasonHash}",
        "GET /slack/pending/{account}",
        "POST /slack/{id}/approved",
        "POST /slack/{id}/denied",
        "POST /devices",
        "POST /gas/drip",
        "GET /config",
        "POST /webhooks/alchemy",
      ].sort(),
    );
  });

  it("compile response includes the additive agentId, agentWallet, perplKey", () => {
    const op = spec.paths["/mandate/compile"]!.post as {
      responses: { "200": { content: { "application/json": { schema: { required: string[] } } } } };
    };
    expect(op.responses["200"].content["application/json"].schema.required).toEqual(
      expect.arrayContaining(["policy", "policyHash", "leashCard", "warnings", "agentId", "agentWallet", "perplKey"]),
    );
  });

  it("shared fixtures validate against the OpenAPI component schemas", () => {
    validate("Policy", fixture("policy.json"));
    for (const t of fixture("traders.json") as unknown[]) validate("Trader", t);
    for (const f of ["receipt-executed.json", "receipt-rejected.json", "receipt-shadow.json"]) validate("ReceiptDetail", fixture(f));
    validate("SlackRequest", fixture("slack-request.json"));
  });

  it("rejects an invalid payload (sanity check that validation is live)", () => {
    const v = ajv.getSchema("openapi#/components/schemas/Policy")!;
    expect(v({ ...(fixture("policy.json") as object), maxLeverage: -1 })).toBe(false);
  });
});
