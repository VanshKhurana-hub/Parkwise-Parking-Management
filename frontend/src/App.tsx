import {
  Accessibility,
  ArrowDownToLine,
  ArrowUpRight,
  CarFront,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  LogIn,
  LogOut,
  PlugZap,
  Plus,
  Search,
  Shield,
  SunMoon,
  UserCheck,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { api } from "./api";
import { useAccessibility } from "./AccessibilityContext";
import { useAuth } from "./AuthContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoginModal } from "./LoginModal";
import { AddSpotModal } from "./AddSpotModal";
import type { Receipt, Spot, Stats, Ticket, VehicleType } from "./types";

const emptyStats: Stats = {
  total_spots: 0,
  free_spots: 0,
  occupied_count: 0,
  reserved_count: 0,
  daily_revenue: 0,
};
const vehicleLabels: Record<VehicleType, string> = {
  standard: "Standard",
  ev: "EV charging",
  accessible: "Accessible",
};
type SpotStatusFilter = "all" | "available" | "occupied";
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const checkoutQueryStorageKey = "parkwise-checkout-query";

function readStoredCheckoutQuery(): { value: string; storageError: boolean } {
  try {
    return {
      value: (localStorage.getItem(checkoutQueryStorageKey) ?? "").slice(0, 36),
      storageError: false,
    };
  } catch {
    return { value: "", storageError: true };
  }
}

function AppContent() {
  const { fontScale, highContrast, darkMode, changeFontScale, toggleHighContrast, toggleDarkMode } =
    useAccessibility();
  const {
    user,
    role,
    isAuthenticated,
    logout,
    isLoginModalOpen,
    openLoginModal,
    closeLoginModal,
  } = useAuth();
  const [addSpotOpen, setAddSpotOpen] = useState(false);
  const [storedCheckoutQuery] = useState(readStoredCheckoutQuery);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(() =>
    storedCheckoutQuery.storageError
      ? { text: "Could not restore the checkout search text from this browser.", error: true }
      : null,
  );
  const [search, setSearch] = useState("");
  const [spotStatusFilter, setSpotStatusFilter] = useState<SpotStatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<Ticket | null>(null);
  const [selectedSpot, setSelectedSpot] = useState("");
  const [query, setQuery] = useState(storedCheckoutQuery.value);
  const [ticketResults, setTicketResults] = useState<Ticket[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const [nextSpots, nextStats] = await Promise.all([api.spots(), api.stats()]);
      setSpots(nextSpots);
      setStats(nextStats);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load parking data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    try {
      if (query) localStorage.setItem(checkoutQueryStorageKey, query);
      else localStorage.removeItem(checkoutQueryStorageKey);
    } catch {
      setNotice({
        text: "Could not save the checkout search text. It will be cleared when you leave this page.",
        error: true,
      });
    }
  }, [query]);

  const openCheckin = useCallback((spotId = "") => {
    modalTriggerRef.current = document.activeElement as HTMLElement;
    setSelectedSpot(spotId);
    setModalOpen(true);
  }, []);
  const handleModalError = useCallback((message: string) => {
    setNotice({ text: message, error: true });
  }, []);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        openCheckin();
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [openCheckin]);

  useEffect(() => {
    if (modalOpen) {
      document.querySelector<HTMLElement>("#checkin-dialog input")?.focus();
      return;
    }
    if (pendingCheckout) {
      document.querySelector<HTMLElement>("#checkout-confirm-dialog [data-initial-focus]")?.focus();
      return;
    }
    modalTriggerRef.current?.focus();
  }, [modalOpen, pendingCheckout]);

  const filteredSpots = useMemo(() => {
    const term = search.trim().toLowerCase();
    return spots.filter((spot) =>
      (spotStatusFilter === "all" || spot.status === spotStatusFilter) &&
      (!term ||
        spot.id.toLowerCase().includes(term) ||
        (spot.license_plate ?? "").toLowerCase().includes(term)),
    );
  }, [search, spotStatusFilter, spots]);
  const zones = useMemo(() => [...new Set(filteredSpots.map((spot) => spot.zone))], [filteredSpots]);

  async function searchTickets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setNotice({ text: "Enter a ticket ID or license plate to search.", error: true });
      return;
    }
    setBusy(true);
    setReceipt(null);
    try {
      const results = await api.searchTickets(cleanQuery);
      setTicketResults(results);
      if (!results.length) setNotice({ text: "No active parking tickets matched that search.", error: true });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Ticket search failed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function completeCheckout(ticketId: string) {
    if (role === "guest") {
      setNotice({
        text: "Staff sign in required: Only Attendants or Admins can check out vehicles. Press Alt+L to sign in.",
        error: true,
      });
      openLoginModal();
      return;
    }

    setBusy(true);
    try {
      const result = await api.checkout(ticketId);
      setReceipt(result);
      setTicketResults([]);
      setQuery("");
      setNotice({ text: `Checkout complete. ${currency.format(result.amount_paid)} collected.`, error: false });
      await refresh();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Checkout failed.", error: true });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function requestCheckout(ticket: Ticket, trigger: HTMLButtonElement) {
    if (role === "guest") {
      setNotice({
        text: "Staff sign in required: Only Attendants or Admins can check out vehicles. Press Alt+L or click Sign in.",
        error: true,
      });
      openLoginModal(trigger);
      return;
    }
    modalTriggerRef.current = trigger;
    setPendingCheckout(ticket);
  }

  async function confirmCheckout() {
    if (!pendingCheckout) return;
    const ticketId = pendingCheckout.id;
    setPendingCheckout(null);
    await completeCheckout(ticketId);
  }

  function handleSpot(spot: Spot) {
    if (spot.status === "available") openCheckin(spot.id);
    else if (spot.status === "occupied" && spot.ticket_id) {
      setQuery(spot.ticket_id);
      setTicketResults([]);
      setReceipt(null);
      document.getElementById("checkout-panel")?.scrollIntoView({ block: "center" });
      window.setTimeout(() => document.getElementById("checkout-query")?.focus(), 0);
    }
  }

  function onModalKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (modalOpen) setModalOpen(false);
      else setPendingCheckout(null);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Parkwise dashboard">
          <span className="brand-mark" aria-hidden="true"><CarFront size={24} /></span>
          <span>parkwise<span className="brand-period">.</span></span>
        </a>
        <nav aria-label="Accessibility and main actions" className="topbar-controls">
          <div className="font-controls" aria-label="Text size controls">
            <button className="icon-button" type="button" aria-label="Decrease text size" title="Decrease text size" onClick={() => changeFontScale(-1)}>A−</button>
            <span className="font-size-label" aria-live="polite">{["Small", "Medium", "Large", "Extra large"][fontScale]}</span>
            <button className="icon-button" type="button" aria-label="Increase text size" title="Increase text size" onClick={() => changeFontScale(1)}>A+</button>
          </div>
          <button className="icon-button labeled-control" type="button" aria-label="Toggle high contrast mode" aria-pressed={highContrast} onClick={toggleHighContrast}>
            <Accessibility size={18} aria-hidden="true" /><span>High contrast</span>
          </button>
          <button className="icon-button labeled-control" type="button" aria-label={`Toggle ${darkMode ? "light" : "dark"} mode`} aria-pressed={darkMode} onClick={toggleDarkMode}>
            <SunMoon size={18} aria-hidden="true" /><span>{darkMode ? "Dark mode" : "Light mode"}</span>
          </button>

          {/* Authentication & Role-Based Badge */}
          {isAuthenticated && user ? (
            <div className="auth-status-chip" aria-label={`Signed in as ${user.full_name} (${role})`}>
              <span className={`role-badge role-${role}`}>
                {role === "admin" ? <Shield size={13} aria-hidden="true" /> : <UserCheck size={13} aria-hidden="true" />}
                <span>{role === "admin" ? "Admin" : "Attendant"}</span>
              </span>
              <span className="user-display-name">{user.full_name}</span>
              <button
                className="icon-button logout-btn"
                type="button"
                aria-label="Sign out"
                title="Sign out of staff account"
                onClick={() => {
                  logout();
                  setNotice({ text: "Signed out successfully.", error: false });
                }}
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              className="button button-outline signin-btn"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isLoginModalOpen}
              onClick={(e) => openLoginModal(e.currentTarget)}
              title="Staff sign in (Shortcut: Alt+L)"
            >
              <LogIn size={16} aria-hidden="true" />
              <span>Sign in</span>
              <span className="shortcut-hint" aria-hidden="true">Alt L</span>
            </button>
          )}

          {role === "admin" && (
            <button
              className="button button-outline add-spot-nav-btn"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={addSpotOpen}
              onClick={() => setAddSpotOpen(true)}
              title="Add a new parking spot to the facility (Admin only)"
            >
              <Plus size={16} aria-hidden="true" />
              <span>Add spot</span>
            </button>
          )}

          <button className="button button-primary new-entry" type="button" aria-haspopup="dialog" aria-expanded={modalOpen} onClick={() => openCheckin()}>
            <Plus size={18} aria-hidden="true" /><span>New entry</span>
          </button>
        </nav>
      </header>

      <main className="page-content">
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">PARKING OPERATIONS &bull; RBAC ENABLED</p>
            <h1 id="page-title">Good day, {user?.full_name ?? "Driver"} <span aria-hidden="true">✳</span></h1>
            <p className="muted">
              {role === "admin"
                ? "Administrator portal: Full control over spot creation, active operations, and revenue analytics."
                : role === "attendant"
                ? "Attendant portal: Authorized to manage vehicle entries, check-ins, and final bill checkouts."
                : "Driver view: Live parking availability is publicly visible. Staff sign-in is required to check out."}
            </p>
          </div>
          <p className="today-label"><Clock3 size={16} aria-hidden="true" /> Live facility overview</p>
        </section>

        {notice && (
          <div className={`toast ${notice.error ? "toast-error" : "toast-success"}`} role={notice.error ? "alert" : "status"}>
            {notice.error ? <X size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
            <span>{notice.text}</span>
            <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={18} /></button>
          </div>
        )}
        {loadError && (
          <div className="inline-error" role="alert">
            <span>{loadError}</span>
            <button className="button button-small" type="button" onClick={() => void refresh(true)}>Retry</button>
          </div>
        )}

        <section className="stats-grid" aria-label="Facility statistics" aria-live="polite">
          <StatCard label="Total spots" value={stats.total_spots} icon={<CarFront />} detail="Across 3 zones" tone="blue" />
          <StatCard label="Available now" value={stats.free_spots} icon={<Check />} detail={`${stats.reserved_count} reserved`} tone="green" />
          <StatCard label="Currently parked" value={stats.occupied_count} icon={<ArrowDownToLine />} detail={`of ${stats.total_spots} total spaces`} tone="purple" />
          <StatCard label="Today's revenue" value={currency.format(stats.daily_revenue)} icon={<CircleDollarSign />} detail="From completed checkouts" tone="orange" />
        </section>

        <section className="workspace-grid" aria-label="Parking operations">
          <section className="panel parking-panel" aria-labelledby="parking-title">
            <div className="panel-heading">
              <div>
                <h2 id="parking-title">Parking overview</h2>
                <p className="muted">Select an available spot for check-in or an occupied spot for checkout.</p>
              </div>
              <div className="panel-heading-actions">
                {role === "admin" && (
                  <button
                    className="button button-small"
                    type="button"
                    onClick={() => setAddSpotOpen(true)}
                  >
                    <Plus size={14} aria-hidden="true" /> Add spot
                  </button>
                )}
                <span className="live-chip"><span aria-hidden="true" className="live-dot" /> Live</span>
              </div>
            </div>
            <div className="parking-toolbar">
              <div className="spot-filter-row">
                <label className="search-field" htmlFor="spot-search">
                  <Search size={18} aria-hidden="true" />
                  <input ref={searchRef} id="spot-search" type="search" aria-label="Search by slot number or vehicle number" placeholder="Search slot or vehicle number…" value={search} onChange={(event) => setSearch(event.target.value)} />
                  <span className="shortcut-hint" aria-hidden="true">Alt S</span>
                </label>
                <div className="status-filters" role="group" aria-label="Filter parking slots by status">
                  {(["all", "available", "occupied"] as const).map((status) => (
                    <button
                      key={status}
                      className={`status-filter${spotStatusFilter === status ? " status-filter-active" : ""}`}
                      type="button"
                      aria-pressed={spotStatusFilter === status}
                      onClick={() => setSpotStatusFilter(status)}
                    >
                      {status[0].toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <Legend />
            </div>
            <div className="zone-list" aria-live="polite" aria-busy={loading}>
              {loading ? <div className="empty-state">Loading parking spots…</div> : zones.length === 0 ? (
                <div className="empty-state">{search || spotStatusFilter !== "all" ? "No parking spots match your filters." : "No parking spots are available."}</div>
              ) : zones.map((zone) => (
                <section className="zone-section" key={zone} aria-labelledby={`zone-${zone.replaceAll(" ", "-")}`}>
                  <div className="zone-heading">
                    <h3 id={`zone-${zone.replaceAll(" ", "-")}`}>{zone}</h3>
                    <span>{zoneSubtitle(zone)} <span aria-hidden="true">·</span> {filteredSpots.filter((spot) => spot.zone === zone).length} spots</span>
                  </div>
                  <div className="spot-grid">
                    {filteredSpots.filter((spot) => spot.zone === zone).map((spot) => (
                      <SpotButton key={spot.id} spot={spot} onSelect={handleSpot} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <p className="keyboard-note">Keyboard: Tab to navigate spots, Enter or Space to select.</p>
          </section>

          <aside className="side-column" aria-label="Parking actions">
            <section className="panel checkout-panel" id="checkout-panel" aria-labelledby="checkout-title">
              <div className="section-icon"><ArrowUpRight size={19} aria-hidden="true" /></div>
              <h2 id="checkout-title">Vehicle checkout</h2>
              <p className="muted">
                Search by ticket ID or license plate to calculate a final bill.
                {role === "guest" && (
                  <span className="auth-required-hint"> (Staff sign-in required to process checkout)</span>
                )}
              </p>
              <form onSubmit={(event) => void searchTickets(event)} className="checkout-form">
                <label htmlFor="checkout-query">Ticket ID or license plate</label>
                <div className="input-with-action">
                  <input id="checkout-query" type="search" maxLength={36} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. AB-123 or ticket ID" autoComplete="off" />
                  <button className="button button-primary search-submit" type="submit" disabled={busy} aria-label="Search active tickets"><Search size={18} aria-hidden="true" /></button>
                </div>
                <button className="button button-outline checkout-submit" type="submit" disabled={busy || ticketResults.length === 0}>
                  {busy ? "Processing…" : "Find active ticket"}
                </button>
              </form>
              {ticketResults.map((ticket) => (
                <article className="ticket-result" key={ticket.id}>
                  <div><strong>{ticket.license_plate}</strong><span>{vehicleLabels[ticket.vehicle_type]} · Spot {ticket.spot_id}</span></div>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={(event) => requestCheckout(ticket, event.currentTarget)}
                    disabled={busy}
                    title={role === "guest" ? "Sign in as Attendant or Admin to checkout" : "Process vehicle checkout"}
                  >
                    Check out <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                </article>
              ))}
              {receipt && <ReceiptCard receipt={receipt} />}
            </section>

            <section className="panel rate-panel" aria-labelledby="rates-title">
              <h2 id="rates-title">Hourly rates</h2>
              <Rate vehicle="Standard" amount="$4" icon={<CarFront />} />
              <Rate vehicle="EV charging" amount="$7" icon={<PlugZap />} />
              <Rate vehicle="Accessible" amount="$3" icon={<Accessibility />} />
            </section>

            <section className="help-card" aria-label="Keyboard shortcuts">
              <div><strong>Quick tip</strong><ChevronDown size={16} aria-hidden="true" /></div>
              <p>Use <kbd>Alt</kbd> + <kbd>N</kbd> for check-in, <kbd>Alt</kbd> + <kbd>S</kbd> to search spots.</p>
              <p><kbd>Alt</kbd> + <kbd>L</kbd> staff sign in <span aria-hidden="true">·</span> <kbd>Alt</kbd> + <kbd>H</kbd> contrast <span aria-hidden="true">·</span> <kbd>Alt</kbd> + <kbd>D</kbd> dark</p>
            </section>
          </aside>
        </section>
        <footer className="page-footer"><span>Parkwise operations console</span><span>Role-Based Access Control</span><span>Accessible by design</span></footer>
      </main>

      {/* Checkin Modal */}
      {modalOpen && (
        <CheckinModal
          spots={spots}
          initialSpot={selectedSpot}
          onClose={() => setModalOpen(false)}
          onSuccess={async (ticket) => {
            setModalOpen(false);
            setNotice({ text: `${ticket.license_plate} checked in at ${ticket.spot_id}.`, error: false });
            await refresh();
          }}
          onError={handleModalError}
          onKeyDown={onModalKeyDown}
        />
      )}

      {/* Checkout Confirmation Dialog */}
      {pendingCheckout && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingCheckout(null);
          }}
        >
          <div
            className="modal checkout-confirmation"
            id="checkout-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="checkout-confirm-title"
            aria-describedby="checkout-confirm-description"
            onKeyDown={onModalKeyDown}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CONFIRM VEHICLE DEPARTURE</p>
                <h2 id="checkout-confirm-title">Check out this vehicle?</h2>
                <p id="checkout-confirm-description" className="muted">
                  This will end the active parking session and make the spot available again.
                  The final parking charge will be calculated.
                </p>
              </div>
            </div>
            <dl className="checkout-confirm-details">
              <div><dt>Vehicle</dt><dd>{pendingCheckout.license_plate}</dd></div>
              <div><dt>Parking spot</dt><dd>{pendingCheckout.spot_id}</dd></div>
              <div><dt>Vehicle type</dt><dd>{vehicleLabels[pendingCheckout.vehicle_type]}</dd></div>
            </dl>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-outline"
                data-initial-focus
                onClick={() => setPendingCheckout(null)}
              >
                Keep vehicle parked
              </button>
              <button type="button" className="button button-danger" onClick={() => void confirmCheckout()}>
                Confirm checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={closeLoginModal}
        onSuccess={() => {
          setNotice({ text: "Signed in successfully. Permissions unlocked.", error: false });
        }}
      />

      {/* Admin Add Spot Modal */}
      {role === "admin" && (
        <AddSpotModal
          isOpen={addSpotOpen}
          onClose={() => setAddSpotOpen(false)}
          onSuccess={(newSpot) => {
            setNotice({ text: `Parking spot ${newSpot.id} created successfully in ${newSpot.zone}.`, error: false });
            void refresh();
          }}
          onError={(msg) => setNotice({ text: msg, error: true })}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon, detail, tone }: { label: string; value: string | number; icon: ReactNode; detail: string; tone: string }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`} aria-hidden="true">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </article>
  );
}

function zoneSubtitle(zone: string) {
  if (zone === "Zone A") return "Standard";
  if (zone === "Zone B") return "EV charging";
  return "Accessible";
}

function Legend() {
  return (
    <div className="legend" aria-label="Spot status legend">
      <span><i className="legend-dot available" aria-hidden="true" />Available</span>
      <span><i className="legend-dot occupied" aria-hidden="true" />Occupied</span>
      <span><i className="legend-dot reserved" aria-hidden="true" />Reserved</span>
    </div>
  );
}

function SpotButton({ spot, onSelect }: { spot: Spot; onSelect: (spot: Spot) => void }) {
  const Icon = spot.spot_type === "ev" ? PlugZap : spot.spot_type === "accessible" ? Accessibility : CarFront;
  const statusText = spot.status[0].toUpperCase() + spot.status.slice(1);
  return (
    <button
      className={`spot-card spot-${spot.status}`}
      type="button"
      onClick={() => onSelect(spot)}
      disabled={spot.status === "reserved"}
      aria-label={`${spot.id}, ${vehicleLabels[spot.spot_type]} spot, ${statusText}${spot.license_plate ? `, vehicle ${spot.license_plate}` : ""}`}
      title={spot.status === "reserved" ? `${spot.id}: Reserved` : `${spot.id}: ${statusText}`}
    >
      <span className="spot-top"><span>{spot.id}</span><Icon size={16} aria-hidden="true" /></span>
      <span className="spot-state">{statusText}</span>
      {spot.license_plate && <span className="spot-plate">{spot.license_plate}</span>}
    </button>
  );
}

function Rate({ vehicle, amount, icon }: { vehicle: string; amount: string; icon: ReactNode }) {
  return <div className="rate-row"><span className="rate-icon" aria-hidden="true">{icon}</span><span>{vehicle}</span><strong>{amount}<small>/hr</small></strong></div>;
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const { ticket } = receipt;
  return (
    <article className="receipt" aria-labelledby="receipt-title">
      <div className="receipt-head"><h3 id="receipt-title"><Check size={18} aria-hidden="true" /> Checkout receipt</h3><button className="button button-small no-print" type="button" onClick={() => window.print()}>Print receipt</button></div>
      <dl>
        <div><dt>Ticket</dt><dd>{ticket.id.slice(0, 8).toUpperCase()}</dd></div>
        <div><dt>License plate</dt><dd>{ticket.license_plate}</dd></div>
        <div><dt>Parking spot</dt><dd>{ticket.spot_id}</dd></div>
        <div><dt>Duration</dt><dd>{Math.floor(receipt.duration_minutes / 60)}h {receipt.duration_minutes % 60}m</dd></div>
        <div className="receipt-total"><dt>Total paid</dt><dd>{currency.format(receipt.amount_paid)}</dd></div>
      </dl>
    </article>
  );
}

function CheckinModal({
  spots,
  initialSpot,
  onClose,
  onSuccess,
  onError,
  onKeyDown,
}: {
  spots: Spot[];
  initialSpot: string;
  onClose: () => void;
  onSuccess: (ticket: Ticket) => Promise<void>;
  onError: (message: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    () => spots.find((spot) => spot.id === initialSpot)?.spot_type ?? "standard",
  );
  const [licensePlate, setLicensePlate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [spotId, setSpotId] = useState(initialSpot);
  const [busy, setBusy] = useState(false);
  const [recommendedSpot, setRecommendedSpot] = useState("");
  const plateRef = useRef<HTMLInputElement>(null);
  const availableSpots = spots.filter(
    (spot) => spot.status === "available" && spot.spot_type === vehicleType,
  );

  useEffect(() => {
    let current = true;
    void api.recommendation(vehicleType).then(
      (recommendation) => {
        if (!current) return;
        setRecommendedSpot(recommendation.spot_id);
        setSpotId((selected) => {
          const initialIsCompatible = spots.some(
            (spot) =>
              spot.id === initialSpot &&
              spot.status === "available" &&
              spot.spot_type === vehicleType,
          );
          if (initialIsCompatible && selected === initialSpot) return selected;
          return recommendation.spot_id;
        });
      },
      (error: unknown) => {
        if (current) {
          setRecommendedSpot("");
          setSpotId("");
          onError(error instanceof Error ? error.message : "No compatible spot could be recommended.");
        }
      },
    );
    return () => { current = false; };
  }, [vehicleType, initialSpot, onError, spots]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const ticket = await api.checkIn({
        license_plate: licensePlate.trim().toUpperCase(),
        vehicle_type: vehicleType,
        phone_number: phoneNumber.trim(),
        ...(spotId ? { spot_id: spotId } : {}),
      });
      await onSuccess(ticket);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Vehicle check-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="modal"
        id="checkin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-title"
        aria-describedby="checkin-description"
        onKeyDown={onKeyDown}
      >
        <div className="modal-heading">
          <div><p className="eyebrow">VEHICLE ARRIVAL</p><h2 id="checkin-title">New vehicle entry</h2><p id="checkin-description" className="muted">Enter vehicle details to assign an available spot.</p></div>
          <button className="icon-button close-button" type="button" aria-label="Close check-in dialog" onClick={onClose}><X size={20} /></button>
        </div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="license-plate">License plate</label>
          <input ref={plateRef} id="license-plate" name="license_plate" required minLength={4} maxLength={10} pattern="[A-Za-z0-9]{2,4}[\x20\x2d]?[A-Za-z0-9]{2,5}" title="Use 4–10 letters or numbers, optionally separated by a hyphen." placeholder="e.g. AB-123" autoComplete="off" value={licensePlate} onChange={(event) => setLicensePlate(event.target.value.toUpperCase())} />
          <label htmlFor="vehicle-type">Vehicle type</label>
          <select id="vehicle-type" name="vehicle_type" value={vehicleType} onChange={(event) => { setVehicleType(event.target.value as VehicleType); setSpotId(""); }}>
            <option value="standard">Standard</option><option value="ev">EV charging</option><option value="accessible">Accessible</option>
          </select>
          <label htmlFor="phone-number">Phone number</label>
          <input id="phone-number" name="phone_number" type="tel" required minLength={9} maxLength={20} pattern="\+?[0-9][0-9\x20\x28\x29\x2d]{7,18}[0-9]" title="Enter a phone number with 9–20 digits and optional spaces, parentheses, hyphens, or leading plus." placeholder="+1 555 123 4567" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
          <label htmlFor="assigned-spot">Assigned spot</label>
          <select id="assigned-spot" name="spot_id" value={spotId} onChange={(event) => setSpotId(event.target.value)}>
            <option value="">Automatically assign the recommended spot</option>
            {availableSpots.map((spot) => <option value={spot.id} key={spot.id}>{spot.id}{spot.id === recommendedSpot ? " — Recommended" : ""}</option>)}
          </select>
          <p className="field-hint">{recommendedSpot ? `Closest compatible spot: ${recommendedSpot}.` : "No compatible spot is currently available."}</p>
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy || (!recommendedSpot && availableSpots.length === 0)}>
              {busy ? "Checking in…" : <><Plus size={17} aria-hidden="true" /> Check in vehicle</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Dashboard() {
  return <ErrorBoundary><AppContent /></ErrorBoundary>;
}

export default Dashboard;
