import {
  Accessibility,
  AlertTriangle,
  Building2,
  CarFront,
  CheckCircle2,
  Filter,
  Layers,
  PlugZap,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "./api";
import type { Spot, SpotStatus, UserRole, VehicleType } from "./types";

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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [busySpotId, setBusySpotId] = useState<string | null>(null);

  // New Spot Form State
  const [newSpotId, setNewSpotId] = useState("");
  const [newFloor, setNewFloor] = useState("Floor 1");
  const [newZone, setNewZone] = useState("Zone A");
  const [newType, setNewType] = useState<VehicleType>("standard");
  const [newRow, setNewRow] = useState(1);
  const [newCol, setNewCol] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Unique floors list
  const floors = useMemo(() => {
    const list = Array.from(new Set(spots.map((s) => s.floor || "Floor 1"))).sort();
    return list;
  }, [spots]);

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
    const targetSpots = selectedFloor === "all" ? spots : spots.filter((s) => (s.floor || "Floor 1") === selectedFloor);
    const total = targetSpots.length;
    const available = targetSpots.filter((s) => s.status === "available").length;
    const occupied = targetSpots.filter((s) => s.status === "occupied").length;
    const reserved = targetSpots.filter((s) => s.status === "reserved").length;
    const maintenance = targetSpots.filter((s) => s.status === "maintenance").length;
    const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { total, available, occupied, reserved, maintenance, percent };
  }, [spots, selectedFloor]);

  async function handleStatusChange(spot: Spot, newStatus: SpotStatus) {
    if (role !== "manager" && role !== "admin") {
      onNotify("Manager authority required to configure slot status.", true);
      return;
    }
    if (spot.status === "occupied" && newStatus !== "occupied") {
      onNotify(`Spot ${spot.id} is occupied by vehicle ${spot.license_plate}. Check out first.`, true);
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

    setSubmitting(true);
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
      setIsAddModalOpen(false);
      setNewSpotId("");
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to create slot.", true);
    } finally {
      setSubmitting(false);
    }
  }

  const isAuthorized = role === "manager" || role === "admin";

  return (
    <section className="floor-slot-manager" aria-labelledby="floor-mgr-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <Building2 size={14} aria-hidden="true" />
            <span>FACILITY INFRASTRUCTURE</span>
          </div>
          <h2 id="floor-mgr-title" className="section-title">
            Floor-Wise Slot Management
          </h2>
          <p className="muted">
            Configure multi-level parking decks, control maintenance locks, and adjust operational slot availability.
          </p>
        </div>

        {isAuthorized && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => setIsAddModalOpen(true)}
            title="Add a new slot to any floor"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Add Slot to Floor</span>
          </button>
        )}
      </div>

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
        {floors.map((floor) => {
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
          <span className="filter-label">Status:</span>
          {(["all", "available", "occupied", "reserved", "maintenance"] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-chip ${statusFilter === st ? "active" : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st[0].toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-label">Vehicle Type:</span>
          {(["all", "standard", "ev", "accessible"] as const).map((tp) => (
            <button
              key={tp}
              type="button"
              className={`filter-chip ${typeFilter === tp ? "active" : ""}`}
              onClick={() => setTypeFilter(tp)}
            >
              {tp === "ev" ? "EV Charging" : tp[0].toUpperCase() + tp.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Slots Floor Grid */}
      <div className="floor-grid-container">
        {filteredSpots.length === 0 ? (
          <div className="empty-state">No parking slots match the selected floor and filters.</div>
        ) : (
          <div className="interactive-slots-grid">
            {filteredSpots.map((spot) => {
              const isBusy = busySpotId === spot.id;
              const Icon = spot.spot_type === "ev" ? PlugZap : spot.spot_type === "accessible" ? Accessibility : CarFront;

              return (
                <div
                  key={spot.id}
                  className={`floor-slot-card slot-${spot.status} ${isBusy ? "busy" : ""}`}
                >
                  <div className="slot-card-top">
                    <span className="slot-id-badge">{spot.id}</span>
                    <span className="slot-floor-tag">{spot.floor || "Floor 1"}</span>
                    <Icon size={16} className="slot-type-icon" aria-hidden="true" />
                  </div>

                  <div className="slot-card-body">
                    <span className={`status-pill pill-${spot.status}`}>
                      {spot.status[0].toUpperCase() + spot.status.slice(1)}
                    </span>
                    {spot.license_plate && (
                      <span className="slot-plate-text">{spot.license_plate}</span>
                    )}
                    <span className="slot-zone-sub">
                      {spot.zone} &bull; R{spot.row} C{spot.column}
                    </span>
                  </div>

                  {/* Manager Control Actions */}
                  {isAuthorized && (
                    <div className="slot-manager-actions">
                      {spot.status !== "available" && spot.status !== "occupied" && (
                        <button
                          type="button"
                          className="action-btn unlock"
                          onClick={() => handleStatusChange(spot, "available")}
                          title="Set to Available"
                          disabled={isBusy}
                        >
                          <CheckCircle2 size={13} aria-hidden="true" />
                          <span>Enable</span>
                        </button>
                      )}
                      {spot.status !== "maintenance" && spot.status !== "occupied" && (
                        <button
                          type="button"
                          className="action-btn maintenance"
                          onClick={() => handleStatusChange(spot, "maintenance")}
                          title="Mark for Maintenance"
                          disabled={isBusy}
                        >
                          <Wrench size={13} aria-hidden="true" />
                          <span>Maint</span>
                        </button>
                      )}
                      {spot.status !== "reserved" && spot.status !== "occupied" && (
                        <button
                          type="button"
                          className="action-btn reserve"
                          onClick={() => handleStatusChange(spot, "reserved")}
                          title="Reserve Slot"
                          disabled={isBusy}
                        >
                          <AlertTriangle size={13} aria-hidden="true" />
                          <span>Reserve</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Biller / Driver Quick Select */}
                  {onSelectSpot && spot.status === "available" && (
                    <button
                      type="button"
                      className="button button-small select-slot-btn"
                      onClick={() => onSelectSpot(spot)}
                    >
                      Allot Slot
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manager Add Slot Modal */}
      {isAddModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-slot-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">FACILITY MANAGER</p>
                <h2 id="add-slot-title">Add Floor-Wise Parking Slot</h2>
                <p className="muted">Specify the floor, zone, vehicle compatibility, and grid location.</p>
              </div>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
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
                  <select id="slot-floor" value={newFloor} onChange={(e) => setNewFloor(e.target.value)}>
                    <option value="Floor 1">Floor 1 (Ground)</option>
                    <option value="Floor 2">Floor 2 (EV Deck)</option>
                    <option value="Floor 3">Floor 3 (VIP & Accessible)</option>
                    <option value="Floor 4">Floor 4 (Rooftop)</option>
                    <option value="Basement 1">Basement 1</option>
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
              <select id="slot-type" value={newType} onChange={(e) => setNewType(e.target.value as VehicleType)}>
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
                    onChange={(e) => setNewRow(parseInt(e.target.value) || 1)}
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
                    onChange={(e) => setNewCol(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="button button-outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? "Adding..." : "Add Parking Spot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
