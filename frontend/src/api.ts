import type {
  AddFloorInput,
  AdminAnalyticsData,
  AuthUser,
  CreateSpotInput,
  FloorInfo,
  GuardMeResponse,
  GuardShift,
  GuardShiftCreateInput,
  HourlyRates,
  LoginResponse,
  PersonnelCreateInput,
  Receipt,
  ScaleFloorsInput,
  Spot,
  SpotStatus,
  Stats,
  Ticket,
  Transaction,
  UpdateRatesInput,
  VehicleType,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "parkwise-auth-token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Gracefully handle storage disabled
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    // If relative request failed, attempt direct connection to backend port 8000
    if (!API_URL) {
      try {
        response = await fetch(`http://127.0.0.1:8000${path}`, {
          ...init,
          headers,
        });
      } catch {
        throw new Error("Could not connect to the parking service. Check that the backend is running on http://127.0.0.1:8000.");
      }
    } else {
      throw new Error("Could not connect to the parking service. Check that the API is running.");
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string | Array<{ msg?: string }> }
      | null;
    const detail = payload?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).filter(Boolean).join(". ")
      : detail;
    throw new Error(message || `The request failed (${response.status}). Please try again.`);
  }
  return (await response.json()) as T;
}

export const api = {
  // Auth endpoints
  login: (credentials: { username: string; password: string }) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  me: () => request<AuthUser>("/api/auth/me"),

  // Parking spots endpoints (with Floor support)
  spots: (floor?: string) => {
    const query = floor ? `?floor=${encodeURIComponent(floor)}` : "";
    return request<Spot[]>(`/api/spots${query}`);
  },
  createSpot: (spot: CreateSpotInput) =>
    request<Spot>("/api/spots", {
      method: "POST",
      body: JSON.stringify(spot),
    }),
  updateSpotStatus: (spotId: string, status: SpotStatus) =>
    request<Spot>(`/api/manager/spots/${encodeURIComponent(spotId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  recommendation: (vehicleType: VehicleType) =>
    request<{ spot_id: string }>(`/api/spots/recommendation?vehicle_type=${vehicleType}`),

  // Check-in and checkout endpoints
  checkIn: (input: {
    license_plate: string;
    vehicle_type: VehicleType;
    phone_number: string;
    spot_id?: string;
  }) => request<Ticket>("/api/checkin", { method: "POST", body: JSON.stringify(input) }),

  searchTickets: (query: string) =>
    request<Ticket[]>(`/api/tickets/search?q=${encodeURIComponent(query)}`),

  checkout: (ticketId: string) =>
    request<Receipt>("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ ticket_id: ticketId }),
    }),

  // Dynamic Floor Management
  floors: () => request<FloorInfo[]>("/api/floors"),
  addFloor: (input: AddFloorInput) =>
    request<FloorInfo[]>("/api/floors", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  scaleFloors: (input: ScaleFloorsInput) =>
    request<FloorInfo[]>("/api/floors/scale", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteFloor: (floorName: string) =>
    request<{ message: string }>(`/api/floors/${encodeURIComponent(floorName)}`, {
      method: "DELETE",
    }),

  stats: () => request<Stats>("/api/stats"),
  rates: () => request<HourlyRates>("/api/rates"),
  updateRates: (rates: UpdateRatesInput) =>
    request<HourlyRates>("/api/rates", {
      method: "PUT",
      body: JSON.stringify(rates),
    }),

  transactions: (params?: { limit?: number; action?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.action) query.set("action", params.action);
    if (params?.q) query.set("q", params.q);
    const qs = query.toString();
    return request<Transaction[]>(`/api/transactions${qs ? `?${qs}` : ""}`);
  },

  // Admin exclusive analytics dashboard
  adminAnalytics: () => request<AdminAnalyticsData>("/api/admin/analytics"),

  // Manager personnel management (Billers and Security Guards)
  personnel: () => request<AuthUser[]>("/api/manager/personnel"),
  createPersonnel: (input: PersonnelCreateInput) =>
    request<AuthUser>("/api/manager/personnel", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePersonnel: (userId: string, data: Partial<PersonnelCreateInput> & { is_active?: boolean; payout_status?: string }) =>
    request<AuthUser>(`/api/manager/personnel/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Guard scheduling module
  guardShifts: (params?: { date?: string; guard_id?: string }) => {
    const query = new URLSearchParams();
    if (params?.date) query.set("date", params.date);
    if (params?.guard_id) query.set("guard_id", params.guard_id);
    const qs = query.toString();
    return request<GuardShift[]>(`/api/guard-shifts${qs ? `?${qs}` : ""}`);
  },
  createGuardShift: (input: GuardShiftCreateInput) =>
    request<GuardShift>("/api/guard-shifts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateGuardShift: (shiftId: string, data: { status?: string; assigned_location?: string; notes?: string }) =>
    request<GuardShift>(`/api/guard-shifts/${encodeURIComponent(shiftId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Security guard restricted personal portal
  guardMe: () => request<GuardMeResponse>("/api/guard/me"),
};
