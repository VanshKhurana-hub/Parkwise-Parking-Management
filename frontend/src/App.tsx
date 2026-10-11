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
