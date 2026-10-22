from contextlib import asynccontextmanager
from decimal import Decimal
from threading import RLock
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    require_role,
    verify_password,
)
from .database import Base, SessionLocal, engine, get_session
from .models import HourlyRate, ParkingSpot, ParkingTicket, Transaction, User
from .schemas import (
    CheckInRequest,
    CheckoutRequest,
    CheckoutResponse,
    CreateSpotRequest,
    LoginRequest,
    RatesResponse,
    SpotResponse,
    StatsResponse,
    TicketResponse,
    TokenResponse,
    TransactionResponse,
    UpdateRatesRequest,
    UserResponse,
)
from .services import (
    check_in,
    checkout,
    get_hourly_rates,
    log_transaction,
    now_utc,
    recommend_spot,
)

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


def seed_users() -> None:
    with SessionLocal() as session:
        if session.scalar(select(func.count()).select_from(User)):
            return
        default_users = [
            User(
                id=str(uuid4()),
                username="admin",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                full_name="System Admin",
            ),
            User(
                id=str(uuid4()),
                username="attendant",
                hashed_password=get_password_hash("attendant123"),
                role="attendant",
                full_name="Parking Attendant",
            ),
        ]
        session.add_all(default_users)
        session.commit()


def seed_rates() -> None:
    with SessionLocal() as session:
        if session.scalar(select(func.count()).select_from(HourlyRate)):
            return
        default_rates = [
            HourlyRate(vehicle_type="standard", rate_per_hour=Decimal("40.00")),
            HourlyRate(vehicle_type="ev", rate_per_hour=Decimal("70.00")),
            HourlyRate(vehicle_type="accessible", rate_per_hour=Decimal("30.00")),
        ]
        session.add_all(default_rates)
        session.commit()


def seed_transactions() -> None:
    with SessionLocal() as session:
        if session.scalar(select(func.count()).select_from(Transaction)):
            return
        tickets = session.scalars(select(ParkingTicket).order_by(ParkingTicket.checked_in_at)).all()
        for t in tickets:
            session.add(
                Transaction(
                    id=str(uuid4()),
                    timestamp=t.checked_in_at,
                    action="CHECK_IN",
                    license_plate=t.license_plate,
                    spot_id=t.spot_id,
                    amount=None,
                    performed_by="attendant",
                    details=f"Historical ticket: Vehicle {t.license_plate} ({t.vehicle_type}) checked into spot {t.spot_id}.",
                )
            )
            if t.checked_out_at and t.amount_paid is not None:
                session.add(
                    Transaction(
                        id=str(uuid4()),
                        timestamp=t.checked_out_at,
                        action="CHECK_OUT",
                        license_plate=t.license_plate,
                        spot_id=t.spot_id,
                        amount=t.amount_paid,
                        performed_by="attendant",
                        details=f"Historical ticket: Vehicle {t.license_plate} checked out from spot {t.spot_id}. Paid ₹{t.amount_paid:.2f}.",
                    )
                )
        session.add(
            Transaction(
                id=str(uuid4()),
                timestamp=now_utc(),
                action="SYSTEM_INIT",
                license_plate=None,
                spot_id=None,
                amount=None,
                performed_by="system",
                details="System initialized with default hourly rates: Standard ₹40/hr, EV ₹70/hr, Accessible ₹30/hr.",
            )
        )
        session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_spots()
    seed_users()
    seed_rates()
    seed_transactions()
    yield


app = FastAPI(title="Parkwise Parking API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
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


# --- Authentication Endpoints ---

@app.post("/api/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.scalar(select(User).where(User.username == request.username))
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            username=user.username,
            role=user.role,
            full_name=user.full_name,
        ),
    )


@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        username=current_user.username,
        role=current_user.role,
        full_name=current_user.full_name,
    )


# --- Rates Endpoints ---

@app.get("/api/rates", response_model=RatesResponse)
def get_rates(session: Session = Depends(get_session)) -> RatesResponse:
    """Public endpoint: Allows drivers and attendants to view current hourly parking rates."""
    rates = get_hourly_rates(session)
    return RatesResponse(
        standard=float(rates["standard"]),
        ev=float(rates["ev"]),
        accessible=float(rates["accessible"]),
    )


@app.put("/api/rates", response_model=RatesResponse)
@app.post("/api/rates", response_model=RatesResponse)
def update_rates(
    request: UpdateRatesRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("admin")),
) -> RatesResponse:
    """Protected endpoint: Only Admin can change ticket hourly rates."""
    with write_lock:
        rates_map = {
            "standard": Decimal(str(request.standard)).quantize(Decimal("0.01")),
            "ev": Decimal(str(request.ev)).quantize(Decimal("0.01")),
            "accessible": Decimal(str(request.accessible)).quantize(Decimal("0.01")),
        }
        for vehicle_type, new_rate in rates_map.items():
            rate_obj = session.get(HourlyRate, vehicle_type)
            if rate_obj:
                rate_obj.rate_per_hour = new_rate
            else:
                session.add(HourlyRate(vehicle_type=vehicle_type, rate_per_hour=new_rate))
        log_transaction(
            session=session,
            action="RATE_UPDATE",
            details=f"Admin {current_user.username} updated rates: Standard ₹{rates_map['standard']}/hr, EV ₹{rates_map['ev']}/hr, Accessible ₹{rates_map['accessible']}/hr.",
            performed_by=current_user.username,
        )
        session.commit()
        return RatesResponse(
            standard=float(rates_map["standard"]),
            ev=float(rates_map["ev"]),
            accessible=float(rates_map["accessible"]),
        )


# --- Spots Endpoints ---

@app.get("/api/spots", response_model=list[SpotResponse])
def list_spots(session: Session = Depends(get_session)) -> list[SpotResponse]:
    """Public endpoint: Allows drivers and visitors to view parking spot availability."""
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


@app.post("/api/spots", response_model=SpotResponse, status_code=status.HTTP_201_CREATED)
def create_spot(
    request: CreateSpotRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("admin")),
) -> SpotResponse:
    """Protected endpoint: Only Admin can create new parking spots."""
    with write_lock:
        existing = session.get(ParkingSpot, request.id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Parking spot {request.id} already exists.",
            )

        spot = ParkingSpot(
            id=request.id,
            zone=request.zone,
            spot_type=request.spot_type,
            row=request.row,
            column=request.column,
            status="available",
        )
        session.add(spot)
        log_transaction(
            session=session,
            action="SPOT_CREATE",
            details=f"Admin {current_user.username} created spot {spot.id} in {spot.zone} ({spot.spot_type}).",
            spot_id=spot.id,
            performed_by=current_user.username,
        )
        session.commit()
        session.refresh(spot)
        return SpotResponse(
            id=spot.id,
            zone=spot.zone,
            spot_type=spot.spot_type,
            row=spot.row,
            column=spot.column,
            status=spot.status,
        )


@app.get("/api/spots/recommendation")
def get_recommendation(
    vehicle_type: str = Query(pattern="^(standard|ev|accessible)$"),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    return {"spot_id": recommend_spot(session, vehicle_type).id}


# --- Check-in and Checkout Endpoints ---

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
    current_user: User = Depends(require_role("admin", "attendant")),
) -> CheckoutResponse:
    """Protected endpoint: Only Attendants or Admins can process vehicle checkout."""
    with write_lock:
        ticket, duration_minutes, amount = checkout(
            session,
            request.ticket_id,
            request.checked_out_at,
            performed_by=current_user.username,
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


@app.get("/api/transactions", response_model=list[TransactionResponse])
def list_transactions(
    limit: int = Query(50, ge=1, le=500),
    action: str | None = None,
    q: str | None = None,
    session: Session = Depends(get_session),
) -> list[TransactionResponse]:
    """Public / Attendant / Admin endpoint: View transaction and audit logs."""
    stmt = select(Transaction).order_by(Transaction.timestamp.desc())
    if action and action.strip():
        stmt = stmt.where(Transaction.action == action.strip().upper())
    if q and q.strip():
        term = f"%{q.strip().upper()}%"
        raw_term = f"%{q.strip()}%"
        stmt = stmt.where(
            Transaction.license_plate.ilike(term)
            | Transaction.details.ilike(raw_term)
            | Transaction.performed_by.ilike(raw_term)
            | Transaction.spot_id.ilike(term)
        )
    stmt = stmt.limit(limit)
    records = session.scalars(stmt).all()
    return [
        TransactionResponse(
            id=r.id,
            timestamp=r.timestamp,
            action=r.action,
            license_plate=r.license_plate,
            spot_id=r.spot_id,
            amount=float(r.amount) if r.amount is not None else None,
            performed_by=r.performed_by,
            details=r.details,
        )
        for r in records
    ]

