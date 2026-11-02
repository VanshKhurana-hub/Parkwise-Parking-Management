import {
  Accessibility,
  BarChart3,
  Building2,
  Calendar,
  CarFront,
  DollarSign,
  LogIn,
  LogOut,
  Menu,
  QrCode,
  Receipt,
  ScanLine,
  Shield,
  ShieldAlert,
  SunMoon,
  UserCog,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAccessibility } from "./AccessibilityContext";
import { useAuth } from "./AuthContext";
import type { UserRole } from "./types";

export type NavView =
  | "allotment"
  | "checkout"
  | "qr_kiosk"
  | "floors"
  | "pricing"
  | "guard_schedule"
  | "guard_portal"
  | "personnel"
  | "admin_analytics"
  | "audit_logs";

interface NavbarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  onOpenSignIn: () => void;
  onNotify: (text: string, error?: boolean) => void;
}

export function Navbar({
  currentView,
  onNavigate,
  onOpenSignIn,
  onNotify,
}: NavbarProps) {
  const { fontScale, highContrast, darkMode, changeFontScale, toggleHighContrast, toggleDarkMode } =
    useAccessibility();
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeRole: UserRole = user?.role ?? "guest";

  function handleSignOut() {
    logout();
    onNotify("Signed out successfully. Switched to public guest mode.", false);
  }

  function handleNav(view: NavView) {
    onNavigate(view);
    setMobileMenuOpen(false);
  }

  return (
    <header className="topbar-header">
      {/* Top Banner Row */}
      <div className="topbar-upper-row">
        {/* Brand */}
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (activeRole === "admin") onNavigate("admin_analytics");
            else if (activeRole === "manager") onNavigate("floors");
            else if (activeRole === "security_guard") onNavigate("guard_portal");
            else onNavigate("allotment");
          }}
          aria-label="Parkwise Parking Operations"
        >
          <span className="brand-mark" aria-hidden="true">
            <CarFront size={22} />
          </span>
          <span className="brand-title">
            parkwise<span className="brand-period">.</span>
          </span>
        </a>

        {/* User Identity Chip & Accessibility Tools */}
        <div className="topbar-right-controls">
          {/* Text Size Scale */}
          <div className="font-controls" aria-label="Text size zoom controls">
            <button
              className="icon-button"
              type="button"
              aria-label="Decrease text size"
              title="Decrease text size"
              onClick={() => changeFontScale(-1)}
            >
              A−
            </button>
            <span className="font-size-label" aria-live="polite">
              {["Small", "Medium", "Large", "Extra"][fontScale]}
            </span>
            <button
              className="icon-button"
              type="button"
              aria-label="Increase text size"
              title="Increase text size"
              onClick={() => changeFontScale(1)}
            >
              A+
            </button>
          </div>

          {/* Theme & Contrast */}
          <button
            className="icon-button labeled-control"
            type="button"
            aria-label="Toggle high contrast"
            aria-pressed={highContrast}
            onClick={toggleHighContrast}
          >
            <Accessibility size={17} aria-hidden="true" />
            <span>Contrast</span>
          </button>
          <button
            className="icon-button labeled-control"
            type="button"
            aria-label={`Toggle ${darkMode ? "light" : "dark"} mode`}
            aria-pressed={darkMode}
            onClick={toggleDarkMode}
          >
            <SunMoon size={17} aria-hidden="true" />
            <span>{darkMode ? "Dark" : "Light"}</span>
          </button>

          {/* Auth Identity / Sign In */}
          {isAuthenticated && user ? (
            <div className="auth-profile-chip" aria-label={`Logged in as ${user.full_name}`}>
              <span className={`role-badge role-${activeRole}`}>
                {activeRole === "admin" ? (
                  <Shield size={13} aria-hidden="true" />
                ) : activeRole === "manager" ? (
                  <UserCog size={13} aria-hidden="true" />
                ) : activeRole === "security_guard" ? (
                  <ShieldAlert size={13} aria-hidden="true" />
                ) : (
                  <Receipt size={13} aria-hidden="true" />
                )}
                <span>
                  {activeRole === "admin"
                    ? "Admin"
                    : activeRole === "manager"
                    ? "Manager"
                    : activeRole === "security_guard"
                    ? "Guard"
                    : "Biller"}
                </span>
              </span>
              <span className="user-name-text">{user.full_name}</span>
              <button
                className="icon-button logout-btn"
                type="button"
                aria-label="Sign out"
                title="Sign out of account"
                onClick={handleSignOut}
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button button-primary signin-navbar-btn"
              onClick={onOpenSignIn}
              title="Sign in with your staff account"
            >
              <LogIn size={16} aria-hidden="true" />
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            className="icon-button mobile-menu-toggle"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Primary Role-Based Menu Bar (Nav Ribbon) */}
      <nav
        className={`task-menu-bar ${mobileMenuOpen ? "mobile-expanded" : ""}`}
        aria-label="Functional Task Menu Bar"
      >
        <div className="menu-bar-track">
          {/* Admin Navigation */}
          {activeRole === "admin" && (
            <>
              <button
                type="button"
                className={`menu-tab ${currentView === "admin_analytics" ? "active" : ""}`}
                onClick={() => handleNav("admin_analytics")}
              >
                <BarChart3 size={16} aria-hidden="true" />
                <span>Analytics Dashboard</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "floors" ? "active" : ""}`}
                onClick={() => handleNav("floors")}
              >
                <Building2 size={16} aria-hidden="true" />
                <span>Floor-Wise Slots</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "pricing" ? "active" : ""}`}
                onClick={() => handleNav("pricing")}
              >
                <DollarSign size={16} aria-hidden="true" />
                <span>Tiered Pricing Engine</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "allotment" ? "active" : ""}`}
                onClick={() => handleNav("allotment")}
              >
                <QrCode size={16} aria-hidden="true" />
                <span>Slot Allotment</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "checkout" ? "active" : ""}`}
                onClick={() => handleNav("checkout")}
              >
                <Receipt size={16} aria-hidden="true" />
                <span>Vehicle Checkout</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "audit_logs" ? "active" : ""}`}
                onClick={() => handleNav("audit_logs")}
              >
                <Shield size={16} aria-hidden="true" />
                <span>System Audit Trail</span>
              </button>
            </>
          )}

          {/* Manager Navigation */}
          {activeRole === "manager" && (
            <>
              <button
                type="button"
                className={`menu-tab ${currentView === "floors" ? "active" : ""}`}
                onClick={() => handleNav("floors")}
              >
                <Building2 size={16} aria-hidden="true" />
                <span>Floor-Wise Slot Management</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "pricing" ? "active" : ""}`}
                onClick={() => handleNav("pricing")}
              >
                <DollarSign size={16} aria-hidden="true" />
                <span>Tiered Pricing Engine</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "personnel" ? "active" : ""}`}
                onClick={() => handleNav("personnel")}
              >
                <UserCog size={16} aria-hidden="true" />
                <span>Personnel Governance</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "guard_schedule" ? "active" : ""}`}
                onClick={() => handleNav("guard_schedule")}
              >
                <Calendar size={16} aria-hidden="true" />
                <span>Guard Shift Scheduling</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "allotment" ? "active" : ""}`}
                onClick={() => handleNav("allotment")}
              >
                <QrCode size={16} aria-hidden="true" />
                <span>Allotment (Arrivals)</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "checkout" ? "active" : ""}`}
                onClick={() => handleNav("checkout")}
              >
                <Receipt size={16} aria-hidden="true" />
                <span>Vehicle Checkout</span>
              </button>
            </>
          )}

          {/* Biller / Attendant Navigation */}
          {(activeRole === "biller" || activeRole === "attendant") && (
            <>
              <button
                type="button"
                className={`menu-tab ${currentView === "allotment" ? "active" : ""}`}
                onClick={() => handleNav("allotment")}
              >
                <QrCode size={16} aria-hidden="true" />
                <span>Slot Allotment (RegEx & QR Pass)</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "checkout" ? "active" : ""}`}
                onClick={() => handleNav("checkout")}
              >
                <Receipt size={16} aria-hidden="true" />
                <span>Vehicle Checkout & Billing</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "qr_kiosk" ? "active" : ""}`}
                onClick={() => handleNav("qr_kiosk")}
              >
                <ScanLine size={16} aria-hidden="true" />
                <span>Touchless QR Gate Terminal</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "floors" ? "active" : ""}`}
                onClick={() => handleNav("floors")}
              >
                <Building2 size={16} aria-hidden="true" />
                <span>Floor Slot Monitor</span>
              </button>
            </>
          )}

          {/* Security Guard Navigation */}
          {activeRole === "security_guard" && (
            <>
              <button
                type="button"
                className={`menu-tab ${currentView === "guard_portal" ? "active" : ""}`}
                onClick={() => handleNav("guard_portal")}
              >
                <Calendar size={16} aria-hidden="true" />
                <span>My Duty Timetable & Console</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "floors" ? "active" : ""}`}
                onClick={() => handleNav("floors")}
              >
                <Building2 size={16} aria-hidden="true" />
                <span>Assigned Floor Status</span>
              </button>
            </>
          )}

          {/* Public / Guest Navigation */}
          {activeRole === "guest" && (
            <>
              <button
                type="button"
                className={`menu-tab ${currentView === "floors" ? "active" : ""}`}
                onClick={() => handleNav("floors")}
              >
                <Building2 size={16} aria-hidden="true" />
                <span>Live Floor Availability</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "pricing" ? "active" : ""}`}
                onClick={() => handleNav("pricing")}
              >
                <DollarSign size={16} aria-hidden="true" />
                <span>Rates & Tiers</span>
              </button>
              <button
                type="button"
                className={`menu-tab ${currentView === "qr_kiosk" ? "active" : ""}`}
                onClick={() => handleNav("qr_kiosk")}
              >
                <ScanLine size={16} aria-hidden="true" />
                <span>Scan Ticket QR</span>
              </button>
              <button
                type="button"
                className="menu-tab highlight"
                onClick={onOpenSignIn}
              >
                <LogIn size={16} aria-hidden="true" />
                <span>Staff Sign In</span>
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
