import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  MapPin,
  Phone,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { GuardMeResponse, Spot } from "./types";

interface GuardPortalProps {
  onNotify: (text: string, error?: boolean) => void;
}

export function GuardPortal({ onNotify }: GuardPortalProps) {
  const [data, setData] = useState<GuardMeResponse | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

  useEffect(() => {
    async function loadGuardInfo() {
      setLoading(true);
      try {
        const [me, allSpots] = await Promise.all([api.guardMe(), api.spots()]);
        setData(me);
        setSpots(allSpots);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : "Failed to load guard portal details.", true);
      } finally {
        setLoading(false);
      }
    }
    void loadGuardInfo();
  }, [onNotify]);

  if (loading) {
    return <div className="empty-state">Loading your security guard portal & duty timetable...</div>;
  }

  if (!data) {
    return <div className="empty-state">Guard profile not found. Please log in as a Security Guard.</div>;
  }

  const { profile, current_shift, upcoming_shifts } = data;

  // Filter spots on guard's assigned floor (e.g. "Floor 1")
  const assignedFloorName = profile.assigned_location.includes("Floor 2")
    ? "Floor 2"
    : profile.assigned_location.includes("Floor 3")
    ? "Floor 3"
    : "Floor 1";

  const floorSpots = spots.filter((s) => (s.floor || "Floor 1") === assignedFloorName);
  const availableCount = floorSpots.filter((s) => s.status === "available").length;
  const occupiedCount = floorSpots.filter((s) => s.status === "occupied").length;

  return (
    <section className="guard-portal-container" aria-labelledby="guard-portal-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <Shield size={14} aria-hidden="true" />
            <span>SECURITY GUARD PORTAL &bull; READ-ONLY</span>
          </div>
          <h2 id="guard-portal-title" className="section-title">
            Officer {profile.full_name || profile.username}'s Duty Console
          </h2>
          <p className="muted">
            Personal duty roster, assigned facility post, and official payroll & compensation breakdown.
          </p>
        </div>

        <span className="live-chip active">
          <span className="live-dot" />
          <span>Active on Duty</span>
        </span>
      </div>

      <div className="guard-cards-grid">
        {/* Today's Active Assignment */}
        <article className="guard-card duty-assignment-card">
          <div className="card-head">
            <MapPin size={20} className="icon-gold" aria-hidden="true" />
            <h3>Assigned Parking Location</h3>
          </div>
          <div className="assigned-location-banner">
            <strong>{profile.assigned_location}</strong>
            <span>Active Sector &bull; Surveillance & Access Control</span>
          </div>
          {current_shift ? (
            <div className="shift-info-box">
              <div className="shift-info-row">
                <Clock size={16} aria-hidden="true" />
                <span>
                  <strong>Today's Shift:</strong> {current_shift.shift_name} ({current_shift.start_time} – {current_shift.end_time})
                </span>
              </div>
              <div className="shift-info-row">
                <Calendar size={16} aria-hidden="true" />
                <span>
                  <strong>Date:</strong> {current_shift.shift_date} &bull; Status: <span className="status-badge badge-on-duty">{current_shift.status}</span>
                </span>
              </div>
              {current_shift.notes && (
                <p className="shift-instruction">
                  <strong>Instructions:</strong> {current_shift.notes}
                </p>
              )}
            </div>
          ) : (
            <p className="muted">No active shift scheduled for today. Contact manager for changes.</p>
          )}

          <div className="emergency-contact-box">
            <Phone size={15} aria-hidden="true" />
            <span>Emergency / Supervisor Contact: <strong>{profile.emergency_contact}</strong></span>
          </div>
        </article>

        {/* Salary & Compensation Details */}
        <article className="guard-card salary-card">
          <div className="card-head">
            <Coins size={20} className="icon-green" aria-hidden="true" />
            <h3>Monthly Salary & Benefits</h3>
          </div>

          <div className="salary-payout-chip">
            <span>Payout Status:</span>
            <span className="status-badge badge-paid">
              <CheckCircle2 size={13} aria-hidden="true" />
              {profile.payout_status}
            </span>
          </div>

          <dl className="salary-breakdown-dl">
            <div className="salary-row">
              <dt>Base Monthly Salary</dt>
              <dd>{currency.format(profile.base_salary)}</dd>
            </div>
            <div className="salary-row">
              <dt>Night & Shift Allowance</dt>
              <dd>{currency.format(profile.shift_allowance)}</dd>
            </div>
            <div className="salary-row">
              <dt>
                Overtime Earnings ({profile.overtime_hours} hrs &times; ₹{profile.overtime_rate}/hr)
              </dt>
              <dd>{currency.format(profile.overtime_hours * profile.overtime_rate)}</dd>
            </div>
            <div className="salary-row total">
              <dt>Total Net Compensation</dt>
              <dd className="total-amount">{currency.format(profile.total_salary)}</dd>
            </div>
          </dl>

          <p className="salary-note">
            <FileText size={14} aria-hidden="true" />
            Salary slip generated and verified by Facility Operations Manager.
          </p>
        </article>

        {/* Assigned Floor Spot Status Monitor */}
        <article className="guard-card floor-monitor-card">
          <div className="card-head">
            <Building2 size={20} className="icon-blue" aria-hidden="true" />
            <h3>Assigned Floor Monitor: {assignedFloorName}</h3>
          </div>

          <div className="monitor-stats-row">
            <div className="monitor-stat">
              <span>Floor Slots</span>
              <strong>{floorSpots.length}</strong>
            </div>
            <div className="monitor-stat text-green">
              <span>Available</span>
              <strong>{availableCount}</strong>
            </div>
            <div className="monitor-stat text-purple">
              <span>Occupied</span>
              <strong>{occupiedCount}</strong>
            </div>
          </div>

          <div className="assigned-floor-mini-grid">
            {floorSpots.slice(0, 12).map((spot) => (
              <div key={spot.id} className={`mini-spot-cell cell-${spot.status}`}>
                <span>{spot.id}</span>
                <small>{spot.status[0].toUpperCase()}</small>
              </div>
            ))}
          </div>
          <p className="field-hint">Real-time occupancy status for your assigned post sector.</p>
        </article>
      </div>

      {/* Duty Timetable Table */}
      <div className="timetable-section">
        <h3 className="sub-title">Personal Duty Timetable Roster</h3>
        <div className="shifts-table-container">
          <table className="shifts-table" aria-label="Personal Duty Timetable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Shift Window</th>
                <th>Timing</th>
                <th>Assigned Floor / Post</th>
                <th>Duty Status</th>
                <th>Special Briefing</th>
              </tr>
            </thead>
            <tbody>
              {upcoming_shifts.map((s) => (
                <tr key={s.id} className={`shift-row status-${s.status.toLowerCase().replace(" ", "-")}`}>
                  <td>
                    <strong>{s.shift_date}</strong>
                  </td>
                  <td>{s.shift_name}</td>
                  <td>
                    <Clock size={13} aria-hidden="true" /> {s.start_time} – {s.end_time}
                  </td>
                  <td>
                    <MapPin size={13} aria-hidden="true" /> {s.assigned_location}
                  </td>
                  <td>
                    <span className={`status-badge badge-${s.status.toLowerCase().replace(" ", "-")}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.notes || "Surveillance and traffic clearance."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
