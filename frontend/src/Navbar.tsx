import {
  Accessibility,
  BarChart3,
  Building2,
  Calendar,
  CarFront,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  LogIn,
  LogOut,
  Menu,
  QrCode,
  Receipt,
  ScanLine,
  Shield,
  ShieldAlert,
  Sparkles,
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

interface NavItem {
  id: NavView;
  label: string;
  icon: typeof BarChart3;
  badge?: string;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
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
  const [collapsed, setCollapsed] = useState(false);

  const activeRole: UserRole = user?.role ?? "guest";

  function handleSignOut() {
    logout();
    onNotify("Signed out successfully. Switched to public guest mode.", false);
  }

  function handleNav(view: NavView) {
    onNavigate(view);
    setMobileMenuOpen(false);
  }

  // Construct role-tailored navigation groups
  const navGroups: NavGroup[] = [];

  if (activeRole === "admin") {
    navGroups.push(
      {
        heading: "ANALYTICS & AUDIT",
        items: [
          { id: "admin_analytics", label: "Analytics Dashboard", icon: BarChart3 },
          { id: "audit_logs", label: "System Audit Trail", icon: Shield },
        ],
      },
      {
        heading: "INFRASTRUCTURE",
        items: [
          { id: "floors", label: "Floor-Wise Slots", icon: Building2 },
          { id: "pricing", label: "Tiered Pricing Engine", icon: DollarSign },
        ],
      },
      {
        heading: "OPERATIONS",
        items: [
          { id: "allotment", label: "Slot Allotment", icon: QrCode },
          { id: "checkout", label: "Vehicle Checkout", icon: Receipt },
        ],
      },
    );
  } else if (activeRole === "manager") {
    navGroups.push(
      {
        heading: "SLOTS & PRICING",
        items: [
          { id: "floors", label: "Floor-Wise Slots", icon: Building2 },
          { id: "pricing", label: "Tiered Pricing Engine", icon: DollarSign },
        ],
      },
      {
        heading: "PERSONNEL",
        items: [
          { id: "personnel", label: "Personnel Governance", icon: UserCog },
          { id: "guard_schedule", label: "Guard Shift Scheduling", icon: Calendar },
        ],
      },
      {
        heading: "OPERATIONS",
        items: [
          { id: "allotment", label: "Allotment (Arrivals)", icon: QrCode },
          { id: "checkout", label: "Vehicle Checkout", icon: Receipt },
        ],
      },
    );
  } else if (activeRole === "biller" || activeRole === "attendant") {
    navGroups.push(
      {
        heading: "OPERATIONAL TASKS",
        items: [
          { id: "allotment", label: "Slot Allotment (RegEx & QR)", icon: QrCode },
          { id: "checkout", label: "Vehicle Checkout & Billing", icon: Receipt },
          { id: "qr_kiosk", label: "Touchless QR Terminal", icon: ScanLine },
        ],
      },
      {
        heading: "MONITORING",
        items: [
          { id: "floors", label: "Floor Slot Monitor", icon: Building2 },
        ],
      },
    );
  } else if (activeRole === "security_guard") {
    navGroups.push(
      {
        heading: "GUARD CONSOLE",
        items: [
          { id: "guard_portal", label: "My Duty Timetable", icon: Calendar },
          { id: "floors", label: "Assigned Floor Status", icon: Building2 },
        ],
      },
    );
  } else {
    // Guest
    navGroups.push(
      {
        heading: "PUBLIC ACCESS",
        items: [
          { id: "floors", label: "Floor Availability", icon: Building2 },
          { id: "pricing", label: "Rates & Tiers", icon: DollarSign },
          { id: "qr_kiosk", label: "Scan Ticket QR", icon: ScanLine },
        ],
      },
    );
  }

  // Get active view title for mobile header
  let currentTitle = "Parkwise";
  for (const group of navGroups) {
    const found = group.items.find((item) => item.id === currentView);
    if (found) {
      currentTitle = found.label;
      break;
    }
  }

  return (
    <>
      {/* Mobile Top Bar (Visible only on screens < 1024px) */}
      <div className="mobile-topbar" aria-label="Mobile Navigation Bar">
        <button
          type="button"
          className="icon-button mobile-sidebar-trigger"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation sidebar"
        >
          <Menu size={22} />
        </button>

        <div className="mobile-topbar-brand">
          <span className="brand-mark-small">
            <CarFront size={18} />
          </span>
          <span className="mobile-view-title">{currentTitle}</span>
        </div>

        <div className="mobile-topbar-actions">
          <button
            type="button"
            className="icon-button mobile-theme-btn"
            onClick={toggleDarkMode}
            aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
          >
            <SunMoon size={18} />
          </button>
        </div>
      </div>

      {/* Backdrop overlay for mobile drawer */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Left Navigation Sidebar */}
      <aside
        className={`app-sidebar ${collapsed ? "collapsed" : ""} ${
          mobileMenuOpen ? "mobile-open" : ""
        }`}
        aria-label="Primary Left Navigation"
      >
        {/* Sidebar Header / Brand */}
        <div className="sidebar-header">
          <a
            className="sidebar-brand-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (activeRole === "admin") onNavigate("admin_analytics");
              else if (activeRole === "manager") onNavigate("floors");
              else if (activeRole === "security_guard") onNavigate("guard_portal");
              else onNavigate("allotment");
            }}
            title="Parkwise Parking Management System"
          >
            <span className="brand-mark" aria-hidden="true">
              <CarFront size={22} />
            </span>
            {!collapsed && (
              <div className="brand-text-col">
                <span className="brand-title">
                  parkwise<span className="brand-period">.</span>
                </span>
                <span className="brand-sub">PMS &bull; ENTERPRISE</span>
              </div>
            )}
          </a>

          {/* Desktop Collapse Toggle Button */}
          <button
            type="button"
            className="sidebar-toggle-btn desktop-only"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="sidebar-close-btn mobile-only"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation sidebar"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Identity Profile Card */}
        <div className="sidebar-profile-section">
          {isAuthenticated && user ? (
            <div className={`sidebar-profile-card ${collapsed ? "compact" : ""}`}>
              <div className="profile-avatar-wrap">
                <span className={`role-avatar-badge role-${activeRole}`}>
                  {activeRole === "admin" ? (
                    <Shield size={14} aria-hidden="true" />
                  ) : activeRole === "manager" ? (
                    <UserCog size={14} aria-hidden="true" />
                  ) : activeRole === "security_guard" ? (
                    <ShieldAlert size={14} aria-hidden="true" />
                  ) : (
                    <Receipt size={14} aria-hidden="true" />
                  )}
                </span>
              </div>

              {!collapsed && (
                <div className="profile-info-col">
                  <span className="profile-name" title={user.full_name}>
                    {user.full_name}
                  </span>
                  <span className="profile-role-tag">
                    {activeRole === "admin"
                      ? "System Admin"
                      : activeRole === "manager"
                      ? "Operations Manager"
                      : activeRole === "security_guard"
                      ? "Security Guard"
                      : "Parking Biller"}
                  </span>
                </div>
              )}

              <button
                className="icon-button sidebar-logout-btn"
                type="button"
                aria-label="Sign out"
                title="Sign out of account"
                onClick={handleSignOut}
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className={`sidebar-guest-card ${collapsed ? "compact" : ""}`}>
              {!collapsed ? (
                <button
                  type="button"
                  className="button button-primary sidebar-signin-btn"
                  onClick={() => {
                    onOpenSignIn();
                    setMobileMenuOpen(false);
                  }}
                  title="Sign in with your staff account"
                >
                  <LogIn size={16} aria-hidden="true" />
                  <span>Staff Sign In</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-button sidebar-signin-icon-btn"
                  onClick={() => {
                    onOpenSignIn();
                    setMobileMenuOpen(false);
                  }}
                  title="Sign in with staff account"
                >
                  <LogIn size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Primary Navigation Item Groups */}
        <nav className="sidebar-nav-scroll" aria-label="Role functional modules">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="sidebar-nav-group">
              {!collapsed && (
                <div className="sidebar-group-heading">{group.heading}</div>
              )}
              <div className="sidebar-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sidebar-nav-link ${isActive ? "active" : ""}`}
                      onClick={() => handleNav(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="sidebar-link-icon" aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      {!collapsed && (
                        <span className="sidebar-link-text">{item.label}</span>
                      )}
                      {isActive && <span className="sidebar-active-indicator" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Staff Sign In for Guests at bottom of menu */}
          {activeRole === "guest" && (
            <div className="sidebar-nav-group">
              {!collapsed && <div className="sidebar-group-heading">AUTHENTICATION</div>}
              <button
                type="button"
                className="sidebar-nav-link highlight"
                onClick={() => {
                  onOpenSignIn();
                  setMobileMenuOpen(false);
                }}
                title="Staff Sign In"
              >
                <span className="sidebar-link-icon">
                  <LogIn size={18} />
                </span>
                {!collapsed && <span className="sidebar-link-text">Staff Sign In</span>}
              </button>
            </div>
          )}
        </nav>

        {/* Sidebar Footer Controls & Status */}
        <div className="sidebar-footer">
          {/* Accessibility & Theme Toggles */}
          <div className={`sidebar-controls-row ${collapsed ? "vertical" : ""}`}>
            {/* Zoom / Text Scale */}
            {!collapsed ? (
              <div className="sidebar-zoom-box" title="Adjust text size scale">
                <button
                  type="button"
                  className="zoom-btn"
                  onClick={() => changeFontScale(-1)}
                  aria-label="Decrease text size"
                  title="Decrease text size"
                >
                  A−
                </button>
                <span className="zoom-label">
                  {["100%", "110%", "120%", "130%"][fontScale]}
                </span>
                <button
                  type="button"
                  className="zoom-btn"
                  onClick={() => changeFontScale(1)}
                  aria-label="Increase text size"
                  title="Increase text size"
                >
                  A+
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="icon-button sidebar-footer-icon-btn"
                onClick={() => changeFontScale(fontScale >= 3 ? -1 : 1)}
                title="Change font scale"
              >
                <span style={{ fontSize: "12px", fontWeight: 700 }}>A±</span>
              </button>
            )}

            {/* High Contrast */}
            <button
              type="button"
              className={`icon-button sidebar-footer-icon-btn ${highContrast ? "active" : ""}`}
              onClick={toggleHighContrast}
              aria-label="Toggle high contrast"
              aria-pressed={highContrast}
              title="Toggle high contrast"
            >
              <Accessibility size={17} aria-hidden="true" />
            </button>

            {/* Dark / Light Toggle */}
            <button
              type="button"
              className="icon-button sidebar-footer-icon-btn"
              onClick={toggleDarkMode}
              aria-label={`Toggle ${darkMode ? "light" : "dark"} mode`}
              aria-pressed={darkMode}
              title={`Switch to ${darkMode ? "light" : "dark"} mode`}
            >
              <SunMoon size={17} aria-hidden="true" />
            </button>
          </div>

          {/* System Status Indicator */}
          {!collapsed ? (
            <div className="sidebar-system-status">
              <span className="status-live-dot" aria-hidden="true" />
              <div className="status-text-col">
                <span className="status-live-title">System Live &bull; v2.4</span>
                <span className="status-live-sub">RBAC Enforced</span>
              </div>
              <Sparkles size={13} className="status-sparkle" aria-hidden="true" />
            </div>
          ) : (
            <div className="sidebar-system-status compact" title="System Live • RBAC Active">
              <span className="status-live-dot" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
