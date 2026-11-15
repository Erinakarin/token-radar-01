# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Erinakarin/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Erinakarin/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 200 protocols that record no token yet, ranked by what a token would be worth if the market priced it the way it prices the tokens of comparable live protocols. Each row carries a concrete farm plan, and the dashboard lets you search, filter, sort and open a detail view for every protocol.

The model is derived from the sealed DefiLlama snapshot alone. A protocol's implied value is its TVL times a category launch multiple — the median market-cap-to-TVL ratio of that category's protocols that already have a token, shrunk toward the global median — times a growth factor from its seven-day TVL change, a maturity factor for how long it has run with no token, and a small bonus for chain diversity. Protocols whose token already trades are shown apart with their real market caps, never ranked.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=qwgwvh7w&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
