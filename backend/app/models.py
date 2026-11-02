from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="guest")
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class HourlyRate(Base):
    __tablename__ = "hourly_rates"

    vehicle_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    rate_per_hour: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    rate_per_day: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("350.00"))
    rate_per_week: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("2100.00"))
    daily_threshold_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=8)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    license_plate: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)
    spot_id: Mapped[str | None] = mapped_column(String(12), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    performed_by: Mapped[str] = mapped_column(String(50), nullable=False, default="system")
    details: Mapped[str] = mapped_column(String(255), nullable=False)


class ParkingSpot(Base):
    __tablename__ = "parking_spots"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    floor: Mapped[str] = mapped_column(String(20), nullable=False, default="Floor 1", index=True)
    zone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    spot_type: Mapped[str] = mapped_column(String(20), nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="available", index=True)
    tickets: Mapped[list["ParkingTicket"]] = relationship(back_populates="spot")


class ParkingTicket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        Index(
            "uq_active_ticket_spot",
            "spot_id",
            unique=True,
            sqlite_where=text("checked_out_at IS NULL"),
            postgresql_where=text("checked_out_at IS NULL"),
        ),
        Index(
            "uq_active_ticket_plate",
            "license_plate",
            unique=True,
            sqlite_where=text("checked_out_at IS NULL"),
            postgresql_where=text("checked_out_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    license_plate: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    spot_id: Mapped[ForeignKey] = mapped_column(ForeignKey("parking_spots.id"), nullable=False, index=True)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    amount_paid: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    duration_hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    pricing_tier_used: Mapped[str | None] = mapped_column(String(30), nullable=True)
    spot: Mapped[ParkingSpot] = relationship(back_populates="tickets")


class GuardProfile(Base):
    __tablename__ = "guard_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    assigned_location: Mapped[str] = mapped_column(String(100), default="Floor 1 - Main Concourse")
    base_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("26500.00"))
    shift_allowance: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("3500.00"))
    overtime_hours: Mapped[int] = mapped_column(Integer, default=12)
    overtime_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("220.00"))
    payout_status: Mapped[str] = mapped_column(String(30), default="Paid (Current Month)")
    emergency_contact: Mapped[str] = mapped_column(String(50), default="+91 98765 43210")


class GuardShift(Base):
    __tablename__ = "guard_shifts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    guard_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    guard_name: Mapped[str] = mapped_column(String(100), nullable=False)
    shift_name: Mapped[str] = mapped_column(String(30), nullable=False)
    shift_date: Mapped[str] = mapped_column(String(10), index=True, nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    assigned_location: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="Scheduled")
    notes: Mapped[str] = mapped_column(String(255), default="")
