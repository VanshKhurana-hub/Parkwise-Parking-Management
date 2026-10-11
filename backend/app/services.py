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
