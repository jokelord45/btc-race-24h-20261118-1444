// Washout-bounce BTC trader for make.fun btc-race-24h-20261118-1444.
//
// Long only, one position, 70% of equity per trade. All arithmetic is
// bigint (exact, deterministic, no clock, no network, no randomness).
//
// Why a washout bounce, not the shallow mean-reversion bounce of the
// 0603 entry or the kit baselines (buy-and-hold / momentum / ema-cross /
// adx-momentum / rsi-bollinger): this dev window TRENDS DOWN (BTC
// $65,083 -> $63,261, -2.8% over 24h; 60m returns as low as -2.31%,
// only 6 bars >= +1% on 60m). Shallow dips keep falling here: the
// Bollinger-lower-band fade, the EMA-pullback and the Donchian breakout
// families all LOSE on this window (best -1.54 USDC in a 3-family
// parameter search). The money is in the one genuine capitulation:
// the early-session washout to $63,027, then a slow grind back up.
// So the entry demands a DEEP 30-minute drop (>= 1.0%) that has
// already started to turn (3-minute return >= +0.05%), buys 70% of
// equity, and then waits patiently for the full recovery.
//
// Entry: 30-minute return <= -1.0% AND 3-minute return >= +0.05%.
// Exit: take profit at +2.0% over cost, stop loss at -0.8% under cost.
// On dev this fires once: buy bar 71 at $63,435.57 (30m -2.38%),
// sell bar 502 at $64,921.10, +13.46 USDC net, max drawdown 1.05%.
// One round trip is thin evidence and the race window is unseen —
// the wide stop and the patient +2% target are the honest trade-off
// for a window where shallow signals bleed.
//
// Fallback: if no buy has FILLED by batch 1400, buy 35% of equity at
// market on the next bar. The race guardrail needs >= 1 trade, and a
// quiet race window (no washout at all) would otherwise leave the
// entry with zero trades and no prize. Filled, not merely sent: a buy
// the replay rejected must not disable the fallback.
//
// No orders during warm-up. A gap adds nothing to the close history.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100;
const SIZE_BPS = 7000n; // 70% of equity on the washout entry
const FALLBACK_SIZE_BPS = 3500n; // 35% on the late-window fallback entry
const FALLBACK_SEQ = 1400;
const DROP_BPS = 100n; // 30-min return <= -1.0% (washout)
const UP_BPS = 5n; // 3-min return >= +0.05% (washout turning up)
const TP_BPS = 200n; // take profit +2.0% over cost
const SL_BPS = 80n; // stop loss -0.8% under cost

const closes: bigint[] = [];
let buysFilled = 0;

await runBars({
  onBatch(state, batch) {
    for (const fill of batch.fills) {
      if (fill.side === 'buy' && fill.status === 'filled') buysFilled += 1;
    }
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    closes.push(BigInt(bar.c));
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      const cost = held.cost;
      if (value * 10000n >= cost * (10000n + TP_BPS) || value * 10000n <= cost * (10000n - SL_BPS)) {
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }

    const n = closes.length;
    if (n < 31) return [];
    const now = closes[n - 1];
    let sizeBps: bigint | null = null;
    // washout entry: 30-min drop of >= 1.0% that has started to turn up
    const r30 = now * 10000n <= closes[n - 31] * (10000n - DROP_BPS);
    const r3 = now * 10000n >= closes[n - 4] * (10000n + UP_BPS);
    if (r30 && r3) {
      sizeBps = SIZE_BPS;
    } else if (state.seq >= FALLBACK_SEQ && buysFilled === 0) {
      // late-window fallback: guarantee at least one trade
      sizeBps = FALLBACK_SIZE_BPS;
    }
    if (sizeBps === null) return [];
    let notional = (state.equity * sizeBps) / 10000n;
    if (notional > state.cash) notional = state.cash;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS };
    return [buy];
  },
});
