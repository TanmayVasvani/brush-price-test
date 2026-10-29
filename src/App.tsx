import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Field, Method, Metric, Panel, Reading, StudyHeader } from "./components/bits";
import { ChartBox, Tip, axisLine, tick } from "./components/chart-box";
import { Shell } from "./components/shell";
import {
  FITS,
  SKUS,
  advise,
  decisionCurve,
  demandAt,
  fitById,
  revenueWeightedElasticity,
} from "./lib/demand";
import { intish, num, pct, rupees } from "./lib/format";

export function App() {
  const [id, setId] = useState("charcoal");
  const fit = fitById(id);
  const [trial, setTrial] = useState(fit.sku.price);
  const curve = useMemo(() => decisionCurve(fit), [fit]);
  const advice = useMemo(() => advise(fit), [fit]);
  const qty = demandAt(fit, trial);
  const profit = ((trial - fit.sku.mc) * qty) / 1e5;
  const revenue = (trial * qty) / 1e5;
  const baseQty = demandAt(fit, fit.sku.price);
  const baseProfit = ((fit.sku.price - fit.sku.mc) * baseQty) / 1e5;
  const weighted = revenueWeightedElasticity();
  const promoLift = Math.exp(fit.promo) - 1;

  const bars = FITS.map((row) => ({
    name: row.sku.name,
    Estimated: row.elasticity,
    "Known elasticity": row.sku.elasticity,
  }));

  const direction =
    advice.direction === "raise" ? "Raise" : advice.direction === "cut" ? "Cut" : "Hold";

  return (
    <Shell project="Brush price test">
      <StudyHeader
        kicker="Pricing"
        title="Brush price test"
        lede="Five toothbrush SKUs, four channels, thirty-six months. Price was randomized, with a separate promo flag, so the log-log coefficient is an elasticity rather than a mixture of elasticity and a discounting policy. The price that gets recommended is the one that maximises contribution inside the range of prices that were actually tested."
      />

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Revenue-weighted elasticity"
          value={num(weighted)}
          hint="Weights are reference price times base volume. A 1% price rise cuts units by about this many percent."
        />
        <Metric
          label={`${fit.sku.name} elasticity`}
          value={num(fit.elasticity)}
          hint={`t = ${num(fit.elasticityT, 1)} · R² ${pct(fit.r2, 0)} · n = ${fit.n}`}
          tone="teal"
        />
        <Metric
          label="Move inside the sample"
          value={direction}
          hint={
            advice.direction === "hold"
              ? `${fit.sku.name} is within 3% of the best tested price.`
              : `${direction} ${fit.sku.name} by ${pct(Math.abs(advice.deltaPct), 0)}, to ${rupees(advice.bestInSample, 0)}.`
          }
          tone={advice.direction === "cut" ? "rust" : "teal"}
        />
        <Metric
          label="Contribution at the trial price"
          value={`₹${profit.toFixed(1)} L`}
          hint={`Versus ${rupees(fit.sku.price, 0)} today: ₹${baseProfit.toFixed(1)} L a month, general trade, no promo.`}
        />
      </div>

      <div className="mt-8">
        <Reading title="How to read a constant elasticity">
          {fit.elasticity < -1 ? (
            <>
              {fit.sku.name} is elastic. The textbook Lerner price, cost times elasticity over
              elasticity plus one, is{" "}
              {advice.lerner == null ? "not defined" : rupees(advice.lerner, 0)}.{" "}
              {advice.lerner != null &&
              (advice.lerner < fit.priceMin || advice.lerner > fit.priceMax) ? (
                <>
                  That price sits outside the experiment, so it is not the recommendation. Inside
                  the tested band the best price is {rupees(advice.bestInSample, 0)}.
                </>
              ) : (
                <>It sits inside the tested band, and it agrees with the grid search.</>
              )}
            </>
          ) : (
            <>
              {fit.sku.name} is inelastic on this estimate ({num(fit.elasticity)}). The Lerner
              formula does not give a finite positive price when elasticity is above −1. Inside the
              tested band, contribution is still rising at the top, so the recommendation is
              to test a higher price, not to declare an optimum the data never saw.
            </>
          )}{" "}
          A promo, holding price constant, lifts volume by about {pct(promoLift, 0)}. The
          cross-price coefficient on the competitor index is {num(fit.comp)}.
        </Reading>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="text-2xl">SKU</h2>
          <div className="mt-3 flex flex-col gap-1">
            {SKUS.map((sku) => {
              const on = sku.id === id;
              return (
                <button
                  key={sku.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setId(sku.id);
                    setTrial(sku.price);
                  }}
                  className={
                    on
                      ? "min-h-11 bg-ink px-3 text-left text-sm text-paper"
                      : "min-h-11 border border-line px-3 text-left text-sm text-ink"
                  }
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span>{sku.name}</span>
                    <span className="tabular-nums">{rupees(sku.price, 0)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Field
            label="Trial retail price"
            value={trial}
            min={Math.round(fit.sku.price * 0.62)}
            max={Math.round(fit.sku.price * 1.45)}
            step={1}
            display={rupees(trial, 0)}
            onChange={setTrial}
          />
          <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">
            <div className="border-t border-line pt-2">
              <dt className="text-xs tracking-widest text-muted uppercase">Units / month</dt>
              <dd className="mt-1 tabular-nums">{intish(qty)}</dd>
            </div>
            <div className="border-t border-line pt-2">
              <dt className="text-xs tracking-widest text-muted uppercase">Revenue</dt>
              <dd className="mt-1 tabular-nums">₹{revenue.toFixed(1)} L</dd>
            </div>
            <div className="border-t border-line pt-2">
              <dt className="text-xs tracking-widest text-muted uppercase">Cash cost</dt>
              <dd className="mt-1 tabular-nums">{rupees(fit.sku.mc)}</dd>
            </div>
            <div className="border-t border-line pt-2">
              <dt className="text-xs tracking-widest text-muted uppercase">Tested band</dt>
              <dd className="mt-1 tabular-nums">
                {rupees(fit.priceMin, 0)}–{rupees(fit.priceMax, 0)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">{fit.sku.note}</p>
        </div>
        <div className="lg:col-span-8">
          <Panel title="Contribution against price">
            <ChartBox>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis
                    dataKey="price"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tick={tick}
                    axisLine={axisLine}
                    tickLine={false}
                    tickFormatter={(value: number) => `₹${value.toFixed(0)}`}
                  />
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={36} />
                  <ReferenceArea
                    x1={fit.priceMin}
                    x2={fit.priceMax}
                    fill="var(--color-paper-2)"
                    fillOpacity={0.8}
                  />
                  <ReferenceLine
                    x={fit.sku.price}
                    stroke="var(--color-ink)"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine x={advice.bestInSample} stroke="var(--color-teal)" />
                  <ReferenceLine x={trial} stroke="var(--color-rust)" />
                  <Tooltip
                    content={(props) => (
                      <Tip
                        active={props.active}
                        label={
                          typeof props.label === "number" ? rupees(props.label, 0) : props.label
                        }
                        payload={props.payload?.map((row) => ({
                          name: String(row.name ?? ""),
                          value: Number(row.value),
                        }))}
                        format={(value, name) =>
                          name === "Units" ? intish(value) : `₹${value.toFixed(1)} L`
                        }
                      />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="var(--color-ink)"
                    dot={false}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Contribution"
                    stroke="var(--color-teal)"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
            <p className="mt-2 text-sm text-muted">
              ₹ lakh per month, general trade, promo off, competitor index at 100. The shaded band
              is the prices the experiment actually tried. Ink dash is today’s price, teal is the
              best price inside that band, rust is the trial price.
            </p>
          </Panel>
          <div className="mt-10">
            <Panel title="Elasticities, estimated and known">
              <ChartBox className="h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={tick}
                      axisLine={axisLine}
                      tickLine={false}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis
                      domain={[-2.5, 0]}
                      ticks={[0, -0.5, -1, -1.5, -2, -2.5]}
                      tick={tick}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                    />
                    <ReferenceLine y={-1} stroke="var(--color-rust)" />
                    <Tooltip
                      content={(props) => (
                        <Tip
                          active={props.active}
                          label={props.label}
                          payload={props.payload?.map((row) => ({
                            name: String(row.name ?? ""),
                            value: Number(row.value),
                          }))}
                          format={(value) => value.toFixed(2)}
                        />
                      )}
                    />
                    <Bar dataKey="Estimated" fill="var(--color-teal)" isAnimationActive={false} />
                    <Bar
                      dataKey="Known elasticity"
                      fill="var(--color-ink)"
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
              <p className="mt-2 text-sm text-muted">
                The rust line is unit elasticity. Above it — less negative than −1 — a higher price
                raises revenue. Known elasticities exist only because this panel was simulated.
              </p>
            </Panel>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <Panel title={`${fit.sku.name} regression`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs tracking-widest text-muted uppercase">
                <tr>
                  {["Term", "Estimate", "Std. error", "t"].map((heading) => (
                    <th key={heading} className="py-2 pr-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[
                  "Intercept",
                  "ln price",
                  "Promo",
                  "ln competitor",
                  "Modern trade",
                  "D2C",
                  "Quick commerce",
                  "Season",
                ].map((name, index) => {
                  const t = fit.ols.t[index]!;
                  return (
                    <tr key={name} className="border-t border-line">
                      <td className="py-2 pr-3">{name}</td>
                      <td className="py-2 pr-3">{num(fit.ols.beta[index]!)}</td>
                      <td className="py-2 pr-3">{num(fit.ols.se[index]!)}</td>
                      <td
                        className={`py-2 pr-3 ${Math.abs(t) >= 1.96 ? "text-ink" : "text-muted"}`}
                      >
                        {num(t, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-muted">
            General trade is the omitted channel. Season is a sine of the month. Dependent variable
            is log monthly units. A t past 1.96 is set in ink.
          </p>
        </Panel>
      </div>

      <div className="mt-8">
        <Method title="Method, and the commercial reading">
          <p>
            The panel is SKU × channel × month. Log quantity depends on log own price, a promo
            dummy, log of a competitor price index, channel dummies and a seasonal sine, plus
            Gaussian noise. Each SKU is fit on its own. The decision curve holds the dummies at the
            general-trade, no-promo, competitor-index-100 cell, and uses the estimated intercept and
            price slope — not the elasticity that generated the data.
          </p>
          <p>
            Contribution is (price − cash cost) × quantity. The recommended price maximises that
            inside the minimum and maximum price observed for the SKU. The Lerner price is reported
            only as a check. Where demand is inelastic, or the Lerner price leaves the sample, the
            study says so instead of inventing a point optimum. R² is high because price was
            assigned by the experiment. Observational retail data would not look like this, and an
            elasticity fit on discounts the firm chose would not deserve this confidence.
          </p>
        </Method>
      </div>
    </Shell>
  );
}
