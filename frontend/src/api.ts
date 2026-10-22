import type {
  AuthUser,
  CreateSpotInput,
  HourlyRates,
  LoginResponse,
  Receipt,
  Spot,
  Stats,
  Ticket,
  Transaction,
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
    throw new Error("Could not connect to the parking service. Check that the API is running.");
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

  // Parking spots endpoints
  spots: () => request<Spot[]>("/api/spots"),
  createSpot: (spot: CreateSpotInput) =>
    request<Spot>("/api/spots", {
      method: "POST",
      body: JSON.stringify(spot),
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
  stats: () => request<Stats>("/api/stats"),
  rates: () => request<HourlyRates>("/api/rates"),
  updateRates: (rates: HourlyRates) =>
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
};
