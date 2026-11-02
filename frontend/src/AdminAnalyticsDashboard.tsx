import {
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Layers,
  LineChart,
  RefreshCw,
  Search,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { AdminAnalyticsData } from "./types";

interface AdminAnalyticsDashboardProps {
  onNotify: (text: string, error?: boolean) => void;
}

export function AdminAnalyticsDashboard({ onNotify }: AdminAnalyticsDashboardProps) {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [txSearch, setTxSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await api.adminAnalytics();
      setData(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to load admin analytics.", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  // Filtered transactions
  const filteredTxs = useMemo(() => {
    if (!data?.recent_transactions) return [];
    return data.recent_transactions.filter((tx) => {
      const term = txSearch.trim().toLowerCase();
      const matchTerm =
        !term ||
        tx.action.toLowerCase().includes(term) ||
        (tx.license_plate ?? "").toLowerCase().includes(term) ||
        (tx.spot_id ?? "").toLowerCase().includes(term) ||
        tx.details.toLowerCase().includes(term) ||
        tx.performed_by.toLowerCase().includes(term);

      const matchAction = actionFilter === "all" || tx.action.toUpperCase() === actionFilter.toUpperCase();
      return matchTerm && matchAction;
    });
  }, [data, txSearch, actionFilter]);

  function exportCSV() {
    if (!data?.recent_transactions.length) return;
    const headers = ["ID", "Timestamp", "Action", "License Plate", "Spot ID", "Amount (INR)", "Performed By", "Details"];
    const rows = filteredTxs.map((t) => [
      t.id,
      t.timestamp,
      t.action,
      t.license_plate || "",
      t.spot_id || "",
      t.amount !== null && t.amount !== undefined ? t.amount : "",
      t.performed_by,
      `"${t.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Parkwise-Audit-Log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onNotify("Audit log exported to CSV successfully.", false);
  }

  if (loading) {
    return <div className="empty-state">Loading Executive Analytics & Transaction Audit Data...</div>;
  }

  if (!data) {
    return <div className="empty-state">No analytical data available.</div>;
  }

  return (
    <section className="admin-analytics-dashboard" aria-labelledby="analytics-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge admin-badge">
            <Shield size={14} aria-hidden="true" />
            <span>EXECUTIVE INTELLIGENCE &bull; ADMIN EXCLUSIVE</span>
          </div>
          <h2 id="analytics-title" className="section-title">
            Analytical Dashboard & Historical Audit Review
          </h2>
          <p className="muted">
            High-level metrics, revenue streams by tier, floor utilization, and full immutable transaction records.
          </p>
        </div>

        <div className="header-actions">
          <button type="button" className="button button-outline" onClick={() => void loadAnalytics()} title="Refresh Data">
            <RefreshCw size={15} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button type="button" className="button button-primary" onClick={exportCSV} title="Export Audit Log as CSV">
            <Download size={15} aria-hidden="true" />
            <span>Export CSV Report</span>
          </button>
        </div>
      </div>

      {/* Top KPI Grid */}
      <div className="analytics-kpi-grid">
        <article className="stat-card">
          <div className="stat-icon orange" aria-hidden="true">
            <TrendingUp />
          </div>
          <div className="stat-label">Total System Revenue</div>
          <div className="stat-value">{currency.format(data.total_revenue)}</div>
          <div className="stat-detail">Across all completed checkouts</div>
        </article>

        <article className="stat-card">
          <div className="stat-icon green" aria-hidden="true">
            <CheckCircle2 />
          </div>
          <div className="stat-label">Today's Revenue</div>
          <div className="stat-value">{currency.format(data.today_revenue)}</div>
          <div className="stat-detail">Active 24h operational revenue</div>
        </article>

        <article className="stat-card">
          <div className="stat-icon blue" aria-hidden="true">
            <Clock />
          </div>
          <div className="stat-label">Average Stay Duration</div>
          <div className="stat-value">{data.average_duration_hours} hrs</div>
          <div className="stat-detail">Average slot occupancy time</div>
        </article>

        <article className="stat-card">
          <div className="stat-icon purple" aria-hidden="true">
            <Layers />
          </div>
          <div className="stat-label">Facility Occupancy</div>
          <div className="stat-value">{data.occupancy_rate}%</div>
          <div className="stat-detail">{data.total_checkouts} total vehicles checked out</div>
        </article>
      </div>

      {/* Middle Analytical Panels */}
      <div className="analytics-charts-grid">
        {/* Floor Utilization Bar Meters */}
        <article className="analytics-card">
          <div className="card-head">
            <Layers size={18} aria-hidden="true" />
            <h3>Floor-Wise Utilization Rates</h3>
          </div>
          <div className="floor-bars-list">
            {Object.entries(data.floor_occupancy).map(([floorName, stats]) => {
              const pct = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
              return (
                <div key={floorName} className="floor-bar-item">
                  <div className="floor-bar-label">
                    <strong>{floorName}</strong>
                    <span>
                      {stats.occupied} / {stats.total} occupied ({pct}%)
                    </span>
                  </div>
                  <div className="floor-progress-track">
                    <div
                      className={`floor-progress-fill ${pct > 80 ? "fill-red" : pct > 50 ? "fill-purple" : "fill-blue"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {/* Tier Revenue Breakdown */}
        <article className="analytics-card">
          <div className="card-head">
            <BarChart3 size={18} aria-hidden="true" />
            <h3>Revenue by Pricing Tier</h3>
          </div>
          <div className="tier-revenue-list">
            {Object.entries(data.tier_revenue).map(([tierName, amt]) => (
              <div key={tierName} className="tier-revenue-item">
                <div className="tier-name-col">
                  <strong>{tierName}</strong>
                  <span className="muted">Algorithm bucket</span>
                </div>
                <div className="tier-amt-col">
                  <strong>{currency.format(amt)}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Peak Hours Traffic */}
        <article className="analytics-card">
          <div className="card-head">
            <LineChart size={18} aria-hidden="true" />
            <h3>Peak Facility Parking Hours</h3>
          </div>
          <div className="peak-hours-list">
            {data.peak_hours.map((peak, idx) => {
              const maxVehicles = 100;
              const barWidth = Math.min(100, Math.round((Number(peak.vehicles) / maxVehicles) * 100));
              return (
                <div key={idx} className="peak-hour-row">
                  <span className="peak-label">{peak.hour}</span>
                  <div className="peak-track">
                    <div className="peak-fill" style={{ width: `${barWidth}%` }} />
                  </div>
                  <span className="peak-count">{peak.vehicles} cars</span>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      {/* Historical System Transactions & Audit Records */}
      <div className="audit-log-section">
        <div className="audit-header-row">
          <div>
            <h3 className="sub-title">Historical Transaction & System Audit Records</h3>
            <p className="muted">Review all vehicle entries, departures, rate changes, and personnel actions.</p>
          </div>

          <div className="audit-search-row">
            <label className="search-field" htmlFor="audit-search">
              <Search size={16} aria-hidden="true" />
              <input
                id="audit-search"
                type="search"
                placeholder="Search plate, action, or staff..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
            </label>

            <select
              className="action-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Filter by action"
            >
              <option value="all">All Actions</option>
              <option value="CHECK_IN">CHECK_IN</option>
              <option value="CHECK_OUT">CHECK_OUT</option>
              <option value="RATE_UPDATE">RATE_UPDATE</option>
              <option value="SPOT_CREATE">SPOT_CREATE</option>
              <option value="SPOT_UPDATE">SPOT_UPDATE</option>
              <option value="GUARD_SHIFT_ASSIGN">GUARD_SHIFT_ASSIGN</option>
              <option value="PERSONNEL_CREATE">PERSONNEL_CREATE</option>
            </select>
          </div>
        </div>

        <div className="shifts-table-container">
          <table className="shifts-table" aria-label="Transaction Logs">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>License Plate</th>
                <th>Spot ID</th>
                <th>Amount</th>
                <th>Logged By</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.slice(0, 50).map((tx) => (
                <tr key={tx.id} className="tx-row">
                  <td className="timestamp-cell">
                    <span className="mono-date">
                      {new Date(tx.timestamp).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </span>
                  </td>
                  <td>
                    <span className={`action-badge badge-${tx.action.toLowerCase()}`}>{tx.action}</span>
                  </td>
                  <td>
                    {tx.license_plate ? (
                      <span className="plate-chip small">{tx.license_plate}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {tx.spot_id ? (
                      <span className="spot-chip small">{tx.spot_id}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {tx.amount !== null && tx.amount !== undefined ? (
                      <strong className="text-green">{currency.format(tx.amount)}</strong>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="performed-cell">@{tx.performed_by}</span>
                  </td>
                  <td className="details-cell">
                    <span>{tx.details}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
