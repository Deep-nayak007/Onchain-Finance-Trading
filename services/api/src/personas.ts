// The three traders: same engine, different prompt + default policy (ARCHITECTURE §2.4).
import { PERSONAS, type Persona, type PersonaId, type Policy } from "@leash/shared";
import type { Address } from "viem";

const base: Policy = {
  version: 1,
  markets: ["MON-PERP"],
  venues: ["PERPL"],
  maxLeverage: 3,
  maxNotionalUsd: "25",
  maxTotalExposureUsd: "50",
  maxWeeklyLossPct: 10,
  maxTradesPerHour: 4,
  cooldownSec: 300,
  requireSmartMoneyAgreement: true,
  minConfidence: 0.6,
  sleeveUsd: "0",
};

export const PERSONA_DEFS: Record<PersonaId, Omit<Persona, "agentId" | "wallet">> = {
  falcon: {
    id: "falcon",
    name: "Falcon",
    style: "Momentum. Follows smart money (Nansen) into strength.",
    mode: "LIVE",
    defaultPolicy: base,
  },
  otter: {
    id: "otter",
    name: "Otter",
    style: "Mean reversion. Small size, long cooldowns.",
    mode: "SHADOW",
    defaultPolicy: { ...base, maxLeverage: 1.5, maxNotionalUsd: "15", maxTotalExposureUsd: "30", maxTradesPerHour: 2, cooldownSec: 1800, requireSmartMoneyAgreement: false, minConfidence: 0.65 },
  },
  owl: {
    id: "owl",
    name: "Owl",
    style: "Funding harvester. Hedges spot on Kuru.",
    mode: "SHADOW",
    defaultPolicy: {
      ...base,
      markets: ["MON-PERP", "MON/AUSD"],
      venues: ["PERPL", "KURU"],
      maxLeverage: 2,
      maxNotionalUsd: "20",
      maxTotalExposureUsd: "40",
      maxTradesPerHour: 2,
      cooldownSec: 900,
      requireSmartMoneyAgreement: false,
      sleeveUsd: "20",
    },
  },
};

export const PERSONA_IDS = Object.keys(PERSONA_DEFS) as PersonaId[];

/** Unregistered agentId / unknown wallet render as "0" / zero address until Rails + Privy fill them. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function persona(id: PersonaId, wallet?: Address | null): Persona {
  const reg = PERSONAS[id];
  return { ...PERSONA_DEFS[id], agentId: reg.agentId ?? "0", wallet: wallet ?? reg.wallet ?? ZERO_ADDRESS };
}
