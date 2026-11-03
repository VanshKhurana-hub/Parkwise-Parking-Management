import {
  Accessibility,
  AlertTriangle,
  Building2,
  CarFront,
  CheckCircle2,
  Filter,
  Layers,
  Minus,
  PlugZap,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { FloorInfo, Spot, SpotStatus, UserRole, VehicleType } from "./types";

interface FloorSlotManagerProps {
  spots: Spot[];
  role: UserRole;
  onRefresh: () => Promise<void>;
  onSelectSpot?: (spot: Spot) => void;
  onNotify: (text: string, error?: boolean) => void;
}

export function FloorSlotManager({
  spots,
  role,
  onRefresh,
  onSelectSpot,
  onNotify,
}: FloorSlotManagerProps) {
  const [selectedFloor, setSelectedFloor] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isAddSpotModalOpen, setIsAddSpotModalOpen] = useState(false);
  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [busySpotId, setBusySpotId] = useState<string | null>(null);
  const [floorActionBusy, setFloorActionBusy] = useState(false);

  // Dynamic Floor Database List
  const [facilityFloors, setFacilityFloors] = useState<FloorInfo[]>([]);

  // New Floor Form State
  const [customFloorName, setCustomFloorName] = useState("");
  const [customFloorZone, setCustomFloorZone] = useState("Zone D");
  const [customFloorType, setCustomFloorType] = useState<VehicleType>("standard");
  const [customFloorSpots, setCustomFloorSpots] = useState(8);
  const [customFloorPrefix, setCustomFloorPrefix] = useState("");

  // New Spot Form State
  const [newSpotId, setNewSpotId] = useState("");
  const [newFloor, setNewFloor] = useState("Floor 1");
  const [newZone, setNewZone] = useState("Zone A");
  const [newType, setNewType] = useState<VehicleType>("standard");
  const [newRow, setNewRow] = useState(1);
  const [newCol, setNewCol] = useState(1);
  const [submittingSpot, setSubmittingSpot] = useState(false);

  // Load floors from backend
  const loadFloors = useCallback(async () => {
    try {
      const fls = await api.floors();
      setFacilityFloors(fls);
    } catch {
      // Handled gracefully
    }
  }, []);

  useEffect(() => {
    void loadFloors();
  }, [loadFloors, spots]);

  // Distinct floor names (synced between backend floor table and spots)
  const floorNames = useMemo(() => {
    const fromSpots = spots.map((s) => s.floor || "Floor 1");
    const fromDb = facilityFloors.map((f) => f.name);
    const combined = Array.from(new Set([...fromDb, ...fromSpots]));
    // Custom sort: try sorting by level number or name
    return combined.sort((a, b) => {
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      if (matchA && matchB) {
        return parseInt(matchA[0], 10) - parseInt(matchB[0], 10);
      }
      return a.localeCompare(b);
    });
  }, [spots, facilityFloors]);

  // Set default new floor when floor list changes
  useEffect(() => {
    if (floorNames.length > 0 && !floorNames.includes(newFloor)) {
      setNewFloor(floorNames[0]);
    }
  }, [floorNames, newFloor]);

  // Filtered spots
  const filteredSpots = useMemo(() => {
    return spots.filter((spot) => {
      const matchFloor = selectedFloor === "all" || (spot.floor || "Floor 1") === selectedFloor;
      const matchStatus = statusFilter === "all" || spot.status === statusFilter;
      const matchType = typeFilter === "all" || spot.spot_type === typeFilter;
      return matchFloor && matchStatus && matchType;
    });
  }, [spots, selectedFloor, statusFilter, typeFilter]);

  // Floor stats
  const floorStats = useMemo(() => {
    const targetSpots =
      selectedFloor === "all"
        ? spots
        : spots.filter((s) => (s.floor || "Floor 1") === selectedFloor);
    const total = targetSpots.length;
    const available = targetSpots.filter((s) => s.status === "available").length;
    const occupied = targetSpots.filter((s) => s.status === "occupied").length;
    const reserved = targetSpots.filter((s) => s.status === "reserved").length;
    const maintenance = targetSpots.filter((s) => s.status === "maintenance").length;
    const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { total, available, occupied, reserved, maintenance, percent };
  }, [spots, selectedFloor]);

  const isAuthorized = role === "manager" || role === "admin";
  const isBiller = role === "biller" || role === "attendant";
  const isGuard = role === "security_guard";
  const canAllot = isBiller; // Slot allotment / booking permission is only for billers

  // --- Dynamic Floor Actions ---

  async function handleQuickAddNextFloor() {
    if (!isAuthorized) return;
    setFloorActionBusy(true);
    try {
      const currentCount = floorNames.length;
      const target = currentCount + 1;
      const updated = await api.scaleFloors({ target_floors: target, spots_per_new_floor: 8 });
      setFacilityFloors(updated);
      await onRefresh();
      setSelectedFloor(`Floor ${target}`);
      onNotify(`Floor ${target} dynamically deployed with 8 initial parking slots.`, false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to add floor.", true);
    } finally {
      setFloorActionBusy(false);
    }
  }

  async function handleQuickRemoveTopFloor() {
    if (!isAuthorized) return;
    if (floorNames.length <= 1) {
      onNotify("Facility must have at least one active parking floor.", true);
      return;
    }
    const topFloorName = floorNames[floorNames.length - 1];
    const occupiedOnTop = spots.filter(
      (s) => (s.floor || "Floor 1") === topFloorName && s.status === "occupied",
    ).length;
    if (occupiedOnTop > 0) {
      onNotify(
        `Cannot remove ${topFloorName}: ${occupiedOnTop} vehicle(s) currently parked. Check out vehicles first.`,
        true,
      );
      return;
    }

    setFloorActionBusy(true);
    try {
      await api.deleteFloor(topFloorName);
      await loadFloors();
      await onRefresh();
      setSelectedFloor("all");
      onNotify(`${topFloorName} removed successfully from facility.`, false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to remove floor.", true);
    } finally {
      setFloorActionBusy(false);
    }
  }

  async function handleAddCustomFloorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customFloorName.trim()) {
      onNotify("Please provide a name for the floor.", true);
      return;
    }
    setFloorActionBusy(true);
    try {
      const updated = await api.addFloor({
        name: customFloorName.trim(),
        default_zone: customFloorZone.trim() || "Zone A",
        spot_type: customFloorType,
        initial_spots_count: customFloorSpots,
        spot_prefix: customFloorPrefix.trim().toUpperCase() || undefined,
      });
      setFacilityFloors(updated);
      await onRefresh();
      setSelectedFloor(customFloorName.trim());
      setIsFloorModalOpen(false);
      setCustomFloorName("");
      onNotify(
        `Facility deck '${customFloorName.trim()}' successfully deployed with ${customFloorSpots} spots.`,
        false,
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to deploy custom floor.", true);
    } finally {
      setFloorActionBusy(false);
    }
  }

  async function handleDeleteSelectedFloor(floorToDelete: string) {
    if (!isAuthorized) return;
    if (floorNames.length <= 1) {
      onNotify("Cannot delete the only remaining floor.", true);
      return;
    }
    const occupied = spots.filter(
      (s) => (s.floor || "Floor 1") === floorToDelete && s.status === "occupied",
    ).length;
    if (occupied > 0) {
      onNotify(
        `Cannot delete ${floorToDelete}: ${occupied} vehicle(s) parked on this floor. Check out vehicles first.`,
        true,
      );
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to permanently delete '${floorToDelete}' and remove all its parking slots?`,
      )
    ) {
      return;
    }

    setFloorActionBusy(true);
    try {
      await api.deleteFloor(floorToDelete);
      await loadFloors();
      await onRefresh();
      setSelectedFloor("all");
      onNotify(`Floor '${floorToDelete}' and its slots removed successfully.`, false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to delete floor.", true);
    } finally {
      setFloorActionBusy(false);
    }
  }

  // --- Spot Status & Creation Actions ---

  async function handleStatusChange(spot: Spot, newStatus: SpotStatus) {
    if (!isAuthorized) {
      onNotify("Manager authority required to configure slot status.", true);
      return;
    }
    if (spot.status === "occupied" && newStatus !== "occupied") {
      onNotify(
        `Spot ${spot.id} is occupied by vehicle ${spot.license_plate}. Check out first.`,
        true,
      );
      return;
    }

    setBusySpotId(spot.id);
    try {
      await api.updateSpotStatus(spot.id, newStatus);
      onNotify(`Spot ${spot.id} status updated to ${newStatus}.`, false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to update slot status.", true);
    } finally {
      setBusySpotId(null);
    }
  }

  async function handleAddSpotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newSpotId.trim()) return;

    setSubmittingSpot(true);
    try {
      await api.createSpot({
        id: newSpotId.trim().toUpperCase(),
        floor: newFloor,
        zone: newZone,
        spot_type: newType,
        row: newRow,
        column: newCol,
      });
      onNotify(`Slot ${newSpotId} created successfully on ${newFloor}.`, false);
      setIsAddSpotModalOpen(false);
      setNewSpotId("");
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to create slot.", true);
    } finally {
      setSubmittingSpot(false);
    }
  }

  return (
    <section className="floor-slot-manager" aria-labelledby="floor-mgr-title">
      {/* Top Header */}
      <div className="section-header-row">
        <div>
          {isGuard ? (
            <>
              <div className="eyebrow-badge guard-badge">
                <ShieldAlert size={14} aria-hidden="true" />
                <span>SECURITY GUARD SURVEILLANCE &bull; READ-ONLY</span>
              </div>
              <h2 id="floor-mgr-title" className="section-title">
                Assigned Floor Status & Bay Monitor
              </h2>
              <p className="muted">
                Real-time surveillance of floor bay occupancy. Vehicle allotment and slot booking are restricted to Billers.
              </p>
            </>
          ) : (
            <>
              <div className="eyebrow-badge">
                <Building2 size={14} aria-hidden="true" />
                <span>DYNAMIC FACILITY INFRASTRUCTURE</span>
              </div>
              <h2 id="floor-mgr-title" className="section-title">
                Floor-Wise Slot Management
              </h2>
              <p className="muted">
                Dynamically scale facility decks, configure slot capacity floor-by-floor, and control maintenance locks.
              </p>
            </>
          )}
        </div>

        {isAuthorized && (
          <div className="header-actions-group">
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setCustomFloorName(`Floor ${floorNames.length + 1}`);
                setCustomFloorZone(
                  `Zone ${String.fromCharCode(65 + (floorNames.length % 26))}`,
                );
                setCustomFloorPrefix(String.fromCharCode(65 + (floorNames.length % 26)));
                setIsFloorModalOpen(true);
              }}
              title="Add a custom named deck level"
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>+ Custom Floor Deck</span>
            </button>

            <button
              type="button"
              className="button button-primary"
              onClick={() => setIsAddSpotModalOpen(true)}
              title="Add a new slot to any floor"
            >
              <Plus size={16} aria-hidden="true" />
              <span>Add Slot to Floor</span>
            </button>
          </div>
        )}
      </div>

      {/* Dynamic Facility Floors Scale Controller Banner */}
      {isAuthorized && (
        <div className="dynamic-floor-controller-banner">
          <div className="controller-info-col">
            <span className="controller-eyebrow">DYNAMIC LEVEL SCALING</span>
            <div className="controller-title-row">
              <strong className="controller-count-text">
                {floorNames.length} Floor Level{floorNames.length === 1 ? "" : "s"} Configured
              </strong>
              <span className="controller-tag">Manager Authority</span>
            </div>
          </div>

          <div className="controller-actions-row">
            <button
              type="button"
              className="button button-outline controller-btn"
              onClick={handleQuickRemoveTopFloor}
              disabled={floorActionBusy || floorNames.length <= 1}
              title={
                floorNames.length <= 1
                  ? "At least one floor is required"
                  : `Remove top floor (${floorNames[floorNames.length - 1]})`
              }
            >
              <Minus size={15} aria-hidden="true" />
              <span>Scale Down (-1 Floor)</span>
            </button>

            <button
              type="button"
              className="button button-primary controller-btn"
              onClick={handleQuickAddNextFloor}
              disabled={floorActionBusy}
              title="Quickly add the next sequential floor with 8 parking spots"
            >
              <Plus size={15} aria-hidden="true" />
              <span>Quick Add Floor (+1)</span>
            </button>
          </div>
        </div>
      )}

      {/* Floor Selection Tabs */}
      <div className="floor-tabs-bar" role="tablist" aria-label="Facility floor levels">
        <button
          type="button"
          role="tab"
          aria-selected={selectedFloor === "all"}
          className={`floor-tab ${selectedFloor === "all" ? "active" : ""}`}
          onClick={() => setSelectedFloor("all")}
        >
          <Layers size={16} aria-hidden="true" />
          <span>All Floors</span>
          <span className="count-badge">{spots.length}</span>
        </button>
        {floorNames.map((floor) => {
          const count = spots.filter((s) => (s.floor || "Floor 1") === floor).length;
          return (
            <button
              key={floor}
              type="button"
              role="tab"
              aria-selected={selectedFloor === floor}
              className={`floor-tab ${selectedFloor === floor ? "active" : ""}`}
              onClick={() => setSelectedFloor(floor)}
            >
              <Building2 size={16} aria-hidden="true" />
              <span>{floor}</span>
              <span className="count-badge">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Floor Management Toolbar */}
      {selectedFloor !== "all" && isAuthorized && (
        <div className="selected-floor-toolbar">
          <div className="floor-toolbar-info">
            <Building2 size={18} className="floor-toolbar-icon" aria-hidden="true" />
            <div>
              <strong className="floor-toolbar-title">Managing {selectedFloor}</strong>
              <span className="floor-toolbar-sub">
                {floorStats.total} slots &bull; {floorStats.occupied} occupied ({floorStats.percent}% utilized)
              </span>
            </div>
          </div>

          <button
            type="button"
            className="button button-danger delete-floor-btn"
            onClick={() => handleDeleteSelectedFloor(selectedFloor)}
            disabled={floorActionBusy || floorStats.occupied > 0 || floorNames.length <= 1}
            title={
              floorStats.occupied > 0
                ? "Cannot delete floor with occupied vehicles"
                : floorNames.length <= 1
                ? "Cannot delete the only remaining floor"
                : `Permanently delete ${selectedFloor} and remove its slots`
            }
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Delete {selectedFloor}</span>
          </button>
        </div>
      )}

      {/* Floor Metrics Bar */}
      <div className="floor-kpi-bar">
        <div className="kpi-mini">
          <span className="kpi-mini-label">Total Slots</span>
          <span className="kpi-mini-val">{floorStats.total}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini-label text-green">Available</span>
          <span className="kpi-mini-val text-green">{floorStats.available}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini-label text-purple">Occupied</span>
          <span className="kpi-mini-val text-purple">{floorStats.occupied}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini-label text-amber">Reserved</span>
          <span className="kpi-mini-val text-amber">{floorStats.reserved}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini-label text-red">Maintenance</span>
          <span className="kpi-mini-val text-red">{floorStats.maintenance}</span>
        </div>
        <div className="kpi-mini progress-mini">
          <span className="kpi-mini-label">Floor Utilization</span>
          <div className="mini-meter-track">
            <div className="mini-meter-fill" style={{ width: `${floorStats.percent}%` }} />
          </div>
          <span className="kpi-mini-val">{floorStats.percent}%</span>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="filter-controls-row">
        <div className="filter-group">
          <Filter size={15} aria-hidden="true" />
          <span className="filter-label">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div className="filter-group">
          <CarFront size={15} aria-hidden="true" />
          <span className="filter-label">Spot Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Vehicle Types</option>
            <option value="standard">Standard Car</option>
            <option value="ev">EV Charging Bay</option>
            <option value="accessible">Accessible Bay</option>
          </select>
        </div>

        <div className="filter-results-count">
          Showing <strong>{filteredSpots.length}</strong> of {spots.length} slots
        </div>
      </div>

      {/* Parking Slots Grid */}
      {filteredSpots.length === 0 ? (
        <div className="empty-slots-placeholder">
          <Building2 size={36} className="placeholder-icon" />
          <p>No parking slots match the selected floor and filters.</p>
        </div>
      ) : selectedFloor === "all" ? (
        <div className="all-floors-deck-list">
          {floorNames.map((floorName) => {
            const floorSpots = filteredSpots.filter((s) => (s.floor || "Floor 1") === floorName);
            if (floorSpots.length === 0) return null;
            const availCount = floorSpots.filter((s) => s.status === "available").length;
            return (
              <section key={floorName} className="floor-deck-section">
                <div className="floor-deck-heading">
                  <div className="deck-title-wrap">
                    <Building2 size={17} className="deck-icon" aria-hidden="true" />
                    <h3 className="deck-name">{floorName} Parking Deck</h3>
                  </div>
                  <span className="deck-count-pill">
                    {availCount} / {floorSpots.length} Bays Available
                  </span>
                </div>
                <div className="slots-deck-grid" role="grid" aria-label={`${floorName} parking bay grid`}>
                  {floorSpots.map((spot) => {
                    const isBusy = busySpotId === spot.id;
                    const canAllotThisSpot = canAllot && spot.status === "available";
                    return (
                      <article
                        key={spot.id}
                        className={`slot-card status-${spot.status} ${
                          canAllotThisSpot ? "is-allotable" : isGuard ? "guard-mode" : ""
                        }`}
                        onClick={() => {
                          if (isGuard) {
                            onNotify("Security guards have read-only monitoring access. Vehicle allotment is restricted to Billers.", true);
                            return;
                          }
                          if (canAllot) {
                            onSelectSpot?.(spot);
                          }
                        }}
                        title={
                          isGuard
                            ? `Slot ${spot.id} (${spot.status.toUpperCase()} - Read-Only Guard View)`
                            : canAllotThisSpot
                            ? `Click to open Slot ${spot.id} for vehicle allotment`
                            : spot.status === "occupied"
                            ? `Slot ${spot.id} occupied by ${spot.license_plate || "vehicle"}`
                            : `Slot ${spot.id} (${spot.status})`
                        }
                      >
                        <div className="slot-card-header">
                          <div className="slot-header-tags">
                            <span className="slot-floor-tag">{spot.floor || "Floor 1"}</span>
                            <span className="slot-zone-tag">{spot.zone}</span>
                          </div>
                          <span
                            className={`slot-type-icon type-${spot.spot_type}`}
                            title={`Type: ${
                              spot.spot_type === "ev"
                                ? "EV Charging Bay"
                                : spot.spot_type === "accessible"
                                ? "Accessible Priority Bay"
                                : "Standard Car Bay"
                            }`}
                          >
                            {spot.spot_type === "ev" ? (
                              <PlugZap size={14} />
                            ) : spot.spot_type === "accessible" ? (
                              <Accessibility size={14} />
                            ) : (
                              <CarFront size={14} />
                            )}
                          </span>
                        </div>

                        <div className="slot-card-body">
                          <div className="slot-id-row">
                            <h4 className="slot-number-title">{spot.id}</h4>
                            <span className="slot-coord-tag">
                              R{spot.row}&bull;C{spot.column}
                            </span>
                          </div>

                          <div className="slot-status-indicator">
                            <span className={`status-dot dot-${spot.status}`} />
                            <span className="status-label-text">
                              {spot.status.charAt(0).toUpperCase() + spot.status.slice(1)}
                            </span>
                          </div>

                          {spot.license_plate && (
                            <div className="slot-parked-vehicle">
                              <span className="vehicle-plate-pill">{spot.license_plate}</span>
                            </div>
                          )}
                        </div>

                        {/* Direct Click-to-Allot CTA for Available bays (Biller only) */}
                        {canAllotThisSpot && (
                          <div className="slot-allot-cta" aria-hidden="true">
                            <Plus size={12} />
                            <span>Click to Allot Bay</span>
                          </div>
                        )}
                        {isGuard && (
                          <div className="guard-readonly-tag" aria-hidden="true">
                            <span>Read-Only</span>
                          </div>
                        )}

                        {/* Quick Status Control (Manager/Admin authority) */}
                        {isAuthorized && (
                          <div className="slot-quick-actions" onClick={(e) => e.stopPropagation()}>
                            {spot.status !== "occupied" && (
                              <div className="status-toggle-pills">
                                <button
                                  type="button"
                                  className={`pill-btn ${spot.status === "available" ? "active" : ""}`}
                                  disabled={isBusy || spot.status === "available"}
                                  onClick={() => handleStatusChange(spot, "available")}
                                  title="Set available"
                                >
                                  <CheckCircle2 size={12} />
                                </button>
                                <button
                                  type="button"
                                  className={`pill-btn ${spot.status === "maintenance" ? "active" : ""}`}
                                  disabled={isBusy || spot.status === "maintenance"}
                                  onClick={() => handleStatusChange(spot, "maintenance")}
                                  title="Set under maintenance"
                                >
                                  <Wrench size={12} />
                                </button>
                                <button
                                  type="button"
                                  className={`pill-btn ${spot.status === "reserved" ? "active" : ""}`}
                                  disabled={isBusy || spot.status === "reserved"}
                                  onClick={() => handleStatusChange(spot, "reserved")}
                                  title="Set reserved"
                                >
                                  <AlertTriangle size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="slots-deck-grid" role="grid" aria-label={`${selectedFloor} parking bay grid`}>
          {filteredSpots.map((spot) => {
            const isBusy = busySpotId === spot.id;
            const canAllotThisSpot = canAllot && spot.status === "available";
            return (
              <article
                key={spot.id}
                className={`slot-card status-${spot.status} ${
                  canAllotThisSpot ? "is-allotable" : isGuard ? "guard-mode" : ""
                }`}
                onClick={() => {
                  if (isGuard) {
                    onNotify("Security guards have read-only monitoring access. Vehicle allotment is restricted to Billers.", true);
                    return;
                  }
                  if (canAllot) {
                    onSelectSpot?.(spot);
                  }
                }}
                title={
                  isGuard
                    ? `Slot ${spot.id} (${spot.status.toUpperCase()} - Read-Only Guard View)`
                    : canAllotThisSpot
                    ? `Click to open Slot ${spot.id} for vehicle allotment`
                    : spot.status === "occupied"
                    ? `Slot ${spot.id} occupied by ${spot.license_plate || "vehicle"}`
                    : `Slot ${spot.id} (${spot.status})`
                }
              >
                <div className="slot-card-header">
                  <div className="slot-header-tags">
                    <span className="slot-floor-tag">{spot.floor || "Floor 1"}</span>
                    <span className="slot-zone-tag">{spot.zone}</span>
                  </div>
                  <span
                    className={`slot-type-icon type-${spot.spot_type}`}
                    title={`Type: ${
                      spot.spot_type === "ev"
                        ? "EV Charging Bay"
                        : spot.spot_type === "accessible"
                        ? "Accessible Priority Bay"
                        : "Standard Car Bay"
                    }`}
                  >
                    {spot.spot_type === "ev" ? (
                      <PlugZap size={14} />
                    ) : spot.spot_type === "accessible" ? (
                      <Accessibility size={14} />
                    ) : (
                      <CarFront size={14} />
                    )}
                  </span>
                </div>

                <div className="slot-card-body">
                  <div className="slot-id-row">
                    <h4 className="slot-number-title">{spot.id}</h4>
                    <span className="slot-coord-tag">
                      R{spot.row}&bull;C{spot.column}
                    </span>
                  </div>

                  <div className="slot-status-indicator">
                    <span className={`status-dot dot-${spot.status}`} />
                    <span className="status-label-text">
                      {spot.status.charAt(0).toUpperCase() + spot.status.slice(1)}
                    </span>
                  </div>

                  {spot.license_plate && (
                    <div className="slot-parked-vehicle">
                      <span className="vehicle-plate-pill">{spot.license_plate}</span>
                    </div>
                  )}
                </div>

                {/* Direct Click-to-Allot CTA for Available bays (Biller only) */}
                {canAllotThisSpot && (
                  <div className="slot-allot-cta" aria-hidden="true">
                    <Plus size={12} />
                    <span>Click to Allot Bay</span>
                  </div>
                )}
                {isGuard && (
                  <div className="guard-readonly-tag" aria-hidden="true">
                    <span>Read-Only</span>
                  </div>
                )}

                {/* Quick Status Control (Manager/Admin authority) */}
                {isAuthorized && (
                  <div className="slot-quick-actions" onClick={(e) => e.stopPropagation()}>
                    {spot.status !== "occupied" && (
                      <div className="status-toggle-pills">
                        <button
                          type="button"
                          className={`pill-btn ${spot.status === "available" ? "active" : ""}`}
                          disabled={isBusy || spot.status === "available"}
                          onClick={() => handleStatusChange(spot, "available")}
                          title="Set available"
                        >
                          <CheckCircle2 size={12} />
                        </button>
                        <button
                          type="button"
                          className={`pill-btn ${spot.status === "maintenance" ? "active" : ""}`}
                          disabled={isBusy || spot.status === "maintenance"}
                          onClick={() => handleStatusChange(spot, "maintenance")}
                          title="Set under maintenance"
                        >
                          <Wrench size={12} />
                        </button>
                        <button
                          type="button"
                          className={`pill-btn ${spot.status === "reserved" ? "active" : ""}`}
                          disabled={isBusy || spot.status === "reserved"}
                          onClick={() => handleStatusChange(spot, "reserved")}
                          title="Set reserved"
                        >
                          <AlertTriangle size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Modal: Deploy Custom Floor Deck */}
      {isFloorModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-floor-modal-title"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="custom-floor-modal-title">Deploy Dynamic Facility Floor</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsFloorModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddCustomFloorSubmit} className="modal-form">
              <label htmlFor="custom-floor-name">Floor Name / Level</label>
              <input
                id="custom-floor-name"
                required
                placeholder="e.g. Floor 4, Basement 1, Rooftop Deck"
                value={customFloorName}
                onChange={(e) => setCustomFloorName(e.target.value)}
              />

              <div className="form-row-2">
                <div>
                  <label htmlFor="custom-floor-zone">Default Zone Code</label>
                  <input
                    id="custom-floor-zone"
                    required
                    placeholder="e.g. Zone D"
                    value={customFloorZone}
                    onChange={(e) => setCustomFloorZone(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="custom-floor-prefix">Spot ID Prefix</label>
                  <input
                    id="custom-floor-prefix"
                    placeholder="e.g. D or F4"
                    maxLength={5}
                    value={customFloorPrefix}
                    onChange={(e) => setCustomFloorPrefix(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div>
                  <label htmlFor="custom-floor-type">Vehicle Spot Type</label>
                  <select
                    id="custom-floor-type"
                    value={customFloorType}
                    onChange={(e) => setCustomFloorType(e.target.value as VehicleType)}
                  >
                    <option value="standard">Standard Car</option>
                    <option value="ev">EV Fast Charging Bay</option>
                    <option value="accessible">Accessible Priority Slot</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="custom-floor-spots">Initial Slot Capacity (0–30)</label>
                  <input
                    id="custom-floor-spots"
                    type="number"
                    min={0}
                    max={30}
                    value={customFloorSpots}
                    onChange={(e) =>
                      setCustomFloorSpots(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                  />
                </div>
              </div>

              <p className="field-hint">
                Deploying this floor dynamically registers the level in the facility database and generates{" "}
                <strong>{customFloorSpots}</strong> parking bays with prefix{" "}
                <strong>{customFloorPrefix || "Auto"}</strong>.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setIsFloorModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={floorActionBusy || !customFloorName.trim()}
                >
                  {floorActionBusy ? "Deploying..." : "Deploy Floor Level"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Single Slot to Floor */}
      {isAddSpotModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-spot-modal-title"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="add-spot-modal-title">Add Parking Spot to Facility</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsAddSpotModalOpen(false)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddSpotSubmit} className="modal-form">
              <label htmlFor="slot-id">Spot ID</label>
              <input
                id="slot-id"
                required
                placeholder="e.g. F1-A15 or B-09"
                value={newSpotId}
                onChange={(e) => setNewSpotId(e.target.value.toUpperCase())}
                autoComplete="off"
              />

              <div className="form-row-2">
                <div>
                  <label htmlFor="slot-floor">Floor Level</label>
                  <select
                    id="slot-floor"
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                  >
                    {floorNames.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="slot-zone">Zone</label>
                  <input
                    id="slot-zone"
                    required
                    placeholder="e.g. Zone A"
                    value={newZone}
                    onChange={(e) => setNewZone(e.target.value)}
                  />
                </div>
              </div>

              <label htmlFor="slot-type">Vehicle Type</label>
              <select
                id="slot-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as VehicleType)}
              >
                <option value="standard">Standard Car</option>
                <option value="ev">EV Charging Bay</option>
                <option value="accessible">Accessible Priority</option>
              </select>

              <div className="form-row-2">
                <div>
                  <label htmlFor="slot-row">Grid Row (1–100)</label>
                  <input
                    id="slot-row"
                    type="number"
                    min={1}
                    max={100}
                    value={newRow}
                    onChange={(e) => setNewRow(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <div>
                  <label htmlFor="slot-col">Grid Column (1–100)</label>
                  <input
                    id="slot-col"
                    type="number"
                    min={1}
                    max={100}
                    value={newCol}
                    onChange={(e) => setNewCol(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setIsAddSpotModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submittingSpot}
                >
                  {submittingSpot ? "Adding..." : "Add Parking Spot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
