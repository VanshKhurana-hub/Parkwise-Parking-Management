import re
from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

VehicleType = Literal["standard", "ev", "accessible"]
UserRole = Literal["admin", "manager", "biller", "security_guard", "attendant", "guest"]

# Strict plate regex: allows standardized registration codes like:
# Indian Standard: DL-01-AB-1234, MH 12 CD 5678, KA05MJ9000
# International Standard: NYC-4589, ABC-1234, CA 7XYZ999, K-AA-1234
PLATE_REGEX = re.compile(
    r"^(?:[A-Z]{2}[- ]?[0-9]{1,2}[- ]?[A-Z]{1,3}[- ]?[0-9]{4}|[A-Z0-9]{2,4}[- ]?[A-Z0-9]{2,5}(?:[- ]?[A-Z0-9]{1,4})?)$",
    re.IGNORECASE,
)

Phone = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        pattern=r"^\+?[0-9][0-9 ()-]{7,18}[0-9]$",
        min_length=9,
        max_length=20,
    ),
]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=100)]


class UserResponse(BaseModel):
    id: str | None = None
    username: str
    role: str
    full_name: str
    email: str | None = None
    phone: str | None = None
    is_active: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PersonnelCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50)]
    password: Annotated[str, StringConstraints(min_length=6, max_length=100)]
    role: Literal["biller", "security_guard"]
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
    email: str | None = None
    phone: str | None = None
    assigned_location: str | None = "Floor 1 - Main Concourse"
    base_salary: float | None = 25000.0
    shift_allowance: float | None = 3000.0


class PersonnelUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    role: Literal["biller", "security_guard"] | None = None
    is_active: bool | None = None
    assigned_location: str | None = None
    base_salary: float | None = None
    shift_allowance: float | None = None
    payout_status: str | None = None


class GuardProfileResponse(BaseModel):
    user_id: str
    username: str
    full_name: str
    phone: str | None = None
    assigned_location: str
    base_salary: float
    shift_allowance: float
    overtime_hours: int
    overtime_rate: float
    total_salary: float
    payout_status: str
    emergency_contact: str


class GuardShiftCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    guard_id: str
    shift_name: Literal["Morning (06:00 - 14:00)", "Evening (14:00 - 22:00)", "Night (22:00 - 06:00)", "General Day (09:00 - 18:00)"]
    shift_date: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    start_time: str
    end_time: str
    assigned_location: str
    notes: str = ""


class GuardShiftUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["Scheduled", "On Duty", "Completed", "Cancelled"] | None = None
    assigned_location: str | None = None
    notes: str | None = None


class GuardShiftResponse(BaseModel):
    id: str
    guard_id: str
    guard_name: str
    shift_name: str
    shift_date: str
    start_time: str
    end_time: str
    assigned_location: str
    status: str
    notes: str


class GuardMeResponse(BaseModel):
    user: UserResponse
    profile: GuardProfileResponse
    current_shift: GuardShiftResponse | None = None
    upcoming_shifts: list[GuardShiftResponse] = []


# --- Rates & Tiered Pricing Schemas ---

class TierItem(BaseModel):
    vehicle_type: VehicleType
    hourly_rate: float
    daily_rate: float
    weekly_rate: float
    daily_threshold_hours: int = 8


class RatesResponse(BaseModel):
    standard: float
    ev: float
    accessible: float
    # Extended tiered rates
    tiers: dict[str, TierItem] | None = None


class UpdateRatesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    standard: Annotated[float, Field(gt=0, le=50000)]
    ev: Annotated[float, Field(gt=0, le=50000)]
    accessible: Annotated[float, Field(gt=0, le=50000)]
    standard_daily: float | None = None
    standard_weekly: float | None = None
    ev_daily: float | None = None
    ev_weekly: float | None = None
    accessible_daily: float | None = None
    accessible_weekly: float | None = None
    daily_threshold_hours: int | None = 8


# --- Dynamic Floor Schemas ---

class FloorInfo(BaseModel):
    name: str
    level_number: int
    zone_default: str
    total_spots: int
    available_spots: int
    occupied_spots: int
    reserved_spots: int
    maintenance_spots: int


class AddFloorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    level_number: int | None = None
    default_zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] = "Zone A"
    spot_type: VehicleType = "standard"
    initial_spots_count: Annotated[int, Field(ge=0, le=50)] = 8
    spot_prefix: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=5)] | None = None


class ScaleFloorsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_floors: Annotated[int, Field(ge=1, le=20)]
    spots_per_new_floor: Annotated[int, Field(ge=1, le=30)] = 8


# --- Spots Schemas ---

class CreateSpotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=2, max_length=12)]
    floor: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] = "Floor 1"
    zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20)]
    spot_type: VehicleType
    row: Annotated[int, Field(ge=1, le=100)]
    column: Annotated[int, Field(ge=1, le=100)]


class UpdateSpotStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["available", "occupied", "reserved", "maintenance"]


class SpotResponse(BaseModel):
    id: str
    floor: str = "Floor 1"
    zone: str
    spot_type: str
    row: int
    column: int
    status: str
    ticket_id: str | None = None
    license_plate: str | None = None
    vehicle_type: str | None = None
    checked_in_at: datetime | None = None


# --- Check-in and Checkout Schemas ---

class CheckInRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    license_plate: str
    vehicle_type: VehicleType
    phone_number: Phone
    spot_id: Annotated[str, Field(min_length=1, max_length=12)] | None = None

    @field_validator("license_plate")
    @classmethod
    def validate_license_plate(cls, v: str) -> str:
        clean = v.strip().upper()
        if not (4 <= len(clean) <= 15):
            raise ValueError("Registration number must be between 4 and 15 characters.")
        if not PLATE_REGEX.match(clean):
            raise ValueError(
                "Invalid registration format. Use standardized format, e.g. 'DL-01-AB-1234' or 'MH 12 CD 5678'."
            )
        return clean


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticket_id: Annotated[str, Field(min_length=1, max_length=255)]
    checked_out_at: datetime | None = None


class PriceBreakdownItem(BaseModel):
    unit: str  # "Weeks", "Days", "Hours"
    count: int
    rate: float
    subtotal: float


class PriceCalculationDetail(BaseModel):
    total_hours: float
    duration_display: str
    tier_applied: str  # "Short-Term Hourly", "Long-Term Daily Tier", "Long-Term Weekly Tier", "Multi-Tier Hybrid"
    breakdown: list[PriceBreakdownItem]
    standard_hourly_total: float
    savings_amount: float
    final_amount: float


class TicketResponse(BaseModel):
    id: str
    license_plate: str
    vehicle_type: str
    phone_number: str
    spot_id: str
    floor: str = "Floor 1"
    checked_in_at: datetime
    checked_out_at: datetime | None = None
    amount_paid: float | None = None
    pricing_tier_used: str | None = None
    qr_token: str | None = None


class CheckoutResponse(BaseModel):
    ticket: TicketResponse
    duration_minutes: int
    duration_hours: float
    duration_display: str
    tier_applied: str
    breakdown: list[PriceBreakdownItem]
    savings_amount: float
    amount_paid: float


class StatsResponse(BaseModel):
    total_spots: int
    free_spots: int
    occupied_count: int
    reserved_count: int
    maintenance_count: int = 0
    daily_revenue: float


class TransactionResponse(BaseModel):
    id: str
    timestamp: datetime
    action: str
    license_plate: str | None = None
    spot_id: str | None = None
    amount: float | None = None
    performed_by: str
    details: str


class AdminAnalyticsResponse(BaseModel):
    total_revenue: float
    today_revenue: float
    weekly_revenue: float
    monthly_revenue: float
    occupancy_rate: float
    total_checkouts: int
    average_duration_hours: float
    floor_occupancy: dict[str, dict[str, int]]
    vehicle_distribution: dict[str, int]
    tier_revenue: dict[str, float]
    peak_hours: list[dict[str, int | str]]
    recent_transactions: list[TransactionResponse]
