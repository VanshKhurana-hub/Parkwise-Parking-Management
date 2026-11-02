from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from typing import NamedTuple
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import HourlyRate, ParkingSpot, ParkingTicket, Transaction
from .schemas import CheckInRequest, PriceBreakdownItem, PriceCalculationDetail

DEFAULT_TIERED_RATES = {
    "standard": {
        "hourly": Decimal("40.00"),
        "daily": Decimal("350.00"),
        "weekly": Decimal("2100.00"),
        "threshold": 8,
    },
    "ev": {
        "hourly": Decimal("70.00"),
        "daily": Decimal("600.00"),
        "weekly": Decimal("3600.00"),
        "threshold": 8,
    },
    "accessible": {
        "hourly": Decimal("30.00"),
        "daily": Decimal("250.00"),
        "weekly": Decimal("1500.00"),
        "threshold": 8,
    },
}

DEFAULT_HOURLY_RATES = {k: v["hourly"] for k, v in DEFAULT_TIERED_RATES.items()}
HOURLY_RATES = DEFAULT_HOURLY_RATES

COMPATIBLE_SPOTS = {
    "standard": {"standard"},
    "ev": {"ev"},
    "accessible": {"accessible"},
}


class CheckoutResult(tuple):
    def __new__(cls, ticket: ParkingTicket, duration_minutes: int, amount: Decimal, details: PriceCalculationDetail | None = None):
        return super().__new__(cls, (ticket, duration_minutes, amount))

    def __init__(self, ticket: ParkingTicket, duration_minutes: int, amount: Decimal, details: PriceCalculationDetail | None = None):
        self.ticket = ticket
        self.duration_minutes = duration_minutes
        self.amount = amount
        self.details = details


def get_hourly_rates(session: Session) -> dict[str, Decimal]:
    try:
        rates = session.scalars(select(HourlyRate)).all()
        result = {r.vehicle_type: r.rate_per_hour for r in rates}
        for k, v in DEFAULT_HOURLY_RATES.items():
            if k not in result:
                result[k] = v
        return result
    except Exception:
        return DEFAULT_HOURLY_RATES.copy()


def get_all_tiered_rates(session: Session) -> dict[str, dict]:
    try:
        rates = session.scalars(select(HourlyRate)).all()
        result = {}
        for r in rates:
            result[r.vehicle_type] = {
                "hourly": r.rate_per_hour,
                "daily": getattr(r, "rate_per_day", DEFAULT_TIERED_RATES.get(r.vehicle_type, {}).get("daily", Decimal("350.00"))),
                "weekly": getattr(r, "rate_per_week", DEFAULT_TIERED_RATES.get(r.vehicle_type, {}).get("weekly", Decimal("2100.00"))),
                "threshold": getattr(r, "daily_threshold_hours", 8),
            }
        for k, v in DEFAULT_TIERED_RATES.items():
            if k not in result:
                result[k] = v.copy()
        return result
    except Exception:
        return {k: v.copy() for k, v in DEFAULT_TIERED_RATES.items()}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def log_transaction(
    session: Session,
    action: str,
    details: str,
    license_plate: str | None = None,
    spot_id: str | None = None,
    amount: Decimal | None = None,
    performed_by: str = "system",
) -> Transaction:
    tx = Transaction(
        id=str(uuid4()),
        timestamp=now_utc(),
        action=action,
        license_plate=license_plate,
        spot_id=spot_id,
        amount=amount,
        performed_by=performed_by,
        details=details,
    )
    session.add(tx)
    return tx


def format_duration(seconds: float) -> str:
    if seconds < 3600:
        mins = max(1, ceil(seconds / 60))
        return f"{mins} min{'s' if mins != 1 else ''}"
    total_hours = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    if total_hours < 24:
        return f"{total_hours} hr{'s' if total_hours != 1 else ''} {mins} min"
    days = total_hours // 24
    rem_hrs = total_hours % 24
    return f"{days} day{'s' if days != 1 else ''} {rem_hrs} hr{'s' if rem_hrs != 1 else ''} {mins} min"


def calculate_tiered_price(
    checkin_time: datetime,
    checkout_time: datetime,
    vehicle_type: str,
    session: Session,
) -> PriceCalculationDetail:
    """Automated calculation engine that tracks exact duration and calculates tiered parking fares."""
    seconds = max(0.0, (checkout_time - checkin_time).total_seconds())
    total_hours = max(1, ceil(seconds / 3600))
    duration_str = format_duration(seconds)

    tiered_rates = get_all_tiered_rates(session)
    rate_config = tiered_rates.get(vehicle_type, DEFAULT_TIERED_RATES.get(vehicle_type, DEFAULT_TIERED_RATES["standard"]))

    hourly_rate = rate_config["hourly"]
    daily_rate = rate_config["daily"]
    weekly_rate = rate_config["weekly"]
    threshold = rate_config["threshold"]

    standard_hourly_total = (hourly_rate * total_hours).quantize(Decimal("0.01"))
    breakdown: list[PriceBreakdownItem] = []

    if total_hours < threshold:
        tier_applied = "Short-Term (Hourly)"
        breakdown.append(
            PriceBreakdownItem(
                unit="Hours",
                count=total_hours,
                rate=float(hourly_rate),
                subtotal=float(standard_hourly_total),
            )
        )
        final_amount = standard_hourly_total
    else:
        # Long-term tiered pricing algorithm
        weeks = total_hours // 168
        rem_after_weeks = total_hours % 168
        days = rem_after_weeks // 24
        rem_hours = rem_after_weeks % 24

        if rem_hours >= threshold or (rem_hours * hourly_rate) >= daily_rate:
            days += 1
            rem_hours = 0

        if (days * daily_rate) >= weekly_rate:
            weeks += 1
            days = 0
            rem_hours = 0

        tiered_cost = Decimal("0.00")
        if weeks > 0:
            sub = weeks * weekly_rate
            tiered_cost += sub
            breakdown.append(PriceBreakdownItem(unit="Weeks", count=weeks, rate=float(weekly_rate), subtotal=float(sub)))
        if days > 0:
            sub = days * daily_rate
            tiered_cost += sub
            breakdown.append(PriceBreakdownItem(unit="Days", count=days, rate=float(daily_rate), subtotal=float(sub)))
        if rem_hours > 0:
            sub = rem_hours * hourly_rate
            tiered_cost += sub
            breakdown.append(PriceBreakdownItem(unit="Hours", count=rem_hours, rate=float(hourly_rate), subtotal=float(sub)))

        if weeks > 0 and days == 0 and rem_hours == 0:
            tier_applied = "Long-Term (Weekly Tier)"
        elif days > 0 and weeks == 0 and rem_hours == 0:
            tier_applied = "Long-Term (Daily Tier)"
        elif weeks > 0 or days > 0:
            tier_applied = "Long-Term (Multi-Tier Hybrid)"
        else:
            tier_applied = "Short-Term (Hourly)"

        final_amount = min(standard_hourly_total, tiered_cost).quantize(Decimal("0.01"))

    savings_amount = max(Decimal("0.00"), standard_hourly_total - final_amount).quantize(Decimal("0.01"))

    return PriceCalculationDetail(
        total_hours=float(total_hours),
        duration_display=duration_str,
        tier_applied=tier_applied,
        breakdown=breakdown,
        standard_hourly_total=float(standard_hourly_total),
        savings_amount=float(savings_amount),
        final_amount=float(final_amount),
    )


def generate_qr_payload(ticket: ParkingTicket, spot: ParkingSpot) -> str:
    """Generate standardized QR verification payload for touchless kiosk check-in and checkout."""
    checkin_iso = ticket.checked_in_at.isoformat() if ticket.checked_in_at else ""
    floor = getattr(spot, "floor", "Floor 1")
    return f"PARKWISE|TICKET:{ticket.id}|PLATE:{ticket.license_plate}|SPOT:{ticket.spot_id}|FLOOR:{floor}|TYPE:{ticket.vehicle_type}|TIME:{checkin_iso}"


def recommend_spot(session: Session, vehicle_type: str) -> ParkingSpot:
    compatible = COMPATIBLE_SPOTS[vehicle_type]
    spots = session.scalars(
        select(ParkingSpot).where(
            ParkingSpot.status == "available",
            ParkingSpot.spot_type.in_(compatible),
        )
    ).all()
    if not spots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No available {vehicle_type} spots remain.",
        )
    return min(spots, key=lambda spot: (abs(spot.row - 1) + abs(spot.column - 1), spot.id))


def check_in(session: Session, request: CheckInRequest, performed_by: str = "biller") -> ParkingTicket:
    active_duplicate = session.scalar(
        select(ParkingTicket).where(
            ParkingTicket.license_plate == request.license_plate,
            ParkingTicket.checked_out_at.is_(None),
        )
    )
    if active_duplicate:
        raise HTTPException(status_code=409, detail="This vehicle already has an active parking ticket.")

    if request.spot_id:
        spot = session.get(ParkingSpot, request.spot_id)
        if spot is None:
            raise HTTPException(status_code=404, detail="The selected parking spot does not exist.")
        if spot.status != "available":
            raise HTTPException(status_code=409, detail="The selected parking spot is no longer available.")
        if spot.spot_type not in COMPATIBLE_SPOTS[request.vehicle_type]:
            raise HTTPException(
                status_code=422,
                detail=f"{request.vehicle_type.title()} vehicles require a {request.vehicle_type} spot.",
            )
    else:
        spot = recommend_spot(session, request.vehicle_type)

    spot.status = "occupied"
    ticket = ParkingTicket(
        id=str(uuid4()),
        license_plate=request.license_plate,
        vehicle_type=request.vehicle_type,
        phone_number=request.phone_number,
        spot_id=spot.id,
        checked_in_at=now_utc(),
    )
    session.add(ticket)
    log_transaction(
        session=session,
        action="CHECK_IN",
        details=f"Vehicle {ticket.license_plate} ({ticket.vehicle_type}) checked into spot {spot.id} ({getattr(spot, 'floor', 'Floor 1')}).",
        license_plate=ticket.license_plate,
        spot_id=spot.id,
        performed_by=performed_by,
    )
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="The vehicle or parking spot is already assigned to an active ticket.",
        ) from error
    session.refresh(ticket)
    return ticket


def checkout(
    session: Session,
    ticket_id: str,
    checked_out_at: datetime | None = None,
    performed_by: str = "biller",
) -> CheckoutResult:
    clean_id = ticket_id.strip()
    # Support scanning full QR code payload like "PARKWISE|TICKET:uuid|..."
    if "TICKET:" in clean_id:
        for part in clean_id.split("|"):
            if part.startswith("TICKET:"):
                clean_id = part.replace("TICKET:", "").strip()
                break

    ticket = session.get(ParkingTicket, clean_id)
    if ticket is None:
        ticket = session.scalar(
            select(ParkingTicket).where(
                ParkingTicket.license_plate == clean_id.upper(),
                ParkingTicket.checked_out_at.is_(None),
            )
        )
    if ticket is None:
        raise HTTPException(status_code=404, detail="No active parking ticket matches that ticket ID or plate.")
    if ticket.checked_out_at is not None:
        raise HTTPException(status_code=409, detail="This parking ticket has already been checked out.")

    checkout_time = checked_out_at or now_utc()
    if checkout_time.tzinfo is None:
        checkout_time = checkout_time.replace(tzinfo=timezone.utc)
    if ticket.checked_in_at.tzinfo is None:
        checkin_time = ticket.checked_in_at.replace(tzinfo=timezone.utc)
    else:
        checkin_time = ticket.checked_in_at
    checkout_time = checkout_time.astimezone(timezone.utc)

    if checkout_time < checkin_time:
        raise HTTPException(status_code=422, detail="Checkout time cannot be earlier than check-in time.")
    if checkout_time > now_utc():
        raise HTTPException(status_code=422, detail="Checkout time cannot be in the future.")

    seconds = (checkout_time - checkin_time).total_seconds()
    duration_minutes = max(1, ceil(seconds / 60))

    # Automated calculation engine tracks exact time in hours and applies tiered pricing
    price_info = calculate_tiered_price(checkin_time, checkout_time, ticket.vehicle_type, session)
    amount = Decimal(str(price_info.final_amount))

    result = session.execute(
        update(ParkingTicket)
        .where(
            ParkingTicket.id == ticket.id,
            ParkingTicket.checked_out_at.is_(None),
        )
        .values(
            checked_out_at=checkout_time,
            amount_paid=amount,
            duration_hours=Decimal(str(price_info.total_hours)),
            pricing_tier_used=price_info.tier_applied,
        )
    )
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(status_code=409, detail="This parking ticket has already been checked out.")

    spot = session.get(ParkingSpot, ticket.spot_id)
    if spot is not None:
        spot.status = "available"

    log_transaction(
        session=session,
        action="CHECK_OUT",
        details=f"Vehicle {ticket.license_plate} checked out from spot {ticket.spot_id}. Stayed {price_info.duration_display}. Tier: {price_info.tier_applied}. Paid ₹{amount:.2f} (Saved ₹{price_info.savings_amount:.2f}).",
        license_plate=ticket.license_plate,
        spot_id=ticket.spot_id,
        amount=amount,
        performed_by=performed_by,
    )
    session.commit()
    session.expire(ticket)
    session.refresh(ticket)
    return CheckoutResult(ticket, duration_minutes, amount, price_info)
