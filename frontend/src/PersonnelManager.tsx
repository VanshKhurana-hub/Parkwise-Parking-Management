import {
  CheckCircle2,
  Plus,
  Shield,
  ShieldAlert,
  UserCheck,
  UserCog,
  Users,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { AuthUser, UserRole } from "./types";

interface PersonnelManagerProps {
  role: UserRole;
  onNotify: (text: string, error?: boolean) => void;
}

export function PersonnelManager({ role, onNotify }: PersonnelManagerProps) {
  const isManager = role === "manager" || role === "admin";
  const [personnel, setPersonnel] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pRole, setPRole] = useState<"biller" | "security_guard">("biller");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [assignedLocation, setAssignedLocation] = useState("Floor 1 - Main Concourse");
  const [baseSalary, setBaseSalary] = useState(26000);
  const [shiftAllowance, setShiftAllowance] = useState(3500);
  const [submitting, setSubmitting] = useState(false);

  async function loadPersonnel() {
    setLoading(true);
    try {
      const data = await api.personnel();
      setPersonnel(data);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to load personnel accounts.", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPersonnel();
  }, []);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isManager) {
      onNotify("Manager authority required to create personnel accounts.", true);
      return;
    }

    setSubmitting(true);
    try {
      await api.createPersonnel({
        username: username.trim(),
        password,
        role: pRole,
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        assigned_location: assignedLocation,
        base_salary: baseSalary,
        shift_allowance: shiftAllowance,
      });
      onNotify(`Personnel account @${username} created successfully.`, false);
      setIsModalOpen(false);
      setUsername("");
      setPassword("");
      setFullName("");
      setPhone("");
      setEmail("");
      await loadPersonnel();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to create personnel account.", true);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(user: AuthUser) {
    if (!isManager || !user.id) return;
    const newActive = !user.is_active;
    try {
      await api.updatePersonnel(user.id, { is_active: newActive });
      onNotify(`Account @${user.username} is now ${newActive ? "Active" : "Deactivated"}.`, false);
      await loadPersonnel();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to update account status.", true);
    }
  }

  return (
    <section className="personnel-manager-section" aria-labelledby="personnel-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <UserCog size={14} aria-hidden="true" />
            <span>OPERATIONS TEAM MANAGEMENT</span>
          </div>
          <h2 id="personnel-title" className="section-title">
            System Personnel & Account Governance
          </h2>
          <p className="muted">
            Provision, manage, and configure staff accounts for Billers and Security Guards across parking facilities.
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => setIsModalOpen(true)}
            title="Create a new Biller or Security Guard account"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Add Personnel Account</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading personnel directory...</div>
      ) : personnel.length === 0 ? (
        <div className="empty-state">No personnel accounts registered.</div>
      ) : (
        <div className="shifts-table-container">
          <table className="shifts-table" aria-label="System Personnel Accounts">
            <thead>
              <tr>
                <th>Personnel Member</th>
                <th>Username</th>
                <th>Role & Permissions</th>
                <th>Contact Phone</th>
                <th>Account Status</th>
                {isManager && <th>Governance</th>}
              </tr>
            </thead>
            <tbody>
              {personnel.map((u) => {
                const isActive = u.is_active !== false;
                const roleBadgeClass =
                  u.role === "security_guard" ? "role-guard" : u.role === "biller" ? "role-biller" : "role-attendant";
                const roleDisplay =
                  u.role === "security_guard" ? "Security Guard" : u.role === "biller" ? "Biller" : "Attendant";

                return (
                  <tr key={u.id || u.username} className={`personnel-row ${!isActive ? "inactive" : ""}`}>
                    <td>
                      <div className="personnel-name-cell">
                        <Users size={16} aria-hidden="true" />
                        <div>
                          <strong>{u.full_name}</strong>
                          <span className="email-sub">{u.email || "No email on record"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="monospace">@{u.username}</span>
                    </td>
                    <td>
                      <span className={`role-badge ${roleBadgeClass}`}>
                        <Shield size={12} aria-hidden="true" />
                        <span>{roleDisplay}</span>
                      </span>
                    </td>
                    <td>
                      <span>{u.phone || "—"}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${isActive ? "badge-on-duty" : "badge-cancelled"}`}>
                        {isActive ? (
                          <>
                            <CheckCircle2 size={12} aria-hidden="true" /> Active
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={12} aria-hidden="true" /> Deactivated
                          </>
                        )}
                      </span>
                    </td>
                    {isManager && (
                      <td>
                        <button
                          type="button"
                          className={`button button-small action-pill ${isActive ? "deactivate" : "activate"}`}
                          onClick={() => toggleStatus(u)}
                          title={isActive ? "Deactivate account" : "Activate account"}
                        >
                          {isActive ? (
                            <>
                              <UserX size={13} aria-hidden="true" /> Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck size={13} aria-hidden="true" /> Activate
                            </>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Personnel Modal */}
      {isModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-personnel-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">MANAGER CONTROL</p>
                <h2 id="add-personnel-title">Create System Personnel Account</h2>
                <p className="muted">Create operational credentials for Front Desk Billers or Security Guards.</p>
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

            <form onSubmit={handleCreateSubmit} className="modal-form">
              <div className="form-row-2">
                <div>
                  <label htmlFor="p-username">Username</label>
                  <input
                    id="p-username"
                    required
                    placeholder="e.g. biller_ravi or guard_suresh"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="p-pass">Temporary Password</label>
                  <input
                    id="p-pass"
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div>
                  <label htmlFor="p-role">Designated Role</label>
                  <select
                    id="p-role"
                    value={pRole}
                    onChange={(e) => setPRole(e.target.value as "biller" | "security_guard")}
                  >
                    <option value="biller">Biller (Allotment & Billing)</option>
                    <option value="security_guard">Security Guard (Timetable & Patrol)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="p-name">Full Legal Name</label>
                  <input
                    id="p-name"
                    required
                    placeholder="e.g. Priya Sharma"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div>
                  <label htmlFor="p-phone">Phone Number</label>
                  <input
                    id="p-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="p-email">Work Email</label>
                  <input
                    id="p-email"
                    type="email"
                    placeholder="priya@parkwise.io"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {pRole === "security_guard" && (
                <>
                  <label htmlFor="p-loc">Assigned Facility Location / Sector</label>
                  <input
                    id="p-loc"
                    placeholder="e.g. Floor 1 - Main Concourse"
                    value={assignedLocation}
                    onChange={(e) => setAssignedLocation(e.target.value)}
                  />

                  <div className="form-row-2">
                    <div>
                      <label htmlFor="p-salary">Base Monthly Salary (₹)</label>
                      <input
                        id="p-salary"
                        type="number"
                        value={baseSalary}
                        onChange={(e) => setBaseSalary(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label htmlFor="p-allowance">Shift Allowance (₹)</label>
                      <input
                        id="p-allowance"
                        type="number"
                        value={shiftAllowance}
                        onChange={(e) => setShiftAllowance(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="button button-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
