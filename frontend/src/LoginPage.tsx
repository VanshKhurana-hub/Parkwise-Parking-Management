import {
  CarFront,
  Lock,
  LogIn,
  Shield,
  ShieldAlert,
  User,
  UserCog,
  Receipt,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

interface LoginPageProps {
  onContinueAsGuest: () => void;
  onLoginSuccess?: () => void;
}

export function LoginPage({ onContinueAsGuest, onLoginSuccess }: LoginPageProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      onLoginSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please verify credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickLogin(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    setError(null);
    setBusy(true);
    try {
      await login(u, p);
      onLoginSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page-wrapper">
      <div className="login-card-container">
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="brand-logo-large" aria-hidden="true">
            <CarFront size={32} />
          </div>
          <h1>
            parkwise<span className="brand-period">.</span>
          </h1>
          <p className="login-subtitle">
            Enterprise Parking Management &bull; Role-Based Access Control
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-error-alert" role="alert" aria-live="polite">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="login-form-box">
          <div className="form-group">
            <label htmlFor="login-username">Username</label>
            <div className="input-icon-wrap">
              <User size={18} className="input-icon" aria-hidden="true" />
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                placeholder="Enter username (e.g. admin, manager, biller, guard)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <div className="input-icon-wrap">
              <Lock size={18} className="input-icon" aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <button type="submit" className="button button-primary login-submit-btn" disabled={busy}>
            {busy ? (
              "Signing In..."
            ) : (
              <>
                <LogIn size={18} aria-hidden="true" />
                <span>Sign In to System</span>
              </>
            )}
          </button>
        </form>

        {/* 1-Click Role Presets */}
        <div className="demo-roles-section">
          <div className="demo-roles-divider">
            <Sparkles size={14} aria-hidden="true" />
            <span>Instant 1-Click Role Login</span>
          </div>

          <div className="demo-roles-grid">
            <button
              type="button"
              className="demo-role-btn role-admin-btn"
              onClick={() => void handleQuickLogin("admin", "admin123")}
              disabled={busy}
            >
              <div className="role-btn-head">
                <Shield size={16} aria-hidden="true" />
                <strong>Admin</strong>
              </div>
              <span className="role-desc">Analytics Dashboard & Audit Review</span>
              <span className="demo-creds">admin / admin123</span>
            </button>

            <button
              type="button"
              className="demo-role-btn role-manager-btn"
              onClick={() => void handleQuickLogin("manager", "manager123")}
              disabled={busy}
            >
              <div className="role-btn-head">
                <UserCog size={16} aria-hidden="true" />
                <strong>Manager</strong>
              </div>
              <span className="role-desc">Floor Slots, Pricing Tiers & Personnel</span>
              <span className="demo-creds">manager / manager123</span>
            </button>

            <button
              type="button"
              className="demo-role-btn role-biller-btn"
              onClick={() => void handleQuickLogin("biller", "biller123")}
              disabled={busy}
            >
              <div className="role-btn-head">
                <Receipt size={16} aria-hidden="true" />
                <strong>Biller</strong>
              </div>
              <span className="role-desc">Slot Allotment, QR Passes & Departure</span>
              <span className="demo-creds">biller / biller123</span>
            </button>

            <button
              type="button"
              className="demo-role-btn role-guard-btn"
              onClick={() => void handleQuickLogin("guard", "guard123")}
              disabled={busy}
            >
              <div className="role-btn-head">
                <ShieldAlert size={16} aria-hidden="true" />
                <strong>Security Guard</strong>
              </div>
              <span className="role-desc">Personal Duty Timetable & Salary</span>
              <span className="demo-creds">guard / guard123</span>
            </button>
          </div>
        </div>

        {/* Public Driver / Guest Access */}
        <div className="guest-access-footer">
          <button
            type="button"
            className="guest-link-btn"
            onClick={onContinueAsGuest}
            disabled={busy}
          >
            <span>Continue as Public Driver / Guest View</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
