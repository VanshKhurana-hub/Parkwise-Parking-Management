import {
  Accessibility,
  ArrowDownToLine,
  ArrowUpRight,
  CarFront,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  PlugZap,
  Plus,
  Search,
  SunMoon,
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
import { ErrorBoundary } from "./ErrorBoundary";
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

function Legend() {
  return (
    <div className="legend" aria-label="Spot status legend">
      <span><i className="legend-dot available" aria-hidden="true" />Available</span>
      <span><i className="legend-dot occupied" aria-hidden="true" />Occupied</span>
      <span><i className="legend-dot reserved" aria-hidden="true" />Reserved</span>
    </div>
  );
}

function Rate({ vehicle, amount, icon }: { vehicle: string; amount: string; icon: ReactNode }) {
  return <div className="rate-row"><span className="rate-icon" aria-hidden="true">{icon}</span><span>{vehicle}</span><strong>{amount}<small>/hr</small></strong></div>;
}


function zoneSubtitle(zone: string) {
  if (zone === "Zone A") return "Standard";
  if (zone === "Zone B") return "EV charging";
  return "Accessible";
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


function AppContent() {
  const { fontScale, highContrast, darkMode, changeFontScale, toggleHighContrast, toggleDarkMode } =
    useAccessibility();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

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

  const openCheckin = useCallback((spotId = "") => {
    setSelectedSpot(spotId);
    setModalOpen(true);
  }, []);

  const zones = useMemo(() => [...new Set(spots.map((spot) => spot.zone))], [spots]);

  function handleSpot(spot: Spot) {
    if (spot.status === "available") openCheckin(spot.id);
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
          <button className="button button-primary new-entry" type="button" aria-haspopup="dialog" aria-expanded={modalOpen} onClick={() => setModalOpen(true)}>
            <Plus size={18} aria-hidden="true" /><span>New entry</span>
          </button>
        </nav>
      </header>

      <main className="page-content">
        <section className="page-heading" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">PARKING OPERATIONS</p>
            <h1 id="page-title">Good day, Vansh <span aria-hidden="true">✳</span></h1>
            <p className="muted">Welcome back, Vansh. Here’s what’s happening in your parking facility today.</p>
          </div>
          <p className="today-label"><Clock3 size={16} aria-hidden="true" /> Live facility overview</p>
        </section>

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
              <span className="live-chip"><span aria-hidden="true" className="live-dot" /> Live</span>
            </div>
            <div className="zone-list" aria-live="polite" aria-busy={loading}>
              {loading ? <div className="empty-state">Loading parking spots…</div> : zones.map((zone) => (
                <section className="zone-section" key={zone} aria-labelledby={`zone-${zone.replaceAll(" ", "-")}`}>
                  <div className="zone-heading">
                    <h3 id={`zone-${zone.replaceAll(" ", "-")}`}>{zone}</h3>
                    <span>{zoneSubtitle(zone)} · {spots.filter((spot) => spot.zone === zone).length} spots</span>
                  </div>
                  <div className="spot-grid">
                    {spots.filter((spot) => spot.zone === zone).map((spot) => (
                      <SpotButton key={spot.id} spot={spot} onSelect={handleSpot} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </section>
      </main>

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
          onError={(msg) => setNotice({ text: msg, error: true })}
          onKeyDown={() => {}}
        />
      )}
    </div>
  );
}

function Dashboard() {
  return <ErrorBoundary><AppContent /></ErrorBoundary>;
}

export default Dashboard;
