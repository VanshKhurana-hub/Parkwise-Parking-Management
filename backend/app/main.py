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


def ticket_response(ticket: ParkingTicket) -> TicketResponse:
    return TicketResponse(
        id=ticket.id,
        license_plate=ticket.license_plate,
        vehicle_type=ticket.vehicle_type,
        phone_number=ticket.phone_number,
        spot_id=ticket.spot_id,
        checked_in_at=ticket.checked_in_at,
        checked_out_at=ticket.checked_out_at,
        amount_paid=float(ticket.amount_paid) if ticket.amount_paid is not None else None,
    )


@app.get("/api/spots", response_model=list[SpotResponse])
def list_spots(session: Session = Depends(get_session)) -> list[SpotResponse]:
    spots = session.scalars(select(ParkingSpot).order_by(ParkingSpot.zone, ParkingSpot.id)).all()
    active_by_spot = {
        ticket.spot_id: ticket
        for ticket in session.scalars(
            select(ParkingTicket).where(ParkingTicket.checked_out_at.is_(None))
        ).all()
    }
    return [
        SpotResponse(
            id=spot.id,
            zone=spot.zone,
            spot_type=spot.spot_type,
            row=spot.row,
            column=spot.column,
            status=spot.status,
            ticket_id=active_by_spot[spot.id].id if spot.id in active_by_spot else None,
            license_plate=active_by_spot[spot.id].license_plate if spot.id in active_by_spot else None,
            vehicle_type=active_by_spot[spot.id].vehicle_type if spot.id in active_by_spot else None,
            checked_in_at=active_by_spot[spot.id].checked_in_at if spot.id in active_by_spot else None,
        )
        for spot in spots
    ]


@app.get("/api/spots/recommendation")
def get_recommendation(
    vehicle_type: str = Query(pattern="^(standard|ev|accessible)$"),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    return {"spot_id": recommend_spot(session, vehicle_type).id}


@app.post("/api/checkin", response_model=TicketResponse, status_code=201)
def create_checkin(
    request: CheckInRequest,
    session: Session = Depends(get_session),
) -> TicketResponse:
    with write_lock:
        return ticket_response(check_in(session, request))


@app.post("/api/checkout", response_model=CheckoutResponse)
def create_checkout(
    request: CheckoutRequest,
    session: Session = Depends(get_session),
) -> CheckoutResponse:
    with write_lock:
        ticket, duration_minutes, amount = checkout(
            session,
            request.ticket_id,
            request.checked_out_at,
        )
        return CheckoutResponse(
            ticket=ticket_response(ticket),
            duration_minutes=duration_minutes,
            amount_paid=float(amount),
        )


@app.get("/api/tickets/search", response_model=list[TicketResponse])
def search_tickets(
    q: str = Query(min_length=1, max_length=36),
    session: Session = Depends(get_session),
) -> list[TicketResponse]:
    query = q.strip()
    tickets = session.scalars(
        select(ParkingTicket)
        .where(
            (ParkingTicket.checked_out_at.is_(None))
            & (
                ParkingTicket.license_plate.contains(query.upper())
                | ParkingTicket.id.contains(query)
            )
        )
        .order_by(ParkingTicket.checked_in_at.desc())
        .limit(10)
    ).all()
    return [ticket_response(ticket) for ticket in tickets]


@app.get("/api/stats", response_model=StatsResponse)
def get_stats(session: Session = Depends(get_session)) -> StatsResponse:
    total = int(session.scalar(select(func.count()).select_from(ParkingSpot)) or 0)
    occupied = int(
        session.scalar(
            select(func.count()).select_from(ParkingSpot).where(ParkingSpot.status == "occupied")
        )
        or 0
    )
    reserved = int(
        session.scalar(
            select(func.count()).select_from(ParkingSpot).where(ParkingSpot.status == "reserved")
        )
        or 0
    )
    today = now_utc().date()
    revenue = session.scalars(
        select(ParkingTicket.amount_paid).where(
            ParkingTicket.checked_out_at.is_not(None),
            func.date(ParkingTicket.checked_out_at) == today.isoformat(),
        )
    ).all()
    return StatsResponse(
        total_spots=total,
        free_spots=total - occupied - reserved,
        occupied_count=occupied,
        reserved_count=reserved,
        daily_revenue=float(sum((value or Decimal("0.00") for value in revenue), Decimal("0.00"))),
    )
