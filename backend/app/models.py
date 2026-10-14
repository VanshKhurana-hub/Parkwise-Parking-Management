from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="guest")
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)


class ParkingSpot(Base):
    __tablename__ = "parking_spots"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
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
    spot_id: Mapped[str] = mapped_column(ForeignKey("parking_spots.id"), nullable=False, index=True)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    amount_paid: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    spot: Mapped[ParkingSpot] = relationship(back_populates="tickets")
