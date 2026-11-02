import {
  ArrowUpRight,
  Car,
  Check,
  DollarSign,
  ScanLine,
  Search,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "./api";
import type { Receipt, Spot, Ticket } from "./types";

interface CheckoutPageProps {
  spots: Spot[];
  onOpenQRScanner: () => void;
  onRefresh: () => Promise<void>;
  onNotify: (text: string, error?: boolean) => void;
  initialQuery?: string;
}

export function CheckoutPage({
  spots,
  onOpenQRScanner,
  onRefresh,
  onNotify,
  initialQuery = "",
}: CheckoutPageProps) {
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Ticket[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

  const occupiedSpots = spots.filter((s) => s.status === "occupied" && s.ticket_id);

  async function handleSearch(e?: FormEvent) {
    if (e) e.preventDefault();
    const clean = query.trim();
    if (!clean) {
      onNotify("Enter a ticket ID, license plate, or scan QR payload to search.", true);
      return;
    }

    setBusy(true);
    setReceipt(null);
    try {
      const tickets = await api.searchTickets(clean);
      setResults(tickets);
      if (tickets.length === 0) {
        onNotify("No active tickets found matching that query.", true);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Search failed.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckout(ticketIdOrPayload: string) {
    setBusy(true);
    try {
      const res = await api.checkout(ticketIdOrPayload);
      setReceipt(res);
      setResults([]);
      setQuery("");
      onNotify(`Checkout successful. Paid ${currency.format(res.amount_paid)} via ${res.tier_applied}.`, false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Checkout failed.", true);
    } finally {
      setBusy(false);
    }
  }

  function handleSelectParkedCar(ticketId: string) {
    setQuery(ticketId);
    void handleSearch();
  }

  return (
    <section className="checkout-page-container" aria-labelledby="checkout-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <DollarSign size={14} aria-hidden="true" />
            <span>DEPARTURE & BILLING ENGINE</span>
          </div>
          <h2 id="checkout-title" className="section-title">
            Vehicle Checkout & Automated Tiered Billing
          </h2>
          <p className="muted">
            Search active ticket reference, vehicle plate, or optical QR pass to compute exact hours and tiered fare.
          </p>
        </div>

        <button
          type="button"
          className="button button-outline"
          onClick={onOpenQRScanner}
          title="Open touchless camera scanner"
        >
          <ScanLine size={16} aria-hidden="true" />
          <span>Touchless QR Scanner</span>
        </button>
      </div>

      <div className="checkout-grid-layout">
        {/* Search & Actions Panel */}
        <div className="checkout-main-column">
          <form onSubmit={handleSearch} className="checkout-search-card">
            <label htmlFor="search-input">Search Active Ticket, License Plate, or Decoded QR Payload</label>
            <div className="input-with-action">
              <input
                id="search-input"
                type="search"
                maxLength={255}
                placeholder="e.g. DL-01-AB-1234 or Ticket ID..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              <button
                type="submit"
                className="button button-primary search-submit"
                disabled={busy}
                aria-label="Search"
              >
                <Search size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="checkout-form-actions">
              <button type="submit" className="button button-outline" disabled={busy || !query.trim()}>
                {busy ? "Searching..." : "Find Active Ticket"}
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={onOpenQRScanner}
              >
                <ScanLine size={16} aria-hidden="true" />
                <span>Scan QR Pass</span>
              </button>
            </div>
          </form>

          {/* Search Results */}
          {results.length > 0 && (
            <div className="search-results-list">
              <h3>Active Tickets Found ({results.length})</h3>
              {results.map((ticket) => (
                <article key={ticket.id} className="ticket-result-card">
                  <div className="ticket-result-info">
                    <span className="plate-chip">{ticket.license_plate}</span>
                    <div className="ticket-meta-col">
                      <strong>Spot {ticket.spot_id} &bull; {ticket.floor}</strong>
                      <span className="muted">
                        Arrived: {new Date(ticket.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void handleCheckout(ticket.id)}
                    disabled={busy}
                  >
                    <span>Process Checkout</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          )}

          {/* Calculated Receipt */}
          {receipt && (
            <article className="receipt checkout-receipt-card" aria-labelledby="receipt-heading">
              <div className="receipt-head">
                <h3 id="receipt-heading">
                  <Check size={18} aria-hidden="true" /> Official Checkout Receipt
                </h3>
                <button
                  type="button"
                  className="button button-small no-print"
                  onClick={() => window.print()}
                >
                  Print Receipt
                </button>
              </div>

              <div className="tier-applied-tag">
                <span>Applied Pricing Tier: <strong>{receipt.tier_applied}</strong></span>
              </div>

              <dl>
                <div>
                  <dt>Ticket Ref</dt>
                  <dd className="monospace">{receipt.ticket.id.slice(0, 8).toUpperCase()}</dd>
                </div>
                <div>
                  <dt>License Plate</dt>
                  <dd className="plate-chip small">{receipt.ticket.license_plate}</dd>
                </div>
                <div>
                  <dt>Spot & Level</dt>
                  <dd>{receipt.ticket.spot_id} ({receipt.ticket.floor || "Floor 1"})</dd>
                </div>
                <div>
                  <dt>Exact Duration</dt>
                  <dd><strong>{receipt.duration_display}</strong></dd>
                </div>

                {receipt.breakdown && receipt.breakdown.length > 0 && (
                  <div className="receipt-breakdown-box">
                    <dt>Tiered Rate Breakdown</dt>
                    <dd>
                      {receipt.breakdown.map((item, idx) => (
                        <div key={idx} className="sub-item">
                          <span>{item.count} {item.unit} &times; {currency.format(item.rate)}:</span>
                          <strong>{currency.format(item.subtotal)}</strong>
                        </div>
                      ))}
                    </dd>
                  </div>
                )}

                {receipt.savings_amount > 0 && (
                  <div className="savings-row text-green">
                    <dt>Long-Term Tier Savings</dt>
                    <dd>− {currency.format(receipt.savings_amount)} saved!</dd>
                  </div>
                )}

                <div className="receipt-total">
                  <dt>Final Amount Collected</dt>
                  <dd>{currency.format(receipt.amount_paid)}</dd>
                </div>
              </dl>
            </article>
          )}
        </div>

        {/* Currently Parked Quick Selector */}
        <aside className="checkout-side-column">
          <div className="parked-selector-card">
            <div className="parked-selector-head">
              <Car size={18} aria-hidden="true" />
              <h3>Currently Parked Vehicles ({occupiedSpots.length})</h3>
            </div>
            <p className="muted">Click any active vehicle to immediately pull up ticket for departure:</p>

            {occupiedSpots.length === 0 ? (
              <div className="empty-state">No vehicles currently parked in the facility.</div>
            ) : (
              <div className="parked-cars-quick-list">
                {occupiedSpots.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    className="quick-parked-btn"
                    onClick={() => handleSelectParkedCar(spot.ticket_id!)}
                  >
                    <div>
                      <span className="plate-chip small">{spot.license_plate}</span>
                      <small className="muted">{spot.floor} &bull; {spot.id}</small>
                    </div>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
