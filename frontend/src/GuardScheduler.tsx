import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  Shield,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { AuthUser, GuardShift, UserRole } from "./types";

interface GuardSchedulerProps {
  role: UserRole;
  onNotify: (text: string, error?: boolean) => void;
}

export function GuardScheduler({ role, onNotify }: GuardSchedulerProps) {
  const isManager = role === "manager" || role === "admin";
  const [shifts, setShifts] = useState<GuardShift[]>([]);
  const [guards, setGuards] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [selectedGuardId, setSelectedGuardId] = useState("");
  const [shiftName, setShiftName] = useState<
    "Morning (06:00 - 14:00)" | "Evening (14:00 - 22:00)" | "Night (22:00 - 06:00)" | "General Day (09:00 - 18:00)"
  >("Morning (06:00 - 14:00)");
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");
  const [assignedLocation, setAssignedLocation] = useState("Floor 1 - Main North Entrance");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [allShifts, personnel] = await Promise.all([
        api.guardShifts(),
        api.personnel().catch(() => []),
      ]);
      setShifts(allShifts);
      const securityGuards = personnel.filter((u) => u.role === "security_guard");
      setGuards(securityGuards);
      if (securityGuards.length > 0 && !selectedGuardId) {
        setSelectedGuardId(securityGuards[0].id || "");
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to load guard shifts.", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function handleShiftTypeChange(name: typeof shiftName) {
    setShiftName(name);
    if (name === "Morning (06:00 - 14:00)") {
      setStartTime("06:00");
      setEndTime("14:00");
    } else if (name === "Evening (14:00 - 22:00)") {
      setStartTime("14:00");
      setEndTime("22:00");
    } else if (name === "Night (22:00 - 06:00)") {
      setStartTime("22:00");
      setEndTime("06:00");
    } else {
      setStartTime("09:00");
      setEndTime("18:00");
    }
  }

  async function handleAssignShift(e: React.FormEvent) {
    e.preventDefault();
    if (!isManager) {
      onNotify("Manager authority required to schedule guards.", true);
      return;
    }
    if (!selectedGuardId) {
      onNotify("Please select a security guard.", true);
      return;
    }

    setSubmitting(true);
    try {
      await api.createGuardShift({
        guard_id: selectedGuardId,
        shift_name: shiftName,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        assigned_location: assignedLocation,
        notes,
      });
      onNotify("Duty shift scheduled successfully.", false);
      setIsModalOpen(false);
      setNotes("");
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to schedule shift.", true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusUpdate(shiftId: string, newStatus: "Scheduled" | "On Duty" | "Completed" | "Cancelled") {
    if (!isManager) return;
    try {
      await api.updateGuardShift(shiftId, { status: newStatus });
      onNotify(`Shift status updated to ${newStatus}.`, false);
      await loadData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to update shift.", true);
    }
  }

  return (
    <section className="guard-scheduler-module" aria-labelledby="guard-sched-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <Shield size={14} aria-hidden="true" />
            <span>OPERATIONAL SECURITY ROSTER</span>
          </div>
          <h2 id="guard-sched-title" className="section-title">
            Security Guard Duty Scheduling
          </h2>
          <p className="muted">
            Assign shift timings, track floor duty assignments, and manage security guard rotas across facility levels.
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => setIsModalOpen(true)}
            title="Schedule a security guard shift"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Assign New Duty Shift</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading duty shifts roster...</div>
      ) : shifts.length === 0 ? (
        <div className="empty-state">No guard shifts currently scheduled. Click 'Assign New Duty Shift' to create one.</div>
      ) : (
        <div className="shifts-table-container">
          <table className="shifts-table" aria-label="Guard Duty Shifts">
            <thead>
              <tr>
                <th>Security Officer</th>
                <th>Shift Date</th>
                <th>Shift Timing</th>
                <th>Assigned Facility Location</th>
                <th>Status</th>
                <th>Duty Instructions</th>
                {isManager && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id} className={`shift-row status-${shift.status.toLowerCase().replace(" ", "-")}`}>
                  <td>
                    <div className="guard-name-cell">
                      <User size={15} aria-hidden="true" />
                      <strong>{shift.guard_name}</strong>
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      <Calendar size={14} aria-hidden="true" />
                      <span>{shift.shift_date}</span>
                    </div>
                  </td>
                  <td>
                    <div className="timing-cell">
                      <Clock size={14} aria-hidden="true" />
                      <span>{shift.start_time} – {shift.end_time}</span>
                      <small className="shift-sub-name">{shift.shift_name.split(" ")[0]}</small>
                    </div>
                  </td>
                  <td>
                    <div className="location-cell">
                      <MapPin size={14} aria-hidden="true" />
                      <span>{shift.assigned_location}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge badge-${shift.status.toLowerCase().replace(" ", "-")}`}>
                      {shift.status}
                    </span>
                  </td>
                  <td className="notes-cell">
                    <span>{shift.notes || "Standard facility surveillance & assistance."}</span>
                  </td>
                  {isManager && (
                    <td>
                      <div className="shift-actions">
                        {shift.status !== "On Duty" && shift.status !== "Completed" && (
                          <button
                            type="button"
                            className="button button-small action-pill on-duty"
                            onClick={() => handleStatusUpdate(shift.id, "On Duty")}
                            title="Mark guard On Duty"
                          >
                            Mark On Duty
                          </button>
                        )}
                        {shift.status === "On Duty" && (
                          <button
                            type="button"
                            className="button button-small action-pill complete"
                            onClick={() => handleStatusUpdate(shift.id, "Completed")}
                            title="Mark shift Completed"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Shift Modal */}
      {isModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="assign-shift-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">GUARD SCHEDULING</p>
                <h2 id="assign-shift-title">Assign Duty Shift</h2>
                <p className="muted">Select guard, shift timing, date, and assigned parking location.</p>
              </div>
              <button
                type="button"
                className="icon-button close-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignShift} className="modal-form">
              <label htmlFor="guard-select">Security Officer</label>
              <select
                id="guard-select"
                required
                value={selectedGuardId}
                onChange={(e) => setSelectedGuardId(e.target.value)}
              >
                <option value="">-- Select Guard --</option>
                {guards.map((g) => (
                  <option key={g.id || g.username} value={g.id || g.username}>
                    {g.full_name} (@{g.username})
                  </option>
                ))}
              </select>

              <div className="form-row-2">
                <div>
                  <label htmlFor="shift-name-sel">Shift Type</label>
                  <select
                    id="shift-name-sel"
                    value={shiftName}
                    onChange={(e) => handleShiftTypeChange(e.target.value as typeof shiftName)}
                  >
                    <option value="Morning (06:00 - 14:00)">Morning (06:00 – 14:00)</option>
                    <option value="Evening (14:00 - 22:00)">Evening (14:00 – 22:00)</option>
                    <option value="Night (22:00 - 06:00)">Night (22:00 – 06:00)</option>
                    <option value="General Day (09:00 - 18:00)">General Day (09:00 – 18:00)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="shift-date-input">Duty Date</label>
                  <input
                    id="shift-date-input"
                    type="date"
                    required
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div>
                  <label htmlFor="start-t">Start Time</label>
                  <input
                    id="start-t"
                    type="text"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="end-t">End Time</label>
                  <input
                    id="end-t"
                    type="text"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <label htmlFor="assign-loc">Assigned Parking Location / Floor</label>
              <input
                id="assign-loc"
                required
                placeholder="e.g. Floor 1 - Main North Entrance or Floor 2 EV Deck"
                value={assignedLocation}
                onChange={(e) => setAssignedLocation(e.target.value)}
              />

              <label htmlFor="shift-notes">Duty Instructions / Notes</label>
              <textarea
                id="shift-notes"
                rows={2}
                placeholder="e.g. Monitor barrier, assist accessible permit drivers, EV cable safety check"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="modal-actions">
                <button type="button" className="button button-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? "Assigning..." : "Assign Guard Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
