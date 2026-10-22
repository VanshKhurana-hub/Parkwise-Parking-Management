import { Save, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { api } from "./api";
import type { HourlyRates } from "./types";

interface EditRatesModalProps {
  isOpen: boolean;
  currentRates: HourlyRates;
  onClose: () => void;
  onSuccess: (updated: HourlyRates) => void;
  onError: (message: string) => void;
}

export function EditRatesModal({
  isOpen,
  currentRates,
  onClose,
  onSuccess,
  onError,
}: EditRatesModalProps) {
  const [standard, setStandard] = useState(currentRates.standard.toString());
  const [ev, setEv] = useState(currentRates.ev.toString());
  const [accessible, setAccessible] = useState(currentRates.accessible.toString());
  const [busy, setBusy] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStandard(currentRates.standard.toString());
      setEv(currentRates.ev.toString());
      setAccessible(currentRates.accessible.toString());
      const timeout = window.setTimeout(() => firstInputRef.current?.focus(), 50);
      return () => window.clearTimeout(timeout);
    }
  }, [isOpen, currentRates]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const standardNum = parseFloat(standard);
    const evNum = parseFloat(ev);
    const accessibleNum = parseFloat(accessible);

    if (
      isNaN(standardNum) ||
      isNaN(evNum) ||
      isNaN(accessibleNum) ||
      standardNum <= 0 ||
      evNum <= 0 ||
      accessibleNum <= 0
    ) {
      onError("Please enter valid positive hourly rates in Indian Rupees.");
      return;
    }

    setBusy(true);
    try {
      const updated = await api.updateRates({
        standard: standardNum,
        ev: evNum,
        accessible: accessibleNum,
      });
      onSuccess(updated);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update hourly parking rates.");
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

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal edit-rates-modal"
        id="edit-rates-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-rates-title"
        aria-describedby="edit-rates-desc"
        onKeyDown={handleKeyDown}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">TARIFF MANAGEMENT &bull; ADMIN ONLY</p>
            <h2 id="edit-rates-title">Update Ticket Pricing (INR ₹)</h2>
            <p id="edit-rates-desc" className="muted">
              Configure base hourly parking rates charged during vehicle checkout.
            </p>
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label="Close edit rates dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={(e) => void handleSubmit(e)}>
          <label htmlFor="rate-standard">
            Standard Vehicle Rate (₹ / hour) <span className="required-star" aria-hidden="true">*</span>
          </label>
          <div className="currency-input-wrapper">
            <span className="currency-prefix" aria-hidden="true">₹</span>
            <input
              ref={firstInputRef}
              id="rate-standard"
              type="number"
              step="0.5"
              min="1"
              max="10000"
              required
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
              disabled={busy}
              placeholder="40"
            />
          </div>

          <label htmlFor="rate-ev">
            EV Charging Rate (₹ / hour) <span className="required-star" aria-hidden="true">*</span>
          </label>
          <div className="currency-input-wrapper">
            <span className="currency-prefix" aria-hidden="true">₹</span>
            <input
              id="rate-ev"
              type="number"
              step="0.5"
              min="1"
              max="10000"
              required
              value={ev}
              onChange={(e) => setEv(e.target.value)}
              disabled={busy}
              placeholder="70"
            />
          </div>

          <label htmlFor="rate-accessible">
            Accessible Spot Rate (₹ / hour) <span className="required-star" aria-hidden="true">*</span>
          </label>
          <div className="currency-input-wrapper">
            <span className="currency-prefix" aria-hidden="true">₹</span>
            <input
              id="rate-accessible"
              type="number"
              step="0.5"
              min="1"
              max="10000"
              required
              value={accessible}
              onChange={(e) => setAccessible(e.target.value)}
              disabled={busy}
              placeholder="30"
            />
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
                "Saving…"
              ) : (
                <>
                  <Save size={18} aria-hidden="true" /> Save Rates
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

