#!/usr/bin/env bash
# Export compiled ABIs into packages/shared/abis so Brain and Face can type
# their viem clients against the real contracts. Repeatable: run after any
# change to the Solidity.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/../packages/shared/abis"
cd "$ROOT"

command -v forge >/dev/null 2>&1 || { echo "forge not on PATH"; exit 1; }

forge build >/dev/null
mkdir -p "$OUT"

# forge inspect emits just the ABI array as JSON.
forge inspect MandateRegistry abi --json > "$OUT/MandateRegistry.json"
forge inspect ReceiptLog abi --json > "$OUT/ReceiptLog.json"

echo "Wrote:"
echo "  $OUT/MandateRegistry.json"
echo "  $OUT/ReceiptLog.json"
echo "Remember: packages/shared/abis/index.ts re-exports them 'as const' for viem."
