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

function Dashboard() {
  return (
    <ErrorBoundary>
      <div className="app-shell">
        <StatCard label="Total spots" value={emptyStats.total_spots} icon={<CarFront />} detail="Across 3 zones" tone="blue" />
        <Legend />
        <Rate vehicle={vehicleLabels.standard} amount="$4" icon={<CarFront />} />
      </div>
    </ErrorBoundary>
  );
}

export default Dashboard;
