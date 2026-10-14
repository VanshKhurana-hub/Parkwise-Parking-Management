import { Plus, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { api } from "./api";
import type { Spot, VehicleType } from "./types";

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (spot: Spot) => void;
  onError: (message: string) => void;
}

export function AddSpotModal({ isOpen, onClose, onSuccess, onError }: AddSpotModalProps) {
  const [spotId, setSpotId] = useState("");
  const [zone, setZone] = useState("Zone A");
  const [spotType, setSpotType] = useState<VehicleType>("standard");
  const [row, setRow] = useState(1);
  const [column, setColumn] = useState(1);
  const [busy, setBusy] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSpotId("");
      setRow(1);
      setColumn(1);
      const timeout = window.setTimeout(() => idRef.current?.focus(), 50);
      return () => window.clearTimeout(timeout);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!spotId.trim()) {
      onError("Please enter a valid spot ID.");
      return;
    }

    setBusy(true);
    try {
      const created = await api.createSpot({
        id: spotId.trim().toUpperCase(),
        zone: zone.trim(),
        spot_type: spotType,
        row: Number(row),
        column: Number(column),
      });
      onSuccess(created);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create parking spot.");
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
        className="modal"
        id="add-spot-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-spot-title"
        aria-describedby="add-spot-desc"
        onKeyDown={handleKeyDown}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">ADMINISTRATION</p>
            <h2 id="add-spot-title">Add Parking Spot</h2>
            <p id="add-spot-desc" className="muted">
              Configure and register a new parking space in the facility layout.
            </p>
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label="Close add spot dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={(e) => void handleSubmit(e)}>
          <label htmlFor="spot-id-input">
            Spot Identifier (ID) <span className="required-star" aria-hidden="true">*</span>
          </label>
          <input
            ref={idRef}
            id="spot-id-input"
            type="text"
            required
            maxLength={12}
            placeholder="e.g. A-13 or B-09"
            value={spotId}
            onChange={(e) => setSpotId(e.target.value.toUpperCase())}
            disabled={busy}
          />

          <label htmlFor="spot-zone-select">Facility Zone</label>
          <select
            id="spot-zone-select"
            value={zone}
            onChange={(e) => {
              const nextZone = e.target.value;
              setZone(nextZone);
              if (nextZone === "Zone A") setSpotType("standard");
              else if (nextZone === "Zone B") setSpotType("ev");
              else if (nextZone === "Zone C") setSpotType("accessible");
            }}
            disabled={busy}
          >
            <option value="Zone A">Zone A (Standard)</option>
            <option value="Zone B">Zone B (EV Charging)</option>
            <option value="Zone C">Zone C (Accessible)</option>
          </select>

          <label htmlFor="spot-type-select">Spot Classification</label>
          <select
            id="spot-type-select"
            value={spotType}
            onChange={(e) => setSpotType(e.target.value as VehicleType)}
            disabled={busy}
          >
            <option value="standard">Standard</option>
            <option value="ev">EV charging</option>
            <option value="accessible">Accessible</option>
          </select>

          <div className="form-row-2col">
            <div>
              <label htmlFor="spot-row-input">Grid Row</label>
              <input
                id="spot-row-input"
                type="number"
                min={1}
                max={50}
                required
                value={row}
                onChange={(e) => setRow(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="spot-column-input">Grid Column</label>
              <input
                id="spot-column-input"
                type="number"
                min={1}
                max={50}
                required
                value={column}
                onChange={(e) => setColumn(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={busy}
              />
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
              disabled={busy || !spotId.trim()}
            >
              {busy ? (
                "Creating…"
              ) : (
                <>
                  <Plus size={18} aria-hidden="true" /> Add Spot
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

