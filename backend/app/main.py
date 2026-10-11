from contextlib import asynccontextmanager
from decimal import Decimal
from threading import RLock

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, get_session
from .models import ParkingSpot, ParkingTicket
from .schemas import (
    CheckInRequest,
    CheckoutRequest,
    CheckoutResponse,
    SpotResponse,
    StatsResponse,
    TicketResponse,
)
from .services import check_in, checkout, now_utc, recommend_spot

write_lock = RLock()


def seed_spots() -> None:
    with SessionLocal() as session:
        if session.scalar(select(func.count()).select_from(ParkingSpot)):
            return
        spots = []
        for zone, spot_type, prefix, count in (
            ("Zone A", "standard", "A", 12),
            ("Zone B", "ev", "B", 8),
            ("Zone C", "accessible", "C", 6),
        ):
            for index in range(1, count + 1):
                spots.append(
                    ParkingSpot(
                        id=f"{prefix}-{index:02}",
                        zone=zone,
                        spot_type=spot_type,
                        row=(index - 1) // 6 + 1,
                        column=(index - 1) % 6 + 1,
                        status="available",
                    )
                )
        session.add_all(spots)
        session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_spots()
    yield


app = FastAPI(title="Parkwise Parking API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
