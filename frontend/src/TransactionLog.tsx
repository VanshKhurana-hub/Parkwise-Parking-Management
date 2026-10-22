import {
  ArrowDownToLine,
  ArrowUpRight,
  Clock,
  History,
  Pencil,
  Plus,
  RotateCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { api } from "./api";
import type { Transaction } from "./types";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

interface TransactionLogProps {
  refreshKey?: number;
}

export function TransactionLog({ refreshKey = 0 }: TransactionLogProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [internalRefresh, setInternalRefresh] = useState(0);
  const [, startTransition] = useTransition();

  const filterOptions = [
    { label: "All Activity", value: "ALL" },
    { label: "Check-ins", value: "CHECK_IN" },
    { label: "Checkouts", value: "CHECK_OUT" },
    { label: "Rate Changes", value: "RATE_UPDATE" },
    { label: "Spots Created", value: "SPOT_CREATE" },
  ];

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      setLoading(true);
      setError("");
      try {
        const data = await api.transactions({
          limit: 100,
          action: actionFilter === "ALL" ? undefined : actionFilter,
          q: search.trim() || undefined,
        });
        if (active) {
          startTransition(() => {
            setTransactions(data);
          });
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load transaction audit log.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadLogs();
    return () => {
      active = false;
    };
  }, [actionFilter, search, refreshKey, internalRefresh]);

  function getActionBadge(action: string) {
    switch (action) {
      case "CHECK_IN":
        return (
          <span className="tx-badge tx-badge-checkin">
            <ArrowDownToLine size={13} aria-hidden="true" />
            <span>Check-in</span>
          </span>
        );
      case "CHECK_OUT":
        return (
          <span className="tx-badge tx-badge-checkout">
            <ArrowUpRight size={13} aria-hidden="true" />
            <span>Check-out</span>
          </span>
        );
      case "RATE_UPDATE":
        return (
          <span className="tx-badge tx-badge-rate">
            <Pencil size={13} aria-hidden="true" />
            <span>Rate Update</span>
          </span>
        );
      case "SPOT_CREATE":
        return (
          <span className="tx-badge tx-badge-spot">
            <Plus size={13} aria-hidden="true" />
            <span>Spot Added</span>
          </span>
        );
      case "SYSTEM_INIT":
        return (
          <span className="tx-badge tx-badge-system">
            <Clock size={13} aria-hidden="true" />
            <span>System Init</span>
          </span>
        );
      default:
        return (
          <span className="tx-badge tx-badge-default">
            <span>{action}</span>
          </span>
        );
    }
  }

  function getRoleBadge(user: string) {
    const isSys = user === "system";
    const isAdmin = user.toLowerCase().includes("admin");
    const isAttendant = user.toLowerCase().includes("attendant");
    const isDriver = user === "driver";

    let label = user;
    let className = "tx-role-badge";

    if (isAdmin) className += " tx-role-admin";
    else if (isAttendant) className += " tx-role-attendant";
    else if (isDriver) className += " tx-role-driver";
    else if (isSys) className += " tx-role-system";

    return <span className={className}>{label}</span>;
  }

  return (
    <section className="panel transaction-log-panel" aria-labelledby="tx-log-title">
      <div className="panel-heading">
        <div className="tx-header-info">
          <div className="tx-title-row">
            <div className="section-icon tx-icon" aria-hidden="true">
              <History size={18} />
            </div>
            <h2 id="tx-log-title">Audit & Transaction Log</h2>
            <span className="tx-count-pill" aria-label={`${transactions.length} transactions recorded`}>
              {transactions.length} records
            </span>
          </div>
          <p className="muted tx-subtitle">
            Persistent ledger tracking all parking check-ins, checkouts, spot additions, and hourly rate adjustments.
          </p>
        </div>
        <div className="panel-heading-actions">
          <button
            type="button"
            className="button button-small tx-refresh-btn"
            onClick={() => setInternalRefresh((c) => c + 1)}
            disabled={loading}
            aria-label="Refresh transaction logs"
            title="Refresh transaction logs"
          >
            <RotateCw size={14} className={loading ? "spin" : ""} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="tx-toolbar">
        <div className="tx-filter-pills" role="group" aria-label="Filter transactions by activity type">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`status-filter ${actionFilter === opt.value ? "status-filter-active" : ""}`}
              aria-pressed={actionFilter === opt.value}
              onClick={() => setActionFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="search-field tx-search" htmlFor="tx-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            id="tx-search-input"
            type="search"
            placeholder="Search plate, spot, or operator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search transaction logs"
          />
          {search && (
            <button
              type="button"
              className="tx-clear-btn"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="button button-small"
            onClick={() => setInternalRefresh((c) => c + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="tx-table-container" tabIndex={0} role="region" aria-label="Transaction table">
        <table className="tx-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Activity</th>
              <th scope="col">Spot</th>
              <th scope="col">License Plate</th>
              <th scope="col">Amount</th>
              <th scope="col">Operator</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="tx-empty-cell">
                  <div className="empty-state">Loading transaction ledger…</div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="tx-empty-cell">
                  <div className="empty-state">
                    {search || actionFilter !== "ALL"
                      ? "No transactions match your search or filter criteria."
                      : "No transactions recorded yet."}
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx.id} className="tx-row">
                  <td className="tx-time-cell">
                    <time dateTime={tx.timestamp}>{formatTimestamp(tx.timestamp)}</time>
                  </td>
                  <td>{getActionBadge(tx.action)}</td>
                  <td>
                    {tx.spot_id ? (
                      <span className="tx-spot-tag">{tx.spot_id}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {tx.license_plate ? (
                      <span className="tx-plate-tag">{tx.license_plate}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="tx-amount-cell">
                    {tx.amount != null ? (
                      <span className="tx-amount-value">{inrFormatter.format(tx.amount)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{getRoleBadge(tx.performed_by)}</td>
                  <td className="tx-details-cell" title={tx.details}>
                    {tx.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

