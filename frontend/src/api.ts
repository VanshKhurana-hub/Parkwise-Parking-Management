import type { Receipt, Spot, Stats, Ticket, VehicleType } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
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
  spots: () => request<Spot[]>("/api/spots"),
  stats: () => request<Stats>("/api/stats"),
  recommendation: (vehicleType: VehicleType) =>
    request<{ spot_id: string }>(`/api/spots/recommendation?vehicle_type=${vehicleType}`),
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
};
