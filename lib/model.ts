// Launch-value model for the token radar.
//
// The question this model answers: if a protocol that records no token today
// issued one tomorrow and the market priced it the way it prices the tokens
// of comparable live protocols, what would that token be worth?
//
// Every input comes from the sealed snapshot alone: the protocol's TVL, its
// seven-day TVL change, how long DefiLlama has tracked it, its category and
// its chains. No protocol name is ever consulted for its value.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  category_multiple: number;
  growth_pct: number | null;
  growth_factor: number;
  maturity_factor: number;
  chain_factor: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  symbol: string | null;
  listed_at: string | null;
}

export interface Board {
  rows: BoardRow[];
  live: LiveRow[];
  meta: {
    as_of: string;
    floor_usd: number;
    watchlist_count: number;
    eligible_count: number;
    row_count: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function wholeDaysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso + 'T00:00:00Z');
  const to = Date.parse(toIso + 'T00:00:00Z');
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Eligibility: which pre-token protocols the radar ranks
// ---------------------------------------------------------------------------

// Categories that are not a protocol's own launch: they move or wrap value
// that already has a token, or they are an exchange's own venue.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_SUFFIX = /\s(v\d+|V\d+|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_SUFFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Category launch multiples
// ---------------------------------------------------------------------------

export interface Multiples {
  byCategory: Map<string, number>;
  global: number;
}

export function categoryMultiples(protocols: Protocol[]): Multiples {
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    if (p.tvl_usd <= 0) continue;
    if (p.category === null) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    allRatios.push(ratio);
    const list = ratiosByCategory.get(p.category) ?? [];
    list.push(ratio);
    ratiosByCategory.set(p.category, list);
  }
  const global = clamp(median(allRatios), 0.08, 0.45);
  const byCategory = new Map<string, number>();
  for (const [category, ratios] of ratiosByCategory) {
    // Shrink a thin category toward the global median: six phantom
    // observations at the global value keep small samples honest.
    const shrunk =
      (ratios.length * median(ratios) + 6 * global) / (ratios.length + 6);
    byCategory.set(category, clamp(shrunk, 0.08, 0.45));
  }
  return { byCategory, global };
}

// ---------------------------------------------------------------------------
// The value model
// ---------------------------------------------------------------------------

export function growthFactor(change7d: number | null): {
  pct: number | null;
  factor: number;
} {
  if (change7d === null || !Number.isFinite(change7d)) {
    return { pct: null, factor: 1 };
  }
  const clamped = clamp(change7d, -40, 60);
  return { pct: change7d, factor: 1 + 0.5 * (clamped / 100) };
}

export function maturityFactor(ageDays: number | null): number {
  if (ageDays === null) return 0.65;
  // Four years of operating with no token earns the full factor.
  return 0.65 + 0.35 * (Math.min(ageDays, 1460) / 1460);
}

export function chainFactor(chains: string[]): number {
  return 1 + 0.02 * Math.min(Math.max(chains.length - 1, 0), 6);
}

export function scoreProtocol(
  p: Protocol,
  multiples: Multiples,
  asOf: string,
): { value: number; breakdown: ModelBreakdown } {
  const age = p.listed_at === null ? null : wholeDaysBetween(p.listed_at, asOf);
  const multiple =
    p.category !== null && multiples.byCategory.has(p.category)
      ? multiples.byCategory.get(p.category)!
      : multiples.global;
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(age);
  const chains = chainFactor(p.chains);
  const value = Math.max(
    1,
    Math.round(p.tvl_usd * multiple * growth.factor * maturity * chains),
  );
  return {
    value,
    breakdown: {
      category_multiple: multiple,
      growth_pct: growth.pct,
      growth_factor: growth.factor,
      maturity_factor: maturity,
      chain_factor: chains,
      age_days: age,
    },
  };
}

// ---------------------------------------------------------------------------
// Farm plans: concrete steps, with a cost and a time for each
// ---------------------------------------------------------------------------

function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 500_000_000) return 250;
  if (tvlUsd >= 100_000_000) return 150;
  if (tvlUsd >= 25_000_000) return 100;
  return 50;
}

function holdDaysFor(ageDays: number | null): number {
  if (ageDays === null || ageDays < 365) return 60;
  if (ageDays < 730) return 45;
  return 30;
}

function mainAction(category: string | null, name: string, chain: string, capital: number): string {
  const amount = `$${capital}`;
  switch (category) {
    case 'Dexs':
      return `Provide ${amount} of liquidity to ${name}'s main pool on ${chain} and keep the position open. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
    case 'Lending':
      return `Supply ${amount} of USDC to ${name} on ${chain} and leave it lent out. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit ${amount} of USDC into ${name}'s vault on ${chain} and keep the shares. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
    case 'Derivatives':
    case 'Leveraged Farming':
      return `Open a ${amount} hedged position on ${name} on ${chain} and keep it delta-neutral. Cost: ${amount} of capital and about $5 of gas on ${chain}. Time: 20 minutes to set up.`;
    case 'RWA':
      return `Buy ${amount} of ${name}'s tokenised asset on ${chain} and hold the receipt. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
    case 'Onchain Capital Allocator':
    case 'Risk Curators':
      return `Allocate ${amount} of USDC to a ${name} vault on ${chain} and keep the allocation. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
    case 'Options Vault':
      return `Deposit ${amount} of USDC into ${name}'s options vault on ${chain} for one full epoch. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
    case 'CDP Manager':
      return `Open a ${amount} collateralised position through ${name} on ${chain} and keep it above the liquidation line. Cost: ${amount} of capital and about $5 of gas on ${chain}. Time: 20 minutes to set up.`;
    default:
      return `Use ${name}'s core product on ${chain} with ${amount} of USDC and keep the position open. Cost: ${amount} of capital and about $4 of gas on ${chain}. Time: 15 minutes to set up.`;
  }
}

export function farmPlan(p: Protocol, ageDays: number | null): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(ageDays);
  return [
    'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
    mainAction(p.category, p.name, chain, capital),
    `Do one qualifying action each week on ${chain}, such as a deposit, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Once a week, compare ${p.name}'s TVL with last week's figure; if it falls more than 20% in a week, halve the position before the next snapshot. Cost: no fee to check. Time: 5 minutes a week.`,
    `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it when a token launches. Cost: nothing but the log. Time: 5 minutes.',
  ];
}

// ---------------------------------------------------------------------------
// Board assembly
// ---------------------------------------------------------------------------

export const BOARD_TARGET_ROWS = 200;

export function buildBoard(snapshot: Snapshot): Board {
  const multiples = categoryMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);

  const scored: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isRankable(p)) continue;
    const { value, breakdown } = scoreProtocol(p, multiples, snapshot.as_of);
    scored.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      token_status: 'pre-token',
      watchlist: watchlist.has(p.slug),
      age_days: breakdown.age_days,
      implied_value_usd: value,
      model: breakdown,
      farm_steps: farmPlan(p, breakdown.age_days),
    });
  }

  const byValue = (a: BoardRow, b: BoardRow): number =>
    b.implied_value_usd - a.implied_value_usd ||
    b.tvl_usd - a.tvl_usd ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

  // Every watchlist protocol is in, then the strongest of the rest.
  const watchRows = scored.filter((r) => r.watchlist).sort(byValue);
  const earlyRows = scored
    .filter((r) => !r.watchlist)
    .sort(byValue)
    .slice(0, BOARD_TARGET_ROWS - watchRows.length);
  const rows = [...watchRows, ...earlyRows].sort(byValue);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  // Protocols whose token already trades: shown apart, never ranked.
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.mcap_usd !== null)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd as number,
      symbol: p.symbol,
      listed_at: p.listed_at,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  return {
    rows,
    live,
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      watchlist_count: snapshot.watchlist.length,
      eligible_count: scored.length,
      row_count: rows.length,
    },
  };
}
