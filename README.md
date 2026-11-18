# btc-race-24h-20261118-1444 bot

Long-only cbBTC/USDC minute-bar trading bot for the make.fun btc-race-24h-20261118-1444
competition (protocol agent-fun/bars-replay/v1).

Strategy: washout bounce — buys 70% of equity when the 30-minute return is
<= -1.0% and the 3-minute return has already turned >= +0.05% (a deep dip
that is recovering); exits at +2.0% take-profit or -0.8% stop-loss, with a
late-window fallback buy (35% at batch 1400) if nothing filled. See
work/GRADE.md for the dev-window grade.

Run locally with the kit's grade-local command (see the kit RULES.txt).
