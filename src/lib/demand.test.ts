import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  FITS,
  OBS,
  SKUS,
  advise,
  decisionCurve,
  demandAt,
  fitById,
  revenueWeightedElasticity,
} from "./demand";

describe("the panel", () => {
  it("is SKU × channel × month", () => {
    expect(OBS).toHaveLength(SKUS.length * CHANNELS.length * 36);
    for (const fit of FITS) expect(fit.n).toBe(CHANNELS.length * 36);
  });

  it("randomised prices around each SKU's reference price", () => {
    for (const fit of FITS) {
      expect(fit.priceMin).toBeLessThan(fit.sku.price);
      expect(fit.priceMax).toBeGreaterThan(fit.sku.price);
      expect(fit.meanPrice).toBeCloseTo(fit.sku.price, -1);
    }
  });
});

describe("the regression", () => {
  it("recovers each known elasticity within sampling error", () => {
    for (const fit of FITS) {
      expect(Math.abs(fit.elasticity - fit.sku.elasticity)).toBeLessThan(0.4);
      expect(fit.elasticityT).toBeLessThan(-3);
      expect(fit.elasticitySe).toBeGreaterThan(0);
    }
  });

  it("recovers the promo lift of roughly 16 log points", () => {
    for (const fit of FITS) expect(Math.abs(fit.promo - 0.16)).toBeLessThan(0.1);
  });

  it("fits well because price was assigned, not chosen", () => {
    for (const fit of FITS) expect(fit.r2).toBeGreaterThan(0.85);
  });

  it("puts the reference cell near the base volume", () => {
    for (const fit of FITS) {
      const ratio = demandAt(fit, fit.sku.price) / fit.sku.baseQty;
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(1.15);
    }
  });

  it("demand falls as price rises", () => {
    for (const fit of FITS) {
      expect(demandAt(fit, fit.sku.price * 1.1)).toBeLessThan(demandAt(fit, fit.sku.price));
    }
  });
});

describe("the decision", () => {
  it("looks up a SKU by id and rejects unknown ones", () => {
    expect(fitById("kids").sku.name).toBe("Kids");
    expect(() => fitById("floss")).toThrow();
  });

  it("recommends only prices that were actually tested", () => {
    for (const fit of FITS) {
      const a = advise(fit);
      expect(a.bestInSample).toBeGreaterThanOrEqual(fit.priceMin - 1e-9);
      expect(a.bestInSample).toBeLessThanOrEqual(fit.priceMax + 1e-9);
      expect(a.bestProfit).toBeGreaterThanOrEqual(a.currentProfit - 1e-9);
      expect(a.deltaPct).toBeCloseTo(a.bestInSample / fit.sku.price - 1, 12);
      const expected = a.deltaPct > 0.03 ? "raise" : a.deltaPct < -0.03 ? "cut" : "hold";
      expect(a.direction).toBe(expected);
    }
  });

  it("reports the Lerner price only when demand is elastic", () => {
    for (const fit of FITS) {
      const a = advise(fit);
      if (fit.elasticity < -1) {
        const e = fit.elasticity;
        expect(a.lerner).toBeCloseTo((fit.sku.mc * e) / (e + 1), 10);
      } else {
        expect(a.lerner).toBeNull();
      }
    }
  });

  it("tells the inelastic SKU to raise and the over-priced premium SKU to cut", () => {
    expect(advise(fitById("kids")).direction).toBe("raise");
    expect(advise(fitById("charcoal")).direction).toBe("cut");
  });

  it("draws the contribution curve across 62%–145% of the reference price", () => {
    const fit = fitById("classic");
    const curve = decisionCurve(fit);
    expect(curve).toHaveLength(48);
    expect(curve[0]?.price).toBeCloseTo(fit.sku.price * 0.62, 10);
    expect(curve[47]?.price).toBeCloseTo(fit.sku.price * 1.45, 10);
    for (const pt of curve) {
      expect(pt.revenue).toBeCloseTo((pt.price * pt.qty) / 1e5, 10);
      expect(pt.profit).toBeCloseTo(((pt.price - fit.sku.mc) * pt.qty) / 1e5, 10);
    }
  });

  it("revenue-weighted elasticity lies between the most and least elastic SKU", () => {
    const e = revenueWeightedElasticity();
    const es = FITS.map((f) => f.elasticity);
    expect(e).toBeGreaterThanOrEqual(Math.min(...es));
    expect(e).toBeLessThanOrEqual(Math.max(...es));
  });
});
