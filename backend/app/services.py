from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import ParkingSpot, ParkingTicket
from .schemas import CheckInRequest

HOURLY_RATES = {
    "standard": Decimal("4.00"),
    "ev": Decimal("7.00"),
    "accessible": Decimal("3.00"),
}
COMPATIBLE_SPOTS = {
    "standard": {"standard"},
    "ev": {"ev"},
    "accessible": {"accessible"},
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


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


def check_in(session: Session, request: CheckInRequest) -> ParkingTicket:
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


def checkout(session: Session, ticket_id: str, checked_out_at: datetime | None = None) -> tuple[ParkingTicket, int, Decimal]:
    ticket = session.get(ParkingTicket, ticket_id)
    if ticket is None:
        ticket = session.scalar(
            select(ParkingTicket).where(
                ParkingTicket.license_plate == ticket_id.strip().upper(),
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
    billable_hours = max(1, ceil(seconds / 3600))
    amount = (HOURLY_RATES[ticket.vehicle_type] * billable_hours).quantize(Decimal("0.01"))
    result = session.execute(
        update(ParkingTicket)
        .where(
            ParkingTicket.id == ticket.id,
            ParkingTicket.checked_out_at.is_(None),
        )
        .values(checked_out_at=checkout_time, amount_paid=amount)
    )
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(status_code=409, detail="This parking ticket has already been checked out.")
    spot = session.get(ParkingSpot, ticket.spot_id)
    if spot is None:
        raise HTTPException(status_code=500, detail="The ticket references a missing parking spot.")
    spot.status = "available"
    session.commit()
    session.expire(ticket)
    session.refresh(ticket)
    return ticket, duration_minutes, amount
