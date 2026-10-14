import { LogIn, ShieldAlert, User, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useAuth } from "./AuthContext";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setUsername("");
      setPassword("");
      // Focus the first input on open
      const timeout = window.setTimeout(() => {
        usernameRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timeout);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please check your credentials.");
      usernameRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Tab") {
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
  }

  function fillPreset(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    setError(null);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal auth-modal"
        id="login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        aria-describedby="login-desc"
        onKeyDown={handleKeyDown}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">ACCESS CONTROL</p>
            <h2 id="login-title">Staff Sign In</h2>
            <p id="login-desc" className="muted">
              Authenticate to access role-protected features such as vehicle checkout and facility management.
            </p>
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label="Close sign in modal"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="login-error" role="alert" aria-live="polite">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form className="modal-form" onSubmit={(e) => void handleSubmit(e)}>
          <label htmlFor="auth-username">
            Username <span className="required-star" aria-hidden="true">*</span>
          </label>
          <input
            ref={usernameRef}
            id="auth-username"
            name="username"
            type="text"
            required
            autoComplete="username"
            placeholder="e.g. admin or attendant"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
          />

          <label htmlFor="auth-password">
            Password <span className="required-star" aria-hidden="true">*</span>
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />

          <div className="role-presets" aria-label="Demo role credentials">
            <p className="presets-label">
              <User size={14} aria-hidden="true" /> Quick Demo Credentials:
            </p>
            <div className="preset-buttons">
              <button
                type="button"
                className="button button-small preset-btn"
                onClick={() => fillPreset("admin", "admin123")}
                title="Fill Admin demo credentials"
              >
                Admin (Full Access)
              </button>
              <button
                type="button"
                className="button button-small preset-btn"
                onClick={() => fillPreset("attendant", "attendant123")}
                title="Fill Attendant demo credentials"
              >
                Attendant (Checkout)
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy ? (
                "Signing In…"
              ) : (
                <>
                  <LogIn size={18} aria-hidden="true" /> Sign In
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

