export type VehicleType = "standard" | "ev" | "accessible";
export type SpotStatus = "available" | "occupied" | "reserved" | "maintenance";
export type UserRole = "admin" | "manager" | "biller" | "security_guard" | "attendant" | "guest";

export interface AuthUser {
  id?: string;
  username: string;
  role: UserRole;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface CreateSpotInput {
  id: string;
  floor?: string;
  zone: string;
  spot_type: VehicleType;
  row: number;
  column: number;
}

export interface FloorInfo {
  name: string;
  level_number: number;
  zone_default: string;
  total_spots: number;
  available_spots: number;
  occupied_spots: number;
  reserved_spots: number;
  maintenance_spots: number;
}

export interface AddFloorInput {
  name: string;
  level_number?: number;
  default_zone?: string;
  spot_type?: VehicleType;
  initial_spots_count?: number;
  spot_prefix?: string;
}

export interface ScaleFloorsInput {
  target_floors: number;
  spots_per_new_floor?: number;
}

export interface TierItem {
  vehicle_type: VehicleType;
  hourly_rate: number;
  daily_rate: number;
  weekly_rate: number;
  daily_threshold_hours: number;
}

export interface HourlyRates {
  standard: number;
  ev: number;
  accessible: number;
  tiers?: Record<string, TierItem>;
}

export interface UpdateRatesInput {
  standard: number;
  ev: number;
  accessible: number;
  standard_daily?: number;
  standard_weekly?: number;
  ev_daily?: number;
  ev_weekly?: number;
  accessible_daily?: number;
  accessible_weekly?: number;
  daily_threshold_hours?: number;
}

export interface Spot {
  id: string;
  floor: string;
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
  floor: string;
  checked_in_at: string;
  checked_out_at: string | null;
  amount_paid: number | null;
  pricing_tier_used?: string | null;
  qr_token?: string | null;
}

export interface PriceBreakdownItem {
  unit: string;
  count: number;
  rate: number;
  subtotal: number;
}

export interface Receipt {
  ticket: Ticket;
  duration_minutes: number;
  duration_hours: number;
  duration_display: string;
  tier_applied: string;
  breakdown: PriceBreakdownItem[];
  savings_amount: number;
  amount_paid: number;
}

export interface Stats {
  total_spots: number;
  free_spots: number;
  occupied_count: number;
  reserved_count: number;
  maintenance_count: number;
  daily_revenue: number;
}

export interface Transaction {
  id: string;
  timestamp: string;
  action: string;
  license_plate: string | null;
  spot_id: string | null;
  amount: number | null;
  performed_by: string;
  details: string;
}

export interface GuardProfile {
  user_id: string;
  username: string;
  full_name: string;
  phone?: string | null;
  assigned_location: string;
  base_salary: number;
  shift_allowance: number;
  overtime_hours: number;
  overtime_rate: number;
  total_salary: number;
  payout_status: string;
  emergency_contact: string;
}

export interface GuardShift {
  id: string;
  guard_id: string;
  guard_name: string;
  shift_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  assigned_location: string;
  status: "Scheduled" | "On Duty" | "Completed" | "Cancelled";
  notes: string;
}

export interface GuardShiftCreateInput {
  guard_id: string;
  shift_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  assigned_location: string;
  notes?: string;
}

export interface GuardMeResponse {
  user: AuthUser;
  profile: GuardProfile;
  current_shift: GuardShift | null;
  upcoming_shifts: GuardShift[];
}

export interface PersonnelCreateInput {
  username: string;
  password: string;
  role: "biller" | "security_guard";
  full_name: string;
  email?: string;
  phone?: string;
  assigned_location?: string;
  base_salary?: number;
  shift_allowance?: number;
}

export interface AdminAnalyticsData {
  total_revenue: number;
  today_revenue: number;
  weekly_revenue: number;
  monthly_revenue: number;
  occupancy_rate: number;
  total_checkouts: number;
  average_duration_hours: number;
  floor_occupancy: Record<string, Record<string, number>>;
  vehicle_distribution: Record<string, number>;
  tier_revenue: Record<string, number>;
  peak_hours: Array<{ hour: string; vehicles: number }>;
  recent_transactions: Transaction[];
}
