export type VehicleType = "standard" | "ev" | "accessible";
export type SpotStatus = "available" | "occupied" | "reserved";

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
