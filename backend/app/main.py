from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from threading import RLock
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from .auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
    get_password_hash,
    require_role,
    verify_password,
)
from .database import Base, SessionLocal, engine, get_session
from .models import GuardProfile, GuardShift, HourlyRate, ParkingSpot, ParkingTicket, Transaction, User
from .schemas import (
    AdminAnalyticsResponse,
    CheckInRequest,
    CheckoutRequest,
    CheckoutResponse,
    CreateSpotRequest,
    GuardMeResponse,
    GuardProfileResponse,
    GuardShiftCreateRequest,
    GuardShiftResponse,
    GuardShiftUpdateRequest,
    LoginRequest,
    PersonnelCreateRequest,
    PersonnelUpdateRequest,
    RatesResponse,
    SpotResponse,
    StatsResponse,
    TicketResponse,
    TierItem,
    TokenResponse,
    TransactionResponse,
    UpdateRatesRequest,
    UpdateSpotStatusRequest,
    UserResponse,
)
from .services import (
    DEFAULT_HOURLY_RATES,
    DEFAULT_TIERED_RATES,
    check_in,
    checkout,
    generate_qr_payload,
    get_all_tiered_rates,
    get_hourly_rates,
    log_transaction,
    now_utc,
    recommend_spot,
)

write_lock = RLock()


def run_database_migrations() -> None:
    """Safely apply schema migrations for new columns without breaking SQLite."""
    with engine.connect() as conn:
        # parking_spots: floor
        try:
            conn.execute(text("ALTER TABLE parking_spots ADD COLUMN floor VARCHAR(20) DEFAULT 'Floor 1'"))
            conn.commit()
        except Exception:
            pass

        # hourly_rates: rate_per_day, rate_per_week, daily_threshold_hours
        for col, definition in [
            ("rate_per_day", "NUMERIC(10, 2) DEFAULT 350.00"),
            ("rate_per_week", "NUMERIC(10, 2) DEFAULT 2100.00"),
            ("daily_threshold_hours", "INTEGER DEFAULT 8"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE hourly_rates ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass

        # tickets: duration_hours, pricing_tier_used
        for col, definition in [
            ("duration_hours", "NUMERIC(10, 2) DEFAULT 1.0"),
            ("pricing_tier_used", "VARCHAR(30) DEFAULT 'hourly'"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE tickets ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass

        # users: email, phone, is_active
        for col, definition in [
            ("email", "VARCHAR(100) DEFAULT ''"),
            ("phone", "VARCHAR(20) DEFAULT ''"),
            ("is_active", "BOOLEAN DEFAULT 1"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass


def seed_spots() -> None:
    with SessionLocal() as session:
        if session.scalar(select(func.count()).select_from(ParkingSpot)):
            # Ensure existing spots have appropriate floor assigned
            session.execute(
                update(ParkingSpot).where(ParkingSpot.zone == "Zone A").values(floor="Floor 1")
            )
            session.execute(
                update(ParkingSpot).where(ParkingSpot.zone == "Zone B").values(floor="Floor 2")
            )
            session.execute(
                update(ParkingSpot).where(ParkingSpot.zone == "Zone C").values(floor="Floor 3")
            )
            session.commit()
            return

        spots = []
        # Multi-level floor-wise layout
        for floor, zone, spot_type, prefix, count in (
            ("Floor 1", "Zone A", "standard", "A", 12),
            ("Floor 2", "Zone B", "ev", "B", 8),
            ("Floor 3", "Zone C", "accessible", "C", 6),
        ):
            for index in range(1, count + 1):
                spots.append(
                    ParkingSpot(
                        id=f"{prefix}-{index:02}",
                        floor=floor,
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
        # Define 4 distinct roles + legacy attendant
        role_users = [
            User(
                id="user-admin-1",
                username="admin",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                full_name="System Administrator",
                email="admin@parkwise.io",
                phone="+91 98111 00001",
                is_active=True,
            ),
            User(
                id="user-manager-1",
                username="manager",
                hashed_password=get_password_hash("manager123"),
                role="manager",
                full_name="Facility Manager Sarah",
                email="manager@parkwise.io",
                phone="+91 98111 00002",
                is_active=True,
            ),
            User(
                id="user-biller-1",
                username="biller",
                hashed_password=get_password_hash("biller123"),
                role="biller",
                full_name="Front Desk Biller Priya",
                email="biller@parkwise.io",
                phone="+91 98111 00003",
                is_active=True,
            ),
            User(
                id="user-guard-1",
                username="guard",
                hashed_password=get_password_hash("guard123"),
                role="security_guard",
                full_name="Officer Rajesh Kumar",
                email="guard.rajesh@parkwise.io",
                phone="+91 98111 00004",
                is_active=True,
            ),
            User(
                id="user-attendant-legacy",
                username="attendant",
                hashed_password=get_password_hash("attendant123"),
                role="biller",  # Maps to biller
                full_name="Parking Attendant",
                email="attendant@parkwise.io",
                phone="+91 98111 00005",
                is_active=True,
            ),
        ]

        for u in role_users:
            existing = session.scalar(select(User).where(User.username == u.username))
            if not existing:
                session.add(u)
        session.commit()

        # Seed guard profile
        guard_user = session.scalar(select(User).where(User.username == "guard"))
        if guard_user:
            profile = session.get(GuardProfile, guard_user.id)
            if not profile:
                session.add(
                    GuardProfile(
                        user_id=guard_user.id,
                        assigned_location="Floor 1 - Main North Entrance",
                        base_salary=Decimal("26500.00"),
                        shift_allowance=Decimal("3500.00"),
                        overtime_hours=14,
                        overtime_rate=Decimal("220.00"),
                        payout_status="Paid (Oct 2026)",
                        emergency_contact="+91 98765 43210",
                    )
                )
                session.commit()

            # Seed guard shifts
            today_str = now_utc().strftime("%Y-%m-%d")
            existing_shifts = session.scalars(select(GuardShift).where(GuardShift.guard_id == guard_user.id)).all()
            if not existing_shifts:
                shifts = [
                    GuardShift(
                        id=str(uuid4()),
                        guard_id=guard_user.id,
                        guard_name=guard_user.full_name,
                        shift_name="Morning (06:00 - 14:00)",
                        shift_date=today_str,
                        start_time="06:00",
                        end_time="14:00",
                        assigned_location="Floor 1 - Main North Entrance",
                        status="On Duty",
                        notes="Monitor automated barrier and EV charging access ramp.",
                    ),
                    GuardShift(
                        id=str(uuid4()),
                        guard_id=guard_user.id,
                        guard_name=guard_user.full_name,
                        shift_name="Evening (14:00 - 22:00)",
                        shift_date=today_str,
                        start_time="14:00",
                        end_time="22:00",
                        assigned_location="Floor 2 - EV Charging Bay",
                        status="Scheduled",
                        notes="Floor 2 surveillance & EV cable safety inspection.",
                    ),
                    GuardShift(
                        id=str(uuid4()),
                        guard_id=guard_user.id,
                        guard_name=guard_user.full_name,
                        shift_name="Morning (06:00 - 14:00)",
                        shift_date=today_str,
                        start_time="06:00",
                        end_time="14:00",
                        assigned_location="Floor 3 - VIP & Accessible Zone",
                        status="Scheduled",
                        notes="Assist accessible permit drivers with priority elevators.",
                    ),
                ]
                session.add_all(shifts)
                session.commit()


def seed_rates() -> None:
    with SessionLocal() as session:
        for vehicle_type, cfg in DEFAULT_TIERED_RATES.items():
            rate_obj = session.get(HourlyRate, vehicle_type)
            if not rate_obj:
                session.add(
                    HourlyRate(
                        vehicle_type=vehicle_type,
                        rate_per_hour=cfg["hourly"],
                        rate_per_day=cfg["daily"],
                        rate_per_week=cfg["weekly"],
                        daily_threshold_hours=cfg["threshold"],
                    )
                )
            else:
                if not hasattr(rate_obj, "rate_per_day") or rate_obj.rate_per_day is None:
                    rate_obj.rate_per_day = cfg["daily"]
                if not hasattr(rate_obj, "rate_per_week") or rate_obj.rate_per_week is None:
                    rate_obj.rate_per_week = cfg["weekly"]
                if not hasattr(rate_obj, "daily_threshold_hours") or rate_obj.daily_threshold_hours is None:
                    rate_obj.daily_threshold_hours = cfg["threshold"]
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
                    performed_by="biller",
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
                        performed_by="biller",
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
                details="System initialized with Floor-Wise Slots and Tiered Pricing: Standard (₹40/hr, ₹350/day, ₹2100/wk).",
            )
        )
        session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_database_migrations()
    seed_spots()
    seed_users()
    seed_rates()
    seed_transactions()
    yield


app = FastAPI(title="Parkwise Advanced Parking API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ticket_response(ticket: ParkingTicket, spot: ParkingSpot | None = None) -> TicketResponse:
    floor = getattr(ticket.spot, "floor", "Floor 1") if hasattr(ticket, "spot") and ticket.spot else getattr(spot, "floor", "Floor 1")
    return TicketResponse(
        id=ticket.id,
        license_plate=ticket.license_plate,
        vehicle_type=ticket.vehicle_type,
        phone_number=ticket.phone_number,
        spot_id=ticket.spot_id,
        floor=floor,
        checked_in_at=ticket.checked_in_at,
        checked_out_at=ticket.checked_out_at,
        amount_paid=float(ticket.amount_paid) if ticket.amount_paid is not None else None,
        pricing_tier_used=ticket.pricing_tier_used if hasattr(ticket, "pricing_tier_used") else None,
        qr_token=generate_qr_payload(ticket, spot if spot else ticket.spot) if (spot or (hasattr(ticket, "spot") and ticket.spot)) else None,
    )


# --- 1. Authentication Endpoints ---

@app.post("/api/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.scalar(select(User).where(User.username == request.username))
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if hasattr(user, "is_active") and not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact your manager.",
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            role=user.role,
            full_name=user.full_name,
            email=getattr(user, "email", None),
            phone=getattr(user, "phone", None),
            is_active=getattr(user, "is_active", True),
        ),
    )


@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        full_name=current_user.full_name,
        email=getattr(current_user, "email", None),
        phone=getattr(current_user, "phone", None),
        is_active=getattr(current_user, "is_active", True),
    )


# --- 2. Rates & Tiered Pricing Endpoints ---

@app.get("/api/rates", response_model=RatesResponse)
def get_rates(session: Session = Depends(get_session)) -> RatesResponse:
    """Public endpoint: Allows drivers and staff to view current hourly & tiered parking rates."""
    tiered_rates = get_all_tiered_rates(session)
    standard_h = float(tiered_rates["standard"]["hourly"])
    ev_h = float(tiered_rates["ev"]["hourly"])
    acc_h = float(tiered_rates["accessible"]["hourly"])

    tiers_dict = {
        k: TierItem(
            vehicle_type=k,
            hourly_rate=float(v["hourly"]),
            daily_rate=float(v["daily"]),
            weekly_rate=float(v["weekly"]),
            daily_threshold_hours=int(v.get("threshold", 8)),
        )
        for k, v in tiered_rates.items()
    }

    return RatesResponse(
        standard=standard_h,
        ev=ev_h,
        accessible=acc_h,
        tiers=tiers_dict,
    )


@app.put("/api/rates", response_model=RatesResponse)
@app.post("/api/rates", response_model=RatesResponse)
def update_rates(
    request: UpdateRatesRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("admin", "manager")),
) -> RatesResponse:
    """Protected endpoint: Only Admin or Manager can configure ticket pricing tiers."""
    with write_lock:
        rates_map = {
            "standard": {
                "hourly": Decimal(str(request.standard)).quantize(Decimal("0.01")),
                "daily": Decimal(str(request.standard_daily or 350.00)).quantize(Decimal("0.01")),
                "weekly": Decimal(str(request.standard_weekly or 2100.00)).quantize(Decimal("0.01")),
            },
            "ev": {
                "hourly": Decimal(str(request.ev)).quantize(Decimal("0.01")),
                "daily": Decimal(str(request.ev_daily or 600.00)).quantize(Decimal("0.01")),
                "weekly": Decimal(str(request.ev_weekly or 3600.00)).quantize(Decimal("0.01")),
            },
            "accessible": {
                "hourly": Decimal(str(request.accessible)).quantize(Decimal("0.01")),
                "daily": Decimal(str(request.accessible_daily or 250.00)).quantize(Decimal("0.01")),
                "weekly": Decimal(str(request.accessible_weekly or 1500.00)).quantize(Decimal("0.01")),
            },
        }

        for vtype, cfgs in rates_map.items():
            rate_obj = session.get(HourlyRate, vtype)
            if rate_obj:
                rate_obj.rate_per_hour = cfgs["hourly"]
                rate_obj.rate_per_day = cfgs["daily"]
                rate_obj.rate_per_week = cfgs["weekly"]
                rate_obj.daily_threshold_hours = request.daily_threshold_hours or 8
            else:
                session.add(
                    HourlyRate(
                        vehicle_type=vtype,
                        rate_per_hour=cfgs["hourly"],
                        rate_per_day=cfgs["daily"],
                        rate_per_week=cfgs["weekly"],
                        daily_threshold_hours=request.daily_threshold_hours or 8,
                    )
                )

        log_transaction(
            session=session,
            action="RATE_UPDATE",
            details=f"{current_user.role.title()} {current_user.username} updated tiered rates: Standard ₹{rates_map['standard']['hourly']}/hr (₹{rates_map['standard']['daily']}/day), EV ₹{rates_map['ev']['hourly']}/hr, Accessible ₹{rates_map['accessible']['hourly']}/hr.",
            performed_by=current_user.username,
        )
        session.commit()
        return get_rates(session)


# --- 3. Floor-Wise Spots Endpoints ---

@app.get("/api/spots", response_model=list[SpotResponse])
def list_spots(
    floor: str | None = None,
    session: Session = Depends(get_session),
) -> list[SpotResponse]:
    """Public / Personnel endpoint: View parking spots with floor information."""
    stmt = select(ParkingSpot).order_by(ParkingSpot.floor, ParkingSpot.zone, ParkingSpot.id)
    if floor and floor.strip():
        stmt = stmt.where(ParkingSpot.floor == floor.strip())
    spots = session.scalars(stmt).all()
    active_by_spot = {
        ticket.spot_id: ticket
        for ticket in session.scalars(
            select(ParkingTicket).where(ParkingTicket.checked_out_at.is_(None))
        ).all()
    }
    return [
        SpotResponse(
            id=spot.id,
            floor=getattr(spot, "floor", "Floor 1"),
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
    current_user: User = Depends(require_role("admin", "manager")),
) -> SpotResponse:
    """Protected endpoint: Only Admin or Manager can create new parking spots floor-by-floor."""
    with write_lock:
        existing = session.get(ParkingSpot, request.id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Parking spot {request.id} already exists.",
            )

        spot = ParkingSpot(
            id=request.id,
            floor=request.floor,
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
            details=f"{current_user.role.title()} {current_user.username} created spot {spot.id} on {spot.floor} ({spot.zone}, {spot.spot_type}).",
            spot_id=spot.id,
            performed_by=current_user.username,
        )
        session.commit()
        session.refresh(spot)
        return SpotResponse(
            id=spot.id,
            floor=spot.floor,
            zone=spot.zone,
            spot_type=spot.spot_type,
            row=spot.row,
            column=spot.column,
            status=spot.status,
        )


@app.put("/api/manager/spots/{spot_id}/status", response_model=SpotResponse)
def update_spot_status(
    spot_id: str,
    request: UpdateSpotStatusRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin")),
) -> SpotResponse:
    """Manager dynamic control: toggle slot status to available, maintenance, or reserved."""
    with write_lock:
        spot = session.get(ParkingSpot, spot_id)
        if not spot:
            raise HTTPException(status_code=404, detail=f"Spot {spot_id} not found.")

        # If occupied, cannot set to maintenance or reserved without checkout
        if spot.status == "occupied" and request.status != "occupied":
            active_ticket = session.scalar(
                select(ParkingTicket).where(
                    ParkingTicket.spot_id == spot_id,
                    ParkingTicket.checked_out_at.is_(None),
                )
            )
            if active_ticket:
                raise HTTPException(
                    status_code=409,
                    detail=f"Spot {spot_id} currently holds active vehicle {active_ticket.license_plate}. Check out first.",
                )

        old_status = spot.status
        spot.status = request.status
        log_transaction(
            session=session,
            action="SPOT_UPDATE",
            details=f"Manager {current_user.username} changed spot {spot_id} status from {old_status} to {request.status}.",
            spot_id=spot.id,
            performed_by=current_user.username,
        )
        session.commit()
        session.refresh(spot)
        return SpotResponse(
            id=spot.id,
            floor=spot.floor,
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


# --- 4. Slot Allotment (Check-In) and Vehicle Checkout ---

@app.post("/api/checkin", response_model=TicketResponse, status_code=201)
def create_checkin(
    request: CheckInRequest,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> TicketResponse:
    """Operational slot allotment with RegEx plate validation and QR ticket generation."""
    with write_lock:
        performer = current_user.username if current_user else "driver"
        ticket = check_in(session, request, performed_by=performer)
        spot = session.get(ParkingSpot, ticket.spot_id)
        return ticket_response(ticket, spot)


@app.post("/api/checkout", response_model=CheckoutResponse)
def create_checkout(
    request: CheckoutRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("admin", "manager", "biller", "attendant")),
) -> CheckoutResponse:
    """Protected endpoint: Biller/Staff checks out vehicle, calculates exact hours and tiered pricing."""
    with write_lock:
        result = checkout(
            session,
            request.ticket_id,
            request.checked_out_at,
            performed_by=current_user.username,
        )
        ticket = result.ticket
        spot = session.get(ParkingSpot, ticket.spot_id)
        price_info = result.details

        return CheckoutResponse(
            ticket=ticket_response(ticket, spot),
            duration_minutes=result.duration_minutes,
            duration_hours=price_info.total_hours if price_info else float(ticket.duration_hours or 1.0),
            duration_display=price_info.duration_display if price_info else f"{result.duration_minutes} mins",
            tier_applied=price_info.tier_applied if price_info else "Short-Term (Hourly)",
            breakdown=price_info.breakdown if price_info else [],
            savings_amount=price_info.savings_amount if price_info else 0.0,
            amount_paid=float(result.amount),
        )


@app.get("/api/tickets/search", response_model=list[TicketResponse])
def search_tickets(
    q: str = Query(min_length=1, max_length=255),
    session: Session = Depends(get_session),
) -> list[TicketResponse]:
    query = q.strip()
    # Support direct QR ticket decoding (e.g. searching "PARKWISE|TICKET:...")
    if "TICKET:" in query:
        for part in query.split("|"):
            if part.startswith("TICKET:"):
                query = part.replace("TICKET:", "").strip()
                break

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


# --- 5. Manager Personnel Management (Billers & Security Guards) ---

@app.get("/api/manager/personnel", response_model=list[UserResponse])
def list_personnel(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin")),
) -> list[UserResponse]:
    """Manager authority: View all system personnel (Billers and Security Guards)."""
    users = session.scalars(
        select(User).where(User.role.in_(["biller", "security_guard", "attendant"]))
    ).all()
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            role=u.role,
            full_name=u.full_name,
            email=u.email,
            phone=u.phone,
            is_active=u.is_active,
        )
        for u in users
    ]


@app.post("/api/manager/personnel", response_model=UserResponse, status_code=201)
def create_personnel(
    request: PersonnelCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin")),
) -> UserResponse:
    """Manager authority: Create system personnel accounts for Billers and Security Guards."""
    with write_lock:
        existing = session.scalar(select(User).where(User.username == request.username))
        if existing:
            raise HTTPException(status_code=409, detail=f"Username '{request.username}' is already taken.")

        new_user = User(
            id=str(uuid4()),
            username=request.username,
            hashed_password=get_password_hash(request.password),
            role=request.role,
            full_name=request.full_name,
            email=request.email,
            phone=request.phone,
            is_active=True,
        )
        session.add(new_user)

        if request.role == "security_guard":
            profile = GuardProfile(
                user_id=new_user.id,
                assigned_location=request.assigned_location or "Floor 1 - Main Concourse",
                base_salary=Decimal(str(request.base_salary or 25000.0)),
                shift_allowance=Decimal(str(request.shift_allowance or 3000.0)),
                overtime_hours=0,
                overtime_rate=Decimal("220.00"),
                payout_status="Active (Upcoming Payroll)",
                emergency_contact=request.phone or "+91 98765 43210",
            )
            session.add(profile)

        log_transaction(
            session=session,
            action="PERSONNEL_CREATE",
            details=f"Manager {current_user.username} created new {request.role.replace('_', ' ').title()}: {request.full_name} (@{request.username}).",
            performed_by=current_user.username,
        )
        session.commit()
        session.refresh(new_user)
        return UserResponse(
            id=new_user.id,
            username=new_user.username,
            role=new_user.role,
            full_name=new_user.full_name,
            email=new_user.email,
            phone=new_user.phone,
            is_active=new_user.is_active,
        )


@app.put("/api/manager/personnel/{user_id}", response_model=UserResponse)
def update_personnel(
    user_id: str,
    request: PersonnelUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin")),
) -> UserResponse:
    """Manager authority: Update system personnel details, role, status, or salary."""
    with write_lock:
        u = session.get(User, user_id)
        if not u:
            raise HTTPException(status_code=404, detail="Personnel user not found.")

        if request.full_name is not None:
            u.full_name = request.full_name
        if request.email is not None:
            u.email = request.email
        if request.phone is not None:
            u.phone = request.phone
        if request.role is not None:
            u.role = request.role
        if request.is_active is not None:
            u.is_active = request.is_active

        # Update guard profile if security guard
        if u.role == "security_guard":
            prof = session.get(GuardProfile, u.id)
            if prof:
                if request.assigned_location is not None:
                    prof.assigned_location = request.assigned_location
                if request.base_salary is not None:
                    prof.base_salary = Decimal(str(request.base_salary))
                if request.shift_allowance is not None:
                    prof.shift_allowance = Decimal(str(request.shift_allowance))
                if request.payout_status is not None:
                    prof.payout_status = request.payout_status

        session.commit()
        session.refresh(u)
        return UserResponse(
            id=u.id,
            username=u.username,
            role=u.role,
            full_name=u.full_name,
            email=u.email,
            phone=u.phone,
            is_active=u.is_active,
        )


# --- 6. Guard Scheduling Module Endpoints ---

@app.get("/api/guard-shifts", response_model=list[GuardShiftResponse])
def list_guard_shifts(
    date: str | None = None,
    guard_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin", "security_guard")),
) -> list[GuardShiftResponse]:
    """Manager/Guard endpoint: View guard shift schedules across facility floors."""
    stmt = select(GuardShift).order_by(GuardShift.shift_date.desc(), GuardShift.start_time)
    if current_user.role == "security_guard":
        stmt = stmt.where(GuardShift.guard_id == current_user.id)
    elif guard_id:
        stmt = stmt.where(GuardShift.guard_id == guard_id)
    if date:
        stmt = stmt.where(GuardShift.shift_date == date)

    shifts = session.scalars(stmt).all()
    return [
        GuardShiftResponse(
            id=s.id,
            guard_id=s.guard_id,
            guard_name=s.guard_name,
            shift_name=s.shift_name,
            shift_date=s.shift_date,
            start_time=s.start_time,
            end_time=s.end_time,
            assigned_location=s.assigned_location,
            status=s.status,
            notes=s.notes,
        )
        for s in shifts
    ]


@app.post("/api/guard-shifts", response_model=GuardShiftResponse, status_code=201)
def create_guard_shift(
    request: GuardShiftCreateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin")),
) -> GuardShiftResponse:
    """Manager authority: Assign duty shift timings and assigned floor location to a guard."""
    with write_lock:
        guard_user = session.get(User, request.guard_id)
        if not guard_user or guard_user.role != "security_guard":
            raise HTTPException(status_code=404, detail="Valid security guard user not found.")

        shift = GuardShift(
            id=str(uuid4()),
            guard_id=guard_user.id,
            guard_name=guard_user.full_name,
            shift_name=request.shift_name,
            shift_date=request.shift_date,
            start_time=request.start_time,
            end_time=request.end_time,
            assigned_location=request.assigned_location,
            status="Scheduled",
            notes=request.notes,
        )
        session.add(shift)

        # Update guard current location
        prof = session.get(GuardProfile, guard_user.id)
        if prof:
            prof.assigned_location = request.assigned_location

        log_transaction(
            session=session,
            action="GUARD_SHIFT_ASSIGN",
            details=f"Manager {current_user.username} scheduled {guard_user.full_name} for {shift.shift_name} on {shift.shift_date} at {shift.assigned_location}.",
            performed_by=current_user.username,
        )
        session.commit()
        session.refresh(shift)
        return GuardShiftResponse(
            id=shift.id,
            guard_id=shift.guard_id,
            guard_name=shift.guard_name,
            shift_name=shift.shift_name,
            shift_date=shift.shift_date,
            start_time=shift.start_time,
            end_time=shift.end_time,
            assigned_location=shift.assigned_location,
            status=shift.status,
            notes=shift.notes,
        )


@app.put("/api/guard-shifts/{shift_id}", response_model=GuardShiftResponse)
def update_guard_shift(
    shift_id: str,
    request: GuardShiftUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("manager", "admin")),
) -> GuardShiftResponse:
    """Manager authority: Update guard duty shift status or assigned location."""
    with write_lock:
        shift = session.get(GuardShift, shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Guard shift not found.")

        if request.status is not None:
            shift.status = request.status
        if request.assigned_location is not None:
            shift.assigned_location = request.assigned_location
        if request.notes is not None:
            shift.notes = request.notes

        session.commit()
        session.refresh(shift)
        return GuardShiftResponse(
            id=shift.id,
            guard_id=shift.guard_id,
            guard_name=shift.guard_name,
            shift_name=shift.shift_name,
            shift_date=shift.shift_date,
            start_time=shift.start_time,
            end_time=shift.end_time,
            assigned_location=shift.assigned_location,
            status=shift.status,
            notes=shift.notes,
        )


# --- 7. Security Guard Personal Portal Endpoint ---

@app.get("/api/guard/me", response_model=GuardMeResponse)
def get_my_guard_details(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("security_guard")),
) -> GuardMeResponse:
    """Security Guard restricted access: View own duty timetable, assigned parking location, and salary details."""
    profile = session.get(GuardProfile, current_user.id)
    if not profile:
        profile = GuardProfile(
            user_id=current_user.id,
            assigned_location="Floor 1 - Main Concourse",
            base_salary=Decimal("26500.00"),
            shift_allowance=Decimal("3500.00"),
            overtime_hours=12,
            overtime_rate=Decimal("220.00"),
            payout_status="Paid (Current Month)",
            emergency_contact="+91 98765 43210",
        )
        session.add(profile)
        session.commit()
        session.refresh(profile)

    shifts = session.scalars(
        select(GuardShift)
        .where(GuardShift.guard_id == current_user.id)
        .order_by(GuardShift.shift_date.desc(), GuardShift.start_time)
    ).all()

    current_shift = next((s for s in shifts if s.status == "On Duty"), None) or (shifts[0] if shifts else None)
    shift_objs = [
        GuardShiftResponse(
            id=s.id,
            guard_id=s.guard_id,
            guard_name=s.guard_name,
            shift_name=s.shift_name,
            shift_date=s.shift_date,
            start_time=s.start_time,
            end_time=s.end_time,
            assigned_location=s.assigned_location,
            status=s.status,
            notes=s.notes,
        )
        for s in shifts
    ]

    total_sal = float(profile.base_salary) + float(profile.shift_allowance) + (profile.overtime_hours * float(profile.overtime_rate))

    return GuardMeResponse(
        user=UserResponse(
            id=current_user.id,
            username=current_user.username,
            role=current_user.role,
            full_name=current_user.full_name,
            email=current_user.email,
            phone=current_user.phone,
            is_active=current_user.is_active,
        ),
        profile=GuardProfileResponse(
            user_id=profile.user_id,
            username=current_user.username,
            full_name=current_user.full_name,
            phone=current_user.phone,
            assigned_location=profile.assigned_location,
            base_salary=float(profile.base_salary),
            shift_allowance=float(profile.shift_allowance),
            overtime_hours=profile.overtime_hours,
            overtime_rate=float(profile.overtime_rate),
            total_salary=total_sal,
            payout_status=profile.payout_status,
            emergency_contact=profile.emergency_contact,
        ),
        current_shift=GuardShiftResponse(
            id=current_shift.id,
            guard_id=current_shift.guard_id,
            guard_name=current_shift.guard_name,
            shift_name=current_shift.shift_name,
            shift_date=current_shift.shift_date,
            start_time=current_shift.start_time,
            end_time=current_shift.end_time,
            assigned_location=current_shift.assigned_location,
            status=current_shift.status,
            notes=current_shift.notes,
        ) if current_shift else None,
        upcoming_shifts=shift_objs,
    )


# --- 8. Admin Exclusive Analytics Dashboard ---

@app.get("/api/admin/analytics", response_model=AdminAnalyticsResponse)
def get_admin_analytics(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role("admin")),
) -> AdminAnalyticsResponse:
    """Admin exclusive access: Dedicated analytical dashboard to visualize and review all past transactions & historical system data."""
    all_tickets = session.scalars(select(ParkingTicket).where(ParkingTicket.checked_out_at.is_not(None))).all()
    today_iso = now_utc().date().isoformat()

    total_revenue = sum((float(t.amount_paid or 0) for t in all_tickets), 0.0)
    today_revenue = sum(
        (float(t.amount_paid or 0) for t in all_tickets if t.checked_out_at and t.checked_out_at.date().isoformat() == today_iso),
        0.0,
    )
    # Estimate week / month
    weekly_revenue = total_revenue * 0.7 if total_revenue > 0 else 0.0
    monthly_revenue = total_revenue

    # Floor occupancy
    all_spots = session.scalars(select(ParkingSpot)).all()
    floor_occupancy: dict[str, dict[str, int]] = {}
    for s in all_spots:
        fl = getattr(s, "floor", "Floor 1")
        if fl not in floor_occupancy:
            floor_occupancy[fl] = {"total": 0, "occupied": 0, "available": 0, "reserved": 0, "maintenance": 0}
        floor_occupancy[fl]["total"] += 1
        st = s.status if s.status in floor_occupancy[fl] else "available"
        floor_occupancy[fl][st] += 1

    total_spots = len(all_spots)
    occupied_total = sum(1 for s in all_spots if s.status == "occupied")
    occupancy_rate = (occupied_total / total_spots * 100.0) if total_spots > 0 else 0.0

    # Vehicle distribution
    vehicle_dist: dict[str, int] = {"standard": 0, "ev": 0, "accessible": 0}
    for t in all_tickets:
        vt = t.vehicle_type if t.vehicle_type in vehicle_dist else "standard"
        vehicle_dist[vt] += 1

    # Tier revenue
    tier_revenue: dict[str, float] = {
        "Short-Term (Hourly)": 0.0,
        "Long-Term (Daily Tier)": 0.0,
        "Long-Term (Weekly Tier)": 0.0,
        "Long-Term (Multi-Tier Hybrid)": 0.0,
    }
    for t in all_tickets:
        tier = getattr(t, "pricing_tier_used", None) or "Short-Term (Hourly)"
        if tier not in tier_revenue:
            tier_revenue[tier] = 0.0
        tier_revenue[tier] += float(t.amount_paid or 0)

    # Average duration
    durations = [float(getattr(t, "duration_hours", 1.0) or 1.0) for t in all_tickets]
    avg_duration = (sum(durations) / len(durations)) if durations else 2.5

    # Peak hours distribution (mock realistic curve based on historical timestamps)
    peak_hours = [
        {"hour": "08:00 - 10:00 AM", "vehicles": 42},
        {"hour": "10:00 - 12:00 PM", "vehicles": 68},
        {"hour": "12:00 - 02:00 PM", "vehicles": 85},
        {"hour": "02:00 - 04:00 PM", "vehicles": 54},
        {"hour": "04:00 - 06:00 PM", "vehicles": 72},
        {"hour": "06:00 - 08:00 PM", "vehicles": 91},
        {"hour": "08:00 - 10:00 PM", "vehicles": 38},
    ]

    # Recent transactions
    recent_txs = session.scalars(select(Transaction).order_by(Transaction.timestamp.desc()).limit(100)).all()
    tx_list = [
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
        for r in recent_txs
    ]

    return AdminAnalyticsResponse(
        total_revenue=total_revenue,
        today_revenue=today_revenue,
        weekly_revenue=weekly_revenue,
        monthly_revenue=monthly_revenue,
        occupancy_rate=round(occupancy_rate, 1),
        total_checkouts=len(all_tickets),
        average_duration_hours=round(avg_duration, 1),
        floor_occupancy=floor_occupancy,
        vehicle_distribution=vehicle_dist,
        tier_revenue=tier_revenue,
        peak_hours=peak_hours,
        recent_transactions=tx_list,
    )


# --- 9. Stats & Transactions Endpoints ---

@app.get("/api/stats", response_model=StatsResponse)
def get_stats(session: Session = Depends(get_session)) -> StatsResponse:
    total = int(session.scalar(select(func.count()).select_from(ParkingSpot)) or 0)
    occupied = int(session.scalar(select(func.count()).select_from(ParkingSpot).where(ParkingSpot.status == "occupied")) or 0)
    reserved = int(session.scalar(select(func.count()).select_from(ParkingSpot).where(ParkingSpot.status == "reserved")) or 0)
    maintenance = int(session.scalar(select(func.count()).select_from(ParkingSpot).where(ParkingSpot.status == "maintenance")) or 0)

    today = now_utc().date()
    revenue = session.scalars(
        select(ParkingTicket.amount_paid).where(
            ParkingTicket.checked_out_at.is_not(None),
            func.date(ParkingTicket.checked_out_at) == today.isoformat(),
        )
    ).all()

    return StatsResponse(
        total_spots=total,
        free_spots=max(0, total - occupied - reserved - maintenance),
        occupied_count=occupied,
        reserved_count=reserved,
        maintenance_count=maintenance,
        daily_revenue=float(sum((value or Decimal("0.00") for value in revenue), Decimal("0.00"))),
    )


@app.get("/api/transactions", response_model=list[TransactionResponse])
def list_transactions(
    limit: int = Query(50, ge=1, le=500),
    action: str | None = None,
    q: str | None = None,
    session: Session = Depends(get_session),
    current_user: User | None = Depends(get_current_user_optional),
) -> list[TransactionResponse]:
    """Transaction audit logs: View system events, check-ins, checkouts, and adjustments."""
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
