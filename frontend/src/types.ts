export type VehicleType = "standard" | "ev" | "accessible";
export type SpotStatus = "available" | "occupied" | "reserved";
export type UserRole = "admin" | "attendant" | "guest";

export interface AuthUser {
  username: string;
  role: UserRole;
  full_name: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface CreateSpotInput {
  id: string;
  zone: string;
  spot_type: VehicleType;
  row: number;
  column: number;
}

export interface HourlyRates {
  standard: number;
  ev: number;
  accessible: number;
}

export interface Spot {
  id: string;
  zone: string;
  spot_type: VehicleType;
  row: number;
  column: number;
  status: SpotStatus;
  ticket_id: string | null;
  license_plate: string | null;
  vehicle_type: VehicleType | null;
  checked_in_at: string | null;
}

export interface Ticket {
  id: string;
  license_plate: string;
  vehicle_type: VehicleType;
  phone_number: string;
  spot_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  amount_paid: number | null;
}

export interface Stats {
  total_spots: number;
  free_spots: number;
  occupied_count: number;
  reserved_count: number;
  daily_revenue: number;
}

export interface Receipt {
  ticket: Ticket;
  duration_minutes: number;
  amount_paid: number;
}

export interface Transaction {
  id: string;
  timestamp: string;
  action: "CHECK_IN" | "CHECK_OUT" | "RATE_UPDATE" | "SPOT_CREATE" | "SYSTEM_INIT" | string;
  license_plate: string | null;
  spot_id: string | null;
  amount: number | null;
  performed_by: string;
  details: string;
}

