import { mean, mulberry32, ols, randn, type Ols } from "./stats";

export type SkuSpec = {
  id: string;
  name: string;
  /** Retail price at the reference cell, ₹. */
  price: number;
  /** Cash cost, ₹ per unit. */
  mc: number;
  /** True constant elasticity. Known only because the panel is synthetic. */
  elasticity: number;
  /** Monthly units in general trade, no promo, competitor index 100. */
  baseQty: number;
  note: string;
};

export const SKUS: SkuSpec[] = [
  {
    id: "classic",
    name: "Classic soft",
    price: 30,
    mc: 11,
    elasticity: -1.45,
    baseQty: 82000,
    note: "The volume line. Mildly elastic.",
  },
  {
    id: "medium",
    name: "Medium family",
    price: 36,
    mc: 13,
    elasticity: -1.2,
    baseQty: 54000,
    note: "Inelastic enough that the tested band still wants a higher price.",
  },
  {
    id: "kids",
    name: "Kids",
    price: 42,
    mc: 17,
    elasticity: -0.7,
    baseQty: 31000,
    note: "Parents are not shopping the price. Markup can rise.",
  },
  {
    id: "charcoal",
    name: "Charcoal",
    price: 74,
    mc: 22,
    elasticity: -2.15,
    baseQty: 18000,
    note: "A premium SKU priced past its contribution peak.",
  },
  {
    id: "travel",
    name: "Travel twin",
    price: 28,
    mc: 8.5,
    elasticity: -1.95,
    baseQty: 26000,
    note: "Convenience pack. Elastic, and a little expensive.",
  },
];

export const CHANNELS = ["General trade", "Modern trade", "D2C", "Quick commerce"] as const;
const CHANNEL_SHIFT = [0, -0.22, -0.55, -0.72];

export type Obs = {
  sku: string;
  channel: string;
  month: number;
  price: number;
  qty: number;
  promo: number;
  comp: number;
};

export type SkuFit = {
  sku: SkuSpec;
  ols: Ols;
  /** Estimated price elasticity (log-log coefficient). */
  elasticity: number;
  elasticitySe: number;
  elasticityT: number;
  promo: number;
  promoT: number;
  comp: number;
  r2: number;
  n: number;
  /** Intercept of the decision curve: GT, no promo, comp index 100, season 0. */
  intercept: number;
  meanPrice: number;
  meanQty: number;
  priceMin: number;
  priceMax: number;
};

function buildObs(seed: number): Obs[] {
  const rand = mulberry32(seed);
  const obs: Obs[] = [];
  for (const sku of SKUS) {
    for (let month = 0; month < 36; month++) {
      for (let c = 0; c < CHANNELS.length; c++) {
        const promo = rand() < 0.18 ? 1 : 0;
        const logPriceShock = 0.075 * randn(rand);
        const promoCut = promo ? -0.1 : 0;
        const price = Math.max(5, sku.price * Math.exp(logPriceShock + promoCut));
        const comp = 100 * Math.exp(0.04 * randn(rand));
        const season = 0.05 * Math.sin((2 * Math.PI * month) / 12);
        const lnQty =
          Math.log(sku.baseQty) +
          sku.elasticity * Math.log(price / sku.price) +
          0.16 * promo +
          0.22 * Math.log(comp / 100) +
          CHANNEL_SHIFT[c]! +
          season +
          0.12 * randn(rand);
        obs.push({
          sku: sku.id,
          channel: CHANNELS[c]!,
          month,
          price,
          qty: Math.exp(lnQty),
          promo,
          comp,
        });
      }
    }
  }
  return obs;
}

export const OBS: Obs[] = buildObs(77021);

function fitSku(sku: SkuSpec): SkuFit {
  const rows = OBS.filter((o) => o.sku === sku.id);
  const y = rows.map((o) => Math.log(o.qty));
  // columns: intercept, ln price, promo, ln comp, modern, d2c, quick, season
  const X = rows.map((o) => [
    1,
    Math.log(o.price),
    o.promo,
    Math.log(o.comp / 100),
    o.channel === "Modern trade" ? 1 : 0,
    o.channel === "D2C" ? 1 : 0,
    o.channel === "Quick commerce" ? 1 : 0,
    Math.sin((2 * Math.PI * o.month) / 12),
  ]);
  const fit = ols(y, X);
  const prices = rows.map((o) => o.price);
  return {
    sku,
    ols: fit,
    elasticity: fit.beta[1]!,
    elasticitySe: fit.se[1]!,
    elasticityT: fit.t[1]!,
    promo: fit.beta[2]!,
    promoT: fit.t[2]!,
    comp: fit.beta[3]!,
    r2: fit.r2,
    n: fit.n,
    intercept: fit.beta[0]!,
    meanPrice: mean(prices),
    meanQty: mean(rows.map((o) => o.qty)),
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
  };
}

export const FITS: SkuFit[] = SKUS.map(fitSku);

export function fitById(id: string): SkuFit {
  const found = FITS.find((f) => f.sku.id === id);
  if (!found) throw new Error(`Unknown SKU ${id}`);
  return found;
}

/** Units at a retail price, reference cell (general trade, no promo). */
export function demandAt(fit: SkuFit, price: number): number {
  return Math.exp(fit.intercept + fit.elasticity * Math.log(price));
}

export type CurvePoint = {
  price: number;
  qty: number;
  revenue: number;
  profit: number;
};

export function decisionCurve(fit: SkuFit, steps = 48): CurvePoint[] {
  const lo = fit.sku.price * 0.62;
  const hi = fit.sku.price * 1.45;
  const pts: CurvePoint[] = [];
  for (let i = 0; i < steps; i++) {
    const price = lo + ((hi - lo) * i) / (steps - 1);
    const qty = demandAt(fit, price);
    const revenue = (price * qty) / 1e5;
    const profit = ((price - fit.sku.mc) * qty) / 1e5;
    pts.push({ price, qty, revenue, profit });
  }
  return pts;
}

export type PriceAdvice = {
  /** Best price inside the observed range. */
  bestInSample: number;
  bestProfit: number;
  currentProfit: number;
  /** Constant-elasticity Lerner price, if elasticity < -1. */
  lerner: number | null;
  direction: "raise" | "cut" | "hold";
  deltaPct: number;
};

export function advise(fit: SkuFit): PriceAdvice {
  const lo = fit.priceMin;
  const hi = fit.priceMax;
  let bestPrice = fit.sku.price;
  let bestProfit = -Infinity;
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const price = lo + ((hi - lo) * i) / steps;
    const profit = (price - fit.sku.mc) * demandAt(fit, price);
    if (profit > bestProfit) {
      bestProfit = profit;
      bestPrice = price;
    }
  }
  const currentProfit = (fit.sku.price - fit.sku.mc) * demandAt(fit, fit.sku.price);
  const e = fit.elasticity;
  const lerner = e < -1 ? (fit.sku.mc * e) / (e + 1) : null;
  const deltaPct = bestPrice / fit.sku.price - 1;
  let direction: PriceAdvice["direction"] = "hold";
  if (deltaPct > 0.03) direction = "raise";
  else if (deltaPct < -0.03) direction = "cut";
  return { bestInSample: bestPrice, bestProfit, currentProfit, lerner, direction, deltaPct };
}

export function revenueWeightedElasticity(): number {
  let w = 0;
  let s = 0;
  for (const fit of FITS) {
    const weight = fit.sku.price * fit.sku.baseQty;
    w += weight;
    s += weight * fit.elasticity;
  }
  return s / w;
}
