import {
  Calculator,
  DollarSign,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "./api";
import type { HourlyRates, UserRole, VehicleType } from "./types";

interface TieredPricingEngineProps {
  rates: HourlyRates;
  role: UserRole;
  onRefreshRates: () => Promise<void>;
  onNotify: (text: string, error?: boolean) => void;
}

export function TieredPricingEngine({
  rates,
  role,
  onRefreshRates,
  onNotify,
}: TieredPricingEngineProps) {
  const isManager = role === "manager" || role === "admin";

  // Form state for Manager configuration
  const [stdHourly, setStdHourly] = useState(rates.standard || 40);
  const [stdDaily, setStdDaily] = useState(rates.tiers?.standard?.daily_rate || 350);
  const [stdWeekly, setStdWeekly] = useState(rates.tiers?.standard?.weekly_rate || 2100);

  const [evHourly, setEvHourly] = useState(rates.ev || 70);
  const [evDaily, setEvDaily] = useState(rates.tiers?.ev?.daily_rate || 600);
  const [evWeekly, setEvWeekly] = useState(rates.tiers?.ev?.weekly_rate || 3600);

  const [accHourly, setAccHourly] = useState(rates.accessible || 30);
  const [accDaily, setAccDaily] = useState(rates.tiers?.accessible?.daily_rate || 250);
  const [accWeekly, setAccWeekly] = useState(rates.tiers?.accessible?.weekly_rate || 1500);

  const [dailyThreshold, setDailyThreshold] = useState(8);
  const [saving, setSaving] = useState(false);

  // Interactive Simulator State
  const [simVehicle, setSimVehicle] = useState<VehicleType>("standard");
  const [simDurationHours, setSimDurationHours] = useState<number>(10);

  // Automated calculation engine logic in simulator
  const simCalculation = useMemo(() => {
    const hours = Math.max(1, Math.round(simDurationHours));
    let hourly = stdHourly;
    let daily = stdDaily;
    let weekly = stdWeekly;

    if (simVehicle === "ev") {
      hourly = evHourly;
      daily = evDaily;
      weekly = evWeekly;
    } else if (simVehicle === "accessible") {
      hourly = accHourly;
      daily = accDaily;
      weekly = accWeekly;
    }

    const standardTotal = hours * hourly;
    const threshold = dailyThreshold;

    let tierApplied = "Short-Term (Hourly)";
    const breakdown: Array<{ unit: string; count: number; rate: number; subtotal: number }> = [];

    if (hours < threshold) {
      breakdown.push({ unit: "Hours", count: hours, rate: hourly, subtotal: standardTotal });
      return {
        hours,
        tierApplied: "Short-Term (Hourly)",
        breakdown,
        standardTotal,
        finalAmount: standardTotal,
        savings: 0,
      };
    }

    let weeks = Math.floor(hours / 168);
    const remAfterWeeks = hours % 168;
    let days = Math.floor(remAfterWeeks / 24);
    let remHours = remAfterWeeks % 24;

    if (remHours >= threshold || remHours * hourly >= daily) {
      days += 1;
      remHours = 0;
    }

    if (days * daily >= weekly) {
      weeks += 1;
      days = 0;
      remHours = 0;
    }

    let tieredCost = 0;
    if (weeks > 0) {
      const sub = weeks * weekly;
      tieredCost += sub;
      breakdown.push({ unit: "Weeks", count: weeks, rate: weekly, subtotal: sub });
    }
    if (days > 0) {
      const sub = days * daily;
      tieredCost += sub;
      breakdown.push({ unit: "Days", count: days, rate: daily, subtotal: sub });
    }
    if (remHours > 0) {
      const sub = remHours * hourly;
      tieredCost += sub;
      breakdown.push({ unit: "Hours", count: remHours, rate: hourly, subtotal: sub });
    }

    if (weeks > 0 && days === 0 && remHours === 0) tierApplied = "Long-Term (Weekly Tier)";
    else if (days > 0 && weeks === 0 && remHours === 0) tierApplied = "Long-Term (Daily Tier)";
    else tierApplied = "Long-Term (Multi-Tier Hybrid)";

    const finalAmount = Math.min(standardTotal, tieredCost);
    const savings = Math.max(0, standardTotal - finalAmount);

    return {
      hours,
      tierApplied,
      breakdown,
      standardTotal,
      finalAmount,
      savings,
    };
  }, [
    simVehicle,
    simDurationHours,
    stdHourly,
    stdDaily,
    stdWeekly,
    evHourly,
    evDaily,
    evWeekly,
    accHourly,
    accDaily,
    accWeekly,
    dailyThreshold,
  ]);

  async function handleSaveRates(e: React.FormEvent) {
    e.preventDefault();
    if (!isManager) {
      onNotify("Manager authority required to configure ticket pricing tiers.", true);
      return;
    }

    setSaving(true);
    try {
      await api.updateRates({
        standard: stdHourly,
        standard_daily: stdDaily,
        standard_weekly: stdWeekly,
        ev: evHourly,
        ev_daily: evDaily,
        ev_weekly: evWeekly,
        accessible: accHourly,
        accessible_daily: accDaily,
        accessible_weekly: accWeekly,
        daily_threshold_hours: dailyThreshold,
      });
      onNotify("Tiered pricing algorithm rates updated successfully.", false);
      await onRefreshRates();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to update pricing tiers.", true);
    } finally {
      setSaving(false);
    }
  }

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  return (
    <section className="tiered-pricing-engine" aria-labelledby="pricing-engine-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <DollarSign size={14} aria-hidden="true" />
            <span>ALGORITHMIC BILLING ENGINE</span>
          </div>
          <h2 id="pricing-engine-title" className="section-title">
            Duration Tracking & Tiered Pricing
          </h2>
          <p className="muted">
            Automated duration engine applying short-term (hourly) versus long-term (daily / weekly) parking algorithms.
          </p>
        </div>

        {isManager && (
          <span className="authority-chip manager">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Manager Config Enabled</span>
          </span>
        )}
      </div>

      <div className="pricing-grid-layout">
        {/* Tier Configuration Cards */}
        <form onSubmit={handleSaveRates} className="tiers-config-column">
          <div className="tier-cards-container">
            {/* Standard Car Tier */}
            <article className="tier-card standard-tier">
              <div className="tier-card-head">
                <span className="tier-badge">Standard Vehicle</span>
                <h4>Commuter & Sedan</h4>
              </div>
              <div className="tier-inputs-grid">
                <div>
                  <label htmlFor="std-h">Short-Term (Hourly)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="std-h"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={stdHourly}
                      onChange={(e) => setStdHourly(parseFloat(e.target.value) || 0)}
                    />
                    <small>/hr</small>
                  </div>
                </div>
                <div>
                  <label htmlFor="std-d">Long-Term (Daily Cap)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="std-d"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={stdDaily}
                      onChange={(e) => setStdDaily(parseFloat(e.target.value) || 0)}
                    />
                    <small>/24h</small>
                  </div>
                </div>
                <div>
                  <label htmlFor="std-w">Long-Term (Weekly Bundle)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="std-w"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={stdWeekly}
                      onChange={(e) => setStdWeekly(parseFloat(e.target.value) || 0)}
                    />
                    <small>/7d</small>
                  </div>
                </div>
              </div>
            </article>

            {/* EV Tier */}
            <article className="tier-card ev-tier">
              <div className="tier-card-head">
                <span className="tier-badge ev">EV Charging Station</span>
                <h4>Dedicated Electric Fast-Charging</h4>
              </div>
              <div className="tier-inputs-grid">
                <div>
                  <label htmlFor="ev-h">Short-Term (Hourly)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="ev-h"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={evHourly}
                      onChange={(e) => setEvHourly(parseFloat(e.target.value) || 0)}
                    />
                    <small>/hr</small>
                  </div>
                </div>
                <div>
                  <label htmlFor="ev-d">Long-Term (Daily Cap)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="ev-d"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={evDaily}
                      onChange={(e) => setEvDaily(parseFloat(e.target.value) || 0)}
                    />
                    <small>/24h</small>
                  </div>
                </div>
                <div>
                  <label htmlFor="ev-w">Long-Term (Weekly Bundle)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="ev-w"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={evWeekly}
                      onChange={(e) => setEvWeekly(parseFloat(e.target.value) || 0)}
                    />
                    <small>/7d</small>
                  </div>
                </div>
              </div>
            </article>

            {/* Accessible Tier */}
            <article className="tier-card accessible-tier">
              <div className="tier-card-head">
                <span className="tier-badge accessible">Accessible / VIP Priority</span>
                <h4>Subsidized Priority Ramps</h4>
              </div>
              <div className="tier-inputs-grid">
                <div>
                  <label htmlFor="acc-h">Short-Term (Hourly)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="acc-h"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={accHourly}
                      onChange={(e) => setAccHourly(parseFloat(e.target.value) || 0)}
                    />
                    <small>/hr</small>
                  </div>
                </div>
                <div>
                  <label htmlFor="acc-d">Long-Term (Daily Cap)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="acc-d"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={accDaily}
                      onChange={(e) => setAccDaily(parseFloat(e.target.value) || 0)}
                    />
                    <small>/24h</small>
                  </div>
                </div>
                <div>
                  <label htmlFor="acc-w">Long-Term (Weekly Bundle)</label>
                  <div className="currency-input-wrap">
                    <span>₹</span>
                    <input
                      id="acc-w"
                      type="number"
                      min={1}
                      disabled={!isManager}
                      value={accWeekly}
                      onChange={(e) => setAccWeekly(parseFloat(e.target.value) || 0)}
                    />
                    <small>/7d</small>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="threshold-slider-card">
            <div className="threshold-header">
              <label htmlFor="daily-thresh">Daily Cap Activation Threshold</label>
              <span className="threshold-val">{dailyThreshold} Hours</span>
            </div>
            <input
              id="daily-thresh"
              type="range"
              min={4}
              max={16}
              disabled={!isManager}
              value={dailyThreshold}
              onChange={(e) => setDailyThreshold(parseInt(e.target.value) || 8)}
            />
            <p className="field-hint">
              Any parking duration reaching <strong>{dailyThreshold} hours</strong> automatically switches from hourly billing to the cheaper 24-hour daily rate.
            </p>
          </div>

          {isManager && (
            <button type="submit" className="button button-primary save-rates-btn" disabled={saving}>
              <Save size={16} aria-hidden="true" />
              <span>{saving ? "Saving Changes..." : "Save Pricing Tier Configurations"}</span>
            </button>
          )}
        </form>

        {/* Live Calculation Engine Simulator */}
        <aside className="simulator-column" aria-label="Tiered pricing calculation simulator">
          <div className="simulator-panel">
            <div className="sim-head">
              <div className="sim-title">
                <Calculator size={18} aria-hidden="true" />
                <h3>Duration & Fare Engine Simulator</h3>
              </div>
              <span className="live-chip">Live Algorithm</span>
            </div>

            <p className="sim-desc">
              Test how the automated calculation engine optimizes fares for varying durations.
            </p>

            <div className="sim-controls">
              <label htmlFor="sim-vehicle">Vehicle Type</label>
              <select
                id="sim-vehicle"
                value={simVehicle}
                onChange={(e) => setSimVehicle(e.target.value as VehicleType)}
              >
                <option value="standard">Standard Car</option>
                <option value="ev">EV Fast Charging</option>
                <option value="accessible">Accessible Priority</option>
              </select>

              <div className="sim-slider-row">
                <label htmlFor="sim-hours">Simulated Duration: <strong>{simDurationHours} Hours</strong></label>
                <span className="duration-human">
                  ({Math.floor(simDurationHours / 24)}d {simDurationHours % 24}h)
                </span>
              </div>
              <input
                id="sim-hours"
                type="range"
                min={1}
                max={168}
                value={simDurationHours}
                onChange={(e) => setSimDurationHours(parseInt(e.target.value) || 1)}
              />

              <div className="quick-presets">
                {[2, 5, 10, 24, 48, 72, 168].map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`preset-pill ${simDurationHours === h ? "active" : ""}`}
                    onClick={() => setSimDurationHours(h)}
                  >
                    {h < 24 ? `${h}h` : `${h / 24}d`}
                  </button>
                ))}
              </div>
            </div>

            <div className="sim-results-card">
              <div className="applied-tier-chip">
                <Sparkles size={14} aria-hidden="true" />
                <span>{simCalculation.tierApplied}</span>
              </div>

              <div className="breakdown-list">
                {simCalculation.breakdown.map((item, idx) => (
                  <div key={idx} className="breakdown-row">
                    <span>
                      {item.count} {item.unit} &times; {currency.format(item.rate)}
                    </span>
                    <strong>{currency.format(item.subtotal)}</strong>
                  </div>
                ))}
              </div>

              <div className="sim-totals-box">
                <div className="total-line compare">
                  <span>Standard Non-Tiered Fare:</span>
                  <del>{currency.format(simCalculation.standardTotal)}</del>
                </div>
                {simCalculation.savings > 0 && (
                  <div className="total-line savings text-green">
                    <span>Automated Tier Savings:</span>
                    <strong>− {currency.format(simCalculation.savings)} ({Math.round((simCalculation.savings / simCalculation.standardTotal) * 100)}% off)</strong>
                  </div>
                )}
                <div className="total-line final">
                  <span>Final Bill Amount:</span>
                  <span className="final-price">{currency.format(simCalculation.finalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
