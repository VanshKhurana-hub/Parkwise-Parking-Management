from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

VehicleType = Literal["standard", "ev", "accessible"]
Plate = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_upper=True,
        pattern=r"^[A-Za-z0-9]{2,4}[- ]?[A-Za-z0-9]{2,5}$",
        min_length=4,
        max_length=10,
    ),
]
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
    username: str
    role: str
    full_name: str


class RatesResponse(BaseModel):
    standard: float
    ev: float
    accessible: float


class UpdateRatesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    standard: Annotated[float, Field(gt=0, le=50000)]
    ev: Annotated[float, Field(gt=0, le=50000)]
    accessible: Annotated[float, Field(gt=0, le=50000)]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class CreateSpotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=2, max_length=12)]
    zone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20)]
    spot_type: VehicleType
    row: Annotated[int, Field(ge=1, le=100)]
    column: Annotated[int, Field(ge=1, le=100)]


class CheckInRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    license_plate: Plate
    vehicle_type: VehicleType
    phone_number: Phone
    spot_id: Annotated[str, Field(min_length=1, max_length=12)] | None = None


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticket_id: Annotated[str, Field(min_length=1, max_length=36)]
    checked_out_at: datetime | None = None


class SpotResponse(BaseModel):
    id: str
    zone: str
    spot_type: str
    row: int
    column: int
    status: str
    ticket_id: str | None = None
    license_plate: str | None = None
    vehicle_type: str | None = None
    checked_in_at: datetime | None = None


class TicketResponse(BaseModel):
    id: str
    license_plate: str
    vehicle_type: str
    phone_number: str
    spot_id: str
    checked_in_at: datetime
    checked_out_at: datetime | None
    amount_paid: float | None


class CheckoutResponse(BaseModel):
    ticket: TicketResponse
    duration_minutes: int
    amount_paid: float


class StatsResponse(BaseModel):
    total_spots: int
    free_spots: int
    occupied_count: int
    reserved_count: int
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

