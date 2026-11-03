import {
  Check,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoginPage } from "./LoginPage";
import { Navbar, type NavView } from "./Navbar";
import { AllotmentPage } from "./AllotmentPage";
import { CheckoutPage } from "./CheckoutPage";
import { QRKioskPage } from "./QRKioskPage";
import { QRScannerModal } from "./QRModule";
import { FloorSlotManager } from "./FloorSlotManager";
import { TieredPricingEngine } from "./TieredPricingEngine";
import { GuardScheduler } from "./GuardScheduler";
import { GuardPortal } from "./GuardPortal";
import { PersonnelManager } from "./PersonnelManager";
import { AdminAnalyticsDashboard } from "./AdminAnalyticsDashboard";
import { TransactionLog } from "./TransactionLog";
import type { HourlyRates, Spot, Stats } from "./types";

const emptyStats: Stats = {
  total_spots: 0,
  free_spots: 0,
  occupied_count: 0,
  reserved_count: 0,
  maintenance_count: 0,
  daily_revenue: 0,
};

function AppContent() {
  const { user, role, isAuthenticated } = useAuth();
  const [guestMode, setGuestMode] = useState(false);

  // Default view based on role
  const [currentView, setCurrentView] = useState<NavView>(() => {
    if (role === "admin") return "admin_analytics";
    if (role === "manager") return "floors";
    if (role === "security_guard") return "guard_portal";
    return "allotment";
  });

  // Switch view when role changes to relevant permitted dashboard
  useEffect(() => {
    if (role === "admin") setCurrentView("admin_analytics");
    else if (role === "manager") setCurrentView("floors");
    else if (role === "security_guard") setCurrentView("guard_portal");
    else if (role === "biller" || role === "attendant") setCurrentView("allotment");
    else setCurrentView("floors");
  }, [role]);

  const [rates, setRates] = useState<HourlyRates>({
    standard: 40,
    ev: 70,
    accessible: 30,
  });
  const [spots, setSpots] = useState<Spot[]>([]);
  const [, setStats] = useState<Stats>(emptyStats);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [selectedSpotForBooking, setSelectedSpotForBooking] = useState<string | null>(null);
  const [qrScannerModalOpen, setQrScannerModalOpen] = useState(false);
  const [txRefreshKey, setTxRefreshKey] = useState(0);

  const notify = useCallback((text: string, error = false) => {
    setNotice({ text, error });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextSpots, nextStats, nextRates] = await Promise.all([
        api.spots(),
        api.stats(),
        api.rates().catch(() => null),
      ]);
      setSpots(nextSpots);
      setStats(nextStats);
      if (nextRates) setRates(nextRates);
      setTxRefreshKey((k) => k + 1);
    } catch {
      // Handled
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Requirement: "authentication login should be the first page that appears when fire the server"
  if (!isAuthenticated && !guestMode) {
    return (
      <LoginPage
        onContinueAsGuest={() => {
          setGuestMode(true);
          setCurrentView("floors");
        }}
        onLoginSuccess={() => {
          setGuestMode(false);
          notify("Authentication successful. Welcome to Parkwise.", false);
        }}
      />
    );
  }

  function handleQrScanFromKiosk(ticketId: string) {
    setCurrentView("checkout");
    notify(`QR decoded: #${ticketId.slice(0, 8)}. Ready for checkout calculation.`, false);
  }

  function handleSelectSpotFromMonitor(spot: Spot) {
    if (role === "security_guard") {
      notify("Security guards have read-only monitoring access. Slot allotment is restricted to Billers.", true);
      return;
    }
    if (role !== "biller" && role !== "attendant") {
      notify("Slot allotment permission is restricted to Billers.", true);
      return;
    }
    if (spot.status === "occupied") {
      notify(`Spot ${spot.id} is occupied by vehicle ${spot.license_plate || "N/A"}.`, true);
      return;
    }
    if (spot.status === "maintenance") {
      notify(`Spot ${spot.id} is currently under maintenance and cannot be allotted.`, true);
      return;
    }
    if (spot.status === "reserved") {
      notify(`Spot ${spot.id} is reserved and cannot be allotted right now.`, true);
      return;
    }

    // Available slot -> open in allotment window
    setSelectedSpotForBooking(spot.id);
    setCurrentView("allotment");
    notify(`Spot ${spot.id} (${spot.floor || "Floor 1"}, ${spot.zone}) opened for vehicle allotment.`, false);
  }

  return (
    <div className="app-shell sidebar-layout">
      {/* Navigation bar on the left side of the page */}
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          // If manually navigating away, clear preselected spot if moving to allotment without a spot
          if (view !== "allotment") {
            setSelectedSpotForBooking(null);
          }
          setCurrentView(view);
        }}
        onOpenSignIn={() => setGuestMode(false)}
        onNotify={notify}
      />

      <div className="app-main-layout">
        <main className="page-content">
        {/* Global Toast Notification */}
        {notice && (
          <div
            className={`toast ${notice.error ? "toast-error" : "toast-success"}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.error ? <X size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
            <span>{notice.text}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* 1. Dedicated Page: Slot Allotment (Arrivals, RegEx Plate Validation, QR Generation) */}
        {currentView === "allotment" && (
          role === "security_guard" ? (
            <div className="access-denied-panel" role="alert">
              <ShieldAlert size={48} className="access-denied-icon" aria-hidden="true" />
              <h3>Allotment Permission Restricted</h3>
              <p>
                Security guards have read-only duty timetable and slot monitoring access.
                Vehicle allotment and ticket issuance permissions are strictly restricted to Front Desk Billers.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => setCurrentView("guard_portal")}
              >
                Return to My Timetable
              </button>
            </div>
          ) : (
            <AllotmentPage
              spots={spots}
              initialSpotId={selectedSpotForBooking}
              onClearInitialSpot={() => setSelectedSpotForBooking(null)}
              onRefreshSpots={refresh}
              onNotify={notify}
            />
          )
        )}

        {/* 2. Dedicated Page: Vehicle Checkout & Automated Tiered Billing */}
        {currentView === "checkout" && (
          <CheckoutPage
            spots={spots}
            onOpenQRScanner={() => setQrScannerModalOpen(true)}
            onRefresh={refresh}
            onNotify={notify}
          />
        )}

        {/* 3. Dedicated Page: Touchless Exit Gate QR Terminal */}
        {currentView === "qr_kiosk" && (
          <QRKioskPage
            spots={spots}
            onScanSuccess={handleQrScanFromKiosk}
            onNotify={notify}
          />
        )}

        {/* 4. Dedicated Page: Floor-Wise Slot Management */}
        {currentView === "floors" && (
          <FloorSlotManager
            spots={spots}
            role={role}
            onRefresh={refresh}
            onSelectSpot={handleSelectSpotFromMonitor}
            onNotify={notify}
          />
        )}

        {/* 5. Dedicated Page: Duration Tracking & Tiered Pricing Engine */}
        {currentView === "pricing" && (
          <TieredPricingEngine
            rates={rates}
            role={role}
            onRefreshRates={refresh}
            onNotify={notify}
          />
        )}

        {/* 6. Dedicated Page: Security Guard Duty Scheduling */}
        {currentView === "guard_schedule" && (
          <GuardScheduler role={role} onNotify={notify} />
        )}

        {/* 7. Dedicated Page: Security Guard Personal Timetable & Salary Console */}
        {currentView === "guard_portal" && (
          <GuardPortal onNotify={notify} />
        )}

        {/* 8. Dedicated Page: System Personnel Governance */}
        {currentView === "personnel" && (
          <PersonnelManager role={role} onNotify={notify} />
        )}

        {/* 9. Dedicated Page: Admin Exclusive Analytical Dashboard */}
        {currentView === "admin_analytics" && role === "admin" && (
          <AdminAnalyticsDashboard onNotify={notify} />
        )}

        {/* 10. Dedicated Page: System Audit Trail Logs */}
        {currentView === "audit_logs" && (
          <section className="audit-section-wrapper">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">System Transaction & Audit Trail</h2>
                <p className="muted">Live immutable record of all parking operations and access control events.</p>
              </div>
            </div>
            <TransactionLog refreshKey={txRefreshKey} />
          </section>
        )}

        <footer className="page-footer">
          <span>Parkwise Operational Platform</span>
          <span>Role-Based Access Control Architecture</span>
          <span>Logged in as: <strong>{user?.full_name || "Guest Driver"}</strong> ({role})</span>
        </footer>
      </main>
    </div>

      {/* Floating QR Camera Scanner Modal */}
      <QRScannerModal
        isOpen={qrScannerModalOpen}
        onClose={() => setQrScannerModalOpen(false)}
        onScanSuccess={(ticketId) => {
          setQrScannerModalOpen(false);
          handleQrScanFromKiosk(ticketId);
        }}
        activeSpots={spots}
      />
    </div>
  );
}

function Dashboard() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default Dashboard;
