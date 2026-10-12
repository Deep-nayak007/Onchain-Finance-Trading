# LEASH: give your AI trader slack, never your keys

Automated trading has three trust problems: bots hold your keys, nobody can explain why they traded, and their track
records are self-reported. LEASH fixes all three for people who don't think of themselves as crypto users.

You sign in with Face ID, write your rules in plain English ("never more than $20 a trade, 2x, stop if I'm down 5% this
week"), and sign a Leash Card onchain. Then you hire a trader: Falcon follows smart money, Otter fades stretched moves,
Owl harvests funding and hedges on Kuru.

The trader only proposes. A pure-code checker decides, and five independent knots can stop it: the onchain mandate, a
policy-locked Privy wallet that can only send money back to you, a Perpl trade-only key that can't withdraw, a Chainlink
CRE Referee that pauses on losses, liquidation risk or stale data, and your passkey kill switch.

Every decision, including denials and shadow calls, is committed to Monad as a receipt. Your phone recomputes its hash
and shows a ✓ only when it matches what the trader actually saw and decided. When the trader is confident but blocked by
a limit, it asks for slack ("5x for 60 minutes, max extra risk $8"), and you approve it with Face ID. The grant expires
on its own and is written onchain.

Monad makes this practical. Receipts are cheap enough to log every call, finality is fast enough to show
decision-to-confirmation time on each receipt, and Perpl and Kuru provide real venues.

Today the full loop runs on Monad testnet in paper mode: compile, sign, trade decisions, onchain receipts, slack
approval, kill switch, and a Referee breach that paused a user. Live Perpl execution switches on when the gateway ships.
