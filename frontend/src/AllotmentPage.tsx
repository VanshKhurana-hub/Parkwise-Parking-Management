import { Check, ChevronDown, Plus, QrCode, Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import { LicensePlateInput } from "./LicensePlateInput";
import { QRTicketPass } from "./QRModule";
import type { Spot, Ticket, VehicleType } from "./types";

interface AllotmentPageProps {
  spots: Spot[];
  onRefreshSpots: () => Promise<void>;
  onNotify: (text: string, error?: boolean) => void;
}

export function AllotmentPage({ spots, onRefreshSpots, onNotify }: AllotmentPageProps) {
  const [vehicleType, setVehicleType] = useState<VehicleType>("standard");
  const [licensePlate, setLicensePlate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [spotId, setSpotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [recommendedSpot, setRecommendedSpot] = useState("");
  const [generatedTicket, setGeneratedTicket] = useState<Ticket | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [slotFilter, setSlotFilter] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableSpots = spots.filter(
    (spot) => spot.status === "available" && spot.spot_type === vehicleType,
  );

  const selectedSpot = availableSpots.find((s) => s.id === spotId);
  const filteredSpots = availableSpots.filter((s) => {
    if (!slotFilter.trim()) return true;
    const q = slotFilter.toLowerCase();
    return (
      s.id.toLowerCase().includes(q) ||
      (s.floor && s.floor.toLowerCase().includes(q)) ||
      (s.zone && s.zone.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    let current = true;
    void api.recommendation(vehicleType).then(
      (recommendation) => {
        if (!current) return;
        setRecommendedSpot(recommendation.spot_id);
        setSpotId(recommendation.spot_id);
      },
      () => {
        if (current) {
          setRecommendedSpot("");
          setSpotId("");
        }
      },
    );
    return () => {
      current = false;
    };
  }, [vehicleType, spots]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!licensePlate.trim()) {
      onNotify("Please enter a valid license plate.", true);
      return;
    }

    setBusy(true);
    try {
      const ticket = await api.checkIn({
        license_plate: licensePlate.trim().toUpperCase(),
        vehicle_type: vehicleType,
        phone_number: phoneNumber.trim(),
        ...(spotId ? { spot_id: spotId } : {}),
      });

      setGeneratedTicket(ticket);
      onNotify(`Slot ${ticket.spot_id} successfully allotted to ${ticket.license_plate}. QR Pass generated.`, false);
      setLicensePlate("");
      setPhoneNumber("");
      await onRefreshSpots();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Slot allotment failed.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="allotment-page-container" aria-labelledby="allotment-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <QrCode size={14} aria-hidden="true" />
            <span>OPERATIONAL ALLOTMENT &bull; TOUCHLESS QR</span>
          </div>
          <h2 id="allotment-title" className="section-title">
            Vehicle Allotment & QR Gate Pass Generator
          </h2>
          <p className="muted">
            Strict RegEx validation for standardized car registration and instant QR code gate pass issuance.
          </p>
        </div>
      </div>

      <div className="allotment-grid">
        {/* Form Panel */}
        <article className="allotment-form-panel">
          <form onSubmit={handleSubmit} className="allotment-form">
            {/* Strict RegEx License Plate Field */}
            <LicensePlateInput
              value={licensePlate}
              onChange={setLicensePlate}
              required
              disabled={busy}
            />

            <div className="form-row-2">
              <div>
                <label htmlFor="allot-vtype">Vehicle Category</label>
                <select
                  id="allot-vtype"
                  value={vehicleType}
                  onChange={(e) => {
                    setVehicleType(e.target.value as VehicleType);
                    setSpotId("");
                  }}
                  disabled={busy}
                >
                  <option value="standard">Standard Car</option>
                  <option value="ev">EV Fast Charging Bay</option>
                  <option value="accessible">Accessible Priority Slot</option>
                </select>
              </div>

              <div>
                <label htmlFor="allot-phone">Driver Contact Phone</label>
                <input
                  id="allot-phone"
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="slot-select-field-group" ref={dropdownRef}>
              <div className="slot-select-header-label">
                <label id="allot-spot-label" htmlFor="allot-spot-trigger">
                  Assigned Parking Spot
                </label>
                <span className="available-count-tag">
                  {availableSpots.length} slot{availableSpots.length === 1 ? "" : "s"} available
                </span>
              </div>

              {/* High-Visibility Custom Slot Dropdown */}
              <div className="slot-picker-container">
                <button
                  type="button"
                  id="allot-spot-trigger"
                  className={`slot-picker-trigger ${dropdownOpen ? "open" : ""}`}
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  disabled={busy || availableSpots.length === 0}
                  aria-haspopup="listbox"
                  aria-expanded={dropdownOpen}
                  aria-labelledby="allot-spot-label"
                >
                  <div className="slot-picker-value">
                    {spotId ? (
                      selectedSpot ? (
                        <>
                          <span className="slot-pill-tag">{selectedSpot.floor}</span>
                          <span className="slot-id-text">Slot {selectedSpot.id}</span>
                          <span className="slot-zone-muted">({selectedSpot.zone})</span>
                          {selectedSpot.id === recommendedSpot && (
                            <span className="slot-badge-recommended">
                              <Sparkles size={12} aria-hidden="true" />
                              <span>Closest Recommended</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span>Slot {spotId}</span>
                      )
                    ) : (
                      <>
                        <Sparkles size={16} className="sparkle-icon-accent" aria-hidden="true" />
                        <span>-- Automatically assign recommended slot --</span>
                        {recommendedSpot && (
                          <span className="slot-badge-recommended">
                            Slot {recommendedSpot}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <ChevronDown
                    size={18}
                    className={`dropdown-chevron ${dropdownOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>

                {/* Visible Dropdown Popover with Guaranteed Dark/Light Contrast */}
                {dropdownOpen && (
                  <div className="slot-picker-popover" role="listbox">
                    <div className="slot-picker-search-box">
                      <div className="search-input-wrap">
                        <Search size={14} className="search-box-icon" aria-hidden="true" />
                        <input
                          type="text"
                          placeholder="Filter by Slot ID (A-01), Floor, or Zone..."
                          value={slotFilter}
                          onChange={(e) => setSlotFilter(e.target.value)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        {slotFilter && (
                          <button
                            type="button"
                            className="clear-filter-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSlotFilter("");
                            }}
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="slot-picker-list">
                      {/* Default Auto-Assign Option */}
                      <button
                        type="button"
                        role="option"
                        aria-selected={!spotId}
                        className={`slot-picker-item ${!spotId ? "selected" : ""}`}
                        onClick={() => {
                          setSpotId("");
                          setDropdownOpen(false);
                          setSlotFilter("");
                        }}
                      >
                        <div className="slot-item-info">
                          <Sparkles size={15} className="sparkle-icon-accent" aria-hidden="true" />
                          <div>
                            <div className="slot-item-title">
                              Automatic Recommendation
                            </div>
                            <div className="slot-item-subtitle">
                              {recommendedSpot
                                ? `System assigns closest available slot (${recommendedSpot})`
                                : "Closest available bay based on entrance proximity"}
                            </div>
                          </div>
                        </div>
                        {!spotId && <Check size={16} className="selected-check-icon" aria-hidden="true" />}
                      </button>

                      {/* Filtered Slots */}
                      {filteredSpots.map((spot) => {
                        const isSelected = spotId === spot.id;
                        const isRec = spot.id === recommendedSpot;
                        return (
                          <button
                            key={spot.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`slot-picker-item ${isSelected ? "selected" : ""} ${isRec ? "is-recommended" : ""}`}
                            onClick={() => {
                              setSpotId(spot.id);
                              setDropdownOpen(false);
                              setSlotFilter("");
                            }}
                          >
                            <div className="slot-item-info">
                              <span className="slot-pill-tag">{spot.floor}</span>
                              <strong className="slot-item-id">{spot.id}</strong>
                              <span className="slot-item-zone">({spot.zone})</span>
                              {isRec && (
                                <span className="slot-badge-recommended">
                                  <Sparkles size={11} aria-hidden="true" />
                                  <span>Closest Recommended</span>
                                </span>
                              )}
                            </div>
                            {isSelected && <Check size={16} className="selected-check-icon" aria-hidden="true" />}
                          </button>
                        );
                      })}

                      {filteredSpots.length === 0 && (
                        <div className="slot-picker-empty">
                          No available parking slots match "{slotFilter}".
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Synchronized hidden native select for automated accessibility & programmatic access */}
              <select
                id="allot-spot"
                value={spotId}
                onChange={(e) => setSpotId(e.target.value)}
                disabled={busy}
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
              >
                <option value="">-- Automatically assign recommended slot --</option>
                {availableSpots.map((spot) => (
                  <option key={spot.id} value={spot.id}>
                    {spot.floor} &bull; {spot.id} ({spot.zone})
                    {spot.id === recommendedSpot ? " — [Closest Recommended]" : ""}
                  </option>
                ))}
              </select>

              <p className="field-hint">
                {recommendedSpot
                  ? `Automated Recommendation: Slot ${recommendedSpot} is the closest available.`
                  : "No available spots remain for this vehicle type."}
              </p>
            </div>

            <button
              type="submit"
              className="button button-primary allot-submit-btn"
              disabled={busy || (!recommendedSpot && availableSpots.length === 0)}
            >
              {busy ? (
                "Processing Allotment..."
              ) : (
                <>
                  <Plus size={18} aria-hidden="true" />
                  <span>Allot Spot & Generate QR Gate Pass</span>
                </>
              )}
            </button>
          </form>
        </article>

        {/* Generated QR Pass Preview Column */}
        <aside className="allotment-preview-panel">
          {generatedTicket ? (
            <div className="active-qr-pass-wrapper">
              <div className="pass-success-banner">
                <Check size={16} aria-hidden="true" />
                <span>Gate Pass Issued Successfully</span>
              </div>
              <QRTicketPass ticket={generatedTicket} />
            </div>
          ) : (
            <div className="qr-pass-placeholder">
              <QrCode size={64} className="placeholder-icon" aria-hidden="true" />
              <h3>Digital QR Gate Pass</h3>
              <p className="muted">
                Complete vehicle allotment to generate a touchless digital QR pass with floor allocation and timestamp.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
