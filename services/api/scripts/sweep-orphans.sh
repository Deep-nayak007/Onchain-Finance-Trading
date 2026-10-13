#!/usr/bin/env bash
# Testnet ops (2026-10-13): return MON from 5 orphaned test-run agent wallets to the gas tank. See sweep-to-tank.ts.
set -euo pipefail
cd "$(dirname "$0")/.."
CHAIN_ID=10143 npx tsx --env-file=.env scripts/sweep-to-tank.ts \
  0xCD7258e85F775779330F509B741544d7E33B88e5 \
  0xf9C5607524cE71B93c0d4f3E52cA5935bD02C4CC \
  0xA3edb9Cb824721B128c8762a68d55ab56b8Ce680 \
  0xf6BB4AB532a982F93AdfA01dEE320a3B979CbB3E \
  0x5b7514e5acEe6d7C5B21FFF84b3c3d5234cA84C2 2>&1 | grep -v '^\[dotenv'
