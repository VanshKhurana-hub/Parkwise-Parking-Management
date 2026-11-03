import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import create_access_token, get_password_hash
from app.database import Base, get_session
from app.main import app
from app.models import GuardProfile, GuardShift, HourlyRate, ParkingSpot, ParkingTicket, User
from app.services import calculate_tiered_price, check_in, checkout, generate_qr_payload


class AdvancedFeaturesAndRBACTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)

        # 4 distinct roles
        self.admin = User(
            id="u-admin",
            username="admin_user",
            hashed_password=get_password_hash("pass123"),
            role="admin",
            full_name="Admin Director",
            is_active=True,
        )
        self.manager = User(
            id="u-manager",
            username="manager_user",
            hashed_password=get_password_hash("pass123"),
            role="manager",
            full_name="Facility Manager",
            is_active=True,
        )
        self.biller = User(
            id="u-biller",
            username="biller_user",
            hashed_password=get_password_hash("pass123"),
            role="biller",
            full_name="Desk Biller",
            is_active=True,
        )
        self.guard = User(
            id="u-guard",
            username="guard_user",
            hashed_password=get_password_hash("pass123"),
            role="security_guard",
            full_name="Officer Ramesh",
            is_active=True,
        )
        self.session.add_all([self.admin, self.manager, self.biller, self.guard])

        # Seed guard profile
        self.guard_profile = GuardProfile(
            user_id="u-guard",
            assigned_location="Floor 1 - Main Concourse",
            base_salary=Decimal("28000.00"),
            shift_allowance=Decimal("4000.00"),
            overtime_hours=10,
            overtime_rate=Decimal("250.00"),
            payout_status="Paid (Oct 2026)",
            emergency_contact="+91 91234 56789",
        )
        self.session.add(self.guard_profile)

        # Seed floor-wise spots
        self.session.add_all([
            ParkingSpot(id="F1-A01", floor="Floor 1", zone="Zone A", spot_type="standard", row=1, column=1, status="available"),
            ParkingSpot(id="F2-B01", floor="Floor 2", zone="Zone B", spot_type="ev", row=1, column=1, status="available"),
            ParkingSpot(id="F3-C01", floor="Floor 3", zone="Zone C", spot_type="accessible", row=1, column=1, status="available"),
        ])

        # Seed tiered rates
        self.session.add_all([
            HourlyRate(vehicle_type="standard", rate_per_hour=Decimal("40.00"), rate_per_day=Decimal("350.00"), rate_per_week=Decimal("2100.00"), daily_threshold_hours=8),
            HourlyRate(vehicle_type="ev", rate_per_hour=Decimal("70.00"), rate_per_day=Decimal("600.00"), rate_per_week=Decimal("3600.00"), daily_threshold_hours=8),
            HourlyRate(vehicle_type="accessible", rate_per_hour=Decimal("30.00"), rate_per_day=Decimal("250.00"), rate_per_week=Decimal("1500.00"), daily_threshold_hours=8),
        ])
        self.session.commit()

        def override_get_session():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = override_get_session
        self.client = TestClient(app)

        self.admin_token = create_access_token({"sub": "admin_user", "role": "admin"})
        self.manager_token = create_access_token({"sub": "manager_user", "role": "manager"})
        self.biller_token = create_access_token({"sub": "biller_user", "role": "biller"})
        self.guard_token = create_access_token({"sub": "guard_user", "role": "security_guard"})

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()

    # --- 1. License Plate Validation (RegEx) Tests ---
    def test_strict_license_plate_validation(self) -> None:
        # Valid Indian formats
        valid_plates = ["MH-12-AB-1234", "DL 01 C 9999", "KA05MJ4321", "NYC-4589", "AB-1234"]
        for idx, plate in enumerate(valid_plates):
            res = self.client.post(
                "/api/checkin",
                json={"license_plate": plate, "vehicle_type": "standard", "phone_number": "+91 9876543210"},
                headers={"Authorization": f"Bearer {self.biller_token}"},
            )
            # Either 201 or 409 (if out of standard spots after 1st)
            self.assertIn(res.status_code, [201, 409])

        # Invalid formats: too short, special characters, nonsense
        invalid_plates = ["A", "INVALID!!!", "---", "12345678901234567890", "!@#$"]
        for bad in invalid_plates:
            res = self.client.post(
                "/api/checkin",
                json={"license_plate": bad, "vehicle_type": "standard", "phone_number": "+91 9876543210"},
                headers={"Authorization": f"Bearer {self.biller_token}"},
            )
            self.assertEqual(res.status_code, 422, f"Expected 422 for invalid plate '{bad}', got {res.status_code}")

    # --- 2. Duration Tracking & Tiered Pricing Engine Tests ---
    def test_tiered_pricing_engine_short_term_vs_long_term(self) -> None:
        now = datetime.now(timezone.utc)

        # 3 hours standard -> short-term hourly (3 * 40 = 120.00)
        p3 = calculate_tiered_price(now, now + timedelta(hours=3), "standard", self.session)
        self.assertEqual(p3.tier_applied, "Short-Term (Hourly)")
        self.assertEqual(p3.final_amount, 120.00)
        self.assertEqual(p3.savings_amount, 0.0)

        # 12 hours standard (>= 8h threshold) -> daily tier applied (350.00 instead of 12*40=480.00)
        p12 = calculate_tiered_price(now, now + timedelta(hours=12), "standard", self.session)
        self.assertEqual(p12.tier_applied, "Long-Term (Daily Tier)")
        self.assertEqual(p12.final_amount, 350.00)
        self.assertEqual(p12.savings_amount, 130.00)

        # 30 hours standard -> 1 Day (24h) + 6 hours (6*40 = 240) = 590.00 (Savings vs 30*40=1200 -> 610 saved!)
        p30 = calculate_tiered_price(now, now + timedelta(hours=30), "standard", self.session)
        self.assertIn("Long-Term", p30.tier_applied)
        self.assertEqual(p30.final_amount, 590.00)
        self.assertEqual(p30.savings_amount, 610.00)

        # 7 Days standard -> weekly tier (2100.00 vs 168*40=6720.00)
        p168 = calculate_tiered_price(now, now + timedelta(days=7), "standard", self.session)
        self.assertEqual(p168.tier_applied, "Long-Term (Weekly Tier)")
        self.assertEqual(p168.final_amount, 2100.00)
        self.assertEqual(p168.savings_amount, 4620.00)

    # --- 3. QR Code Token Integration Tests ---
    def test_qr_code_generation_and_checkout(self) -> None:
        # Check-in returns qr_token
        res = self.client.post(
            "/api/checkin",
            json={"license_plate": "MH-12-AB-9999", "vehicle_type": "standard", "phone_number": "+91 9999999999"},
            headers={"Authorization": f"Bearer {self.biller_token}"},
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        qr_token = data["qr_token"]
        self.assertIsNotNone(qr_token)
        self.assertIn("PARKWISE|TICKET:", qr_token)
        self.assertIn("PLATE:MH-12-AB-9999", qr_token)
        self.assertIn("FLOOR:Floor 1", qr_token)

        # Checkout using full QR token string
        checkout_res = self.client.post(
            "/api/checkout",
            json={"ticket_id": qr_token},
            headers={"Authorization": f"Bearer {self.biller_token}"},
        )
        self.assertEqual(checkout_res.status_code, 200)
        cdata = checkout_res.json()
        self.assertIn("duration_display", cdata)
        self.assertIn("tier_applied", cdata)
        self.assertIn("breakdown", cdata)

    # --- 4. Floor-Wise Slot Management Tests ---
    def test_floor_wise_slot_management(self) -> None:
        # Filter spots by floor
        f1_res = self.client.get("/api/spots?floor=Floor 1")
        self.assertEqual(f1_res.status_code, 200)
        self.assertTrue(all(s["floor"] == "Floor 1" for s in f1_res.json()))

        # Manager creates new spot on Floor 4
        new_spot_res = self.client.post(
            "/api/spots",
            json={"id": "F4-D01", "floor": "Floor 4", "zone": "Zone D", "spot_type": "standard", "row": 1, "column": 1},
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(new_spot_res.status_code, 201)
        self.assertEqual(new_spot_res.json()["floor"], "Floor 4")

        # Manager sets spot to maintenance
        maint_res = self.client.put(
            "/api/manager/spots/F4-D01/status",
            json={"status": "maintenance"},
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(maint_res.status_code, 200)
        self.assertEqual(maint_res.json()["status"], "maintenance")

    # --- 5. Guard Scheduling & Portal Tests ---
    def test_guard_scheduling_and_personal_portal(self) -> None:
        # Manager assigns shift to guard
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assign_res = self.client.post(
            "/api/guard-shifts",
            json={
                "guard_id": "u-guard",
                "shift_name": "Morning (06:00 - 14:00)",
                "shift_date": today_str,
                "start_time": "06:00",
                "end_time": "14:00",
                "assigned_location": "Floor 2 - EV Bay",
                "notes": "Verify charging cables.",
            },
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(assign_res.status_code, 201)

        # Security Guard accesses their personal portal
        guard_portal_res = self.client.get("/api/guard/me", headers={"Authorization": f"Bearer {self.guard_token}"})
        self.assertEqual(guard_portal_res.status_code, 200)
        gdata = guard_portal_res.json()
        self.assertEqual(gdata["user"]["role"], "security_guard")
        self.assertEqual(gdata["profile"]["base_salary"], 28000.00)
        self.assertEqual(gdata["profile"]["shift_allowance"], 4000.00)
        self.assertEqual(gdata["profile"]["assigned_location"], "Floor 2 - EV Bay")
        self.assertGreater(len(gdata["upcoming_shifts"]), 0)

        # Guard is forbidden from Manager/Admin endpoints
        forbidden_res = self.client.post(
            "/api/guard-shifts",
            json={
                "guard_id": "u-guard",
                "shift_name": "Morning (06:00 - 14:00)",
                "shift_date": today_str,
                "start_time": "06:00",
                "end_time": "14:00",
                "assigned_location": "Floor 1",
            },
            headers={"Authorization": f"Bearer {self.guard_token}"},
        )
        self.assertEqual(forbidden_res.status_code, 403)

        # Guard is forbidden from booking or allotting parking slots (biller only)
        guard_allot_res = self.client.post(
            "/api/checkin",
            json={
                "license_plate": "DL-01-AB-1234",
                "vehicle_type": "standard",
                "phone_number": "9876543210",
                "spot_id": "A-01",
            },
            headers={"Authorization": f"Bearer {self.guard_token}"},
        )
        self.assertEqual(guard_allot_res.status_code, 403)
        self.assertIn("read-only", guard_allot_res.json()["detail"].lower())

    # --- 6. Admin Analytics Dashboard Exclusive Access ---
    def test_admin_exclusive_analytics_dashboard(self) -> None:
        # Admin gets analytics
        admin_res = self.client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {self.admin_token}"})
        self.assertEqual(admin_res.status_code, 200)
        adata = admin_res.json()
        self.assertIn("total_revenue", adata)
        self.assertIn("floor_occupancy", adata)
        self.assertIn("tier_revenue", adata)
        self.assertIn("peak_hours", adata)

        # Manager, Biller, and Guard are forbidden from Admin Analytics
        self.assertEqual(self.client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {self.manager_token}"}).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {self.biller_token}"}).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {self.guard_token}"}).status_code, 403)

    # --- 7. Dynamic Floor Management & Scaling ---
    def test_dynamic_floor_management_and_scaling(self) -> None:
        # 1. Public / Personnel can list floors
        res = self.client.get("/api/floors")
        self.assertEqual(res.status_code, 200)
        floors = res.json()
        initial_count = len(floors)

        # 2. Manager dynamically adds a custom floor
        add_res = self.client.post(
            "/api/floors",
            json={
                "name": "Floor 4",
                "default_zone": "Zone D",
                "spot_type": "standard",
                "initial_spots_count": 6,
                "spot_prefix": "D",
            },
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(add_res.status_code, 201)
        updated_floors = add_res.json()
        self.assertEqual(len(updated_floors), initial_count + 1)
        f4 = next(f for f in updated_floors if f["name"] == "Floor 4")
        self.assertEqual(f4["total_spots"], 6)

        # 3. Manager scales floors to 6
        scale_res = self.client.post(
            "/api/floors/scale",
            json={"target_floors": 6, "spots_per_new_floor": 4},
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(scale_res.status_code, 200)
        self.assertEqual(len(scale_res.json()), 6)

        # 4. Park a vehicle on Floor 4 to test deletion block
        checkin_res = self.client.post(
            "/api/checkin",
            json={
                "license_plate": "DL-01-AB-1234",
                "vehicle_type": "standard",
                "phone_number": "9876543210",
                "spot_id": "D-01",
            },
            headers={"Authorization": f"Bearer {self.biller_token}"},
        )
        self.assertEqual(checkin_res.status_code, 201)

        # 5. Attempting to delete Floor 4 while occupied must return 400
        del_fail = self.client.delete(
            "/api/floors/Floor 4",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(del_fail.status_code, 400)
        self.assertIn("parked", del_fail.json()["detail"].lower())

        # 6. Check out vehicle
        ticket_id = checkin_res.json()["id"]
        checkout_res = self.client.post(
            "/api/checkout",
            json={"ticket_id": ticket_id},
            headers={"Authorization": f"Bearer {self.biller_token}"},
        )
        self.assertEqual(checkout_res.status_code, 200)

        # 7. Now delete Floor 4 successfully
        del_ok = self.client.delete(
            "/api/floors/Floor 4",
            headers={"Authorization": f"Bearer {self.manager_token}"},
        )
        self.assertEqual(del_ok.status_code, 200)

        # 8. Guard and Biller are forbidden from adding or deleting floors
        self.assertEqual(
            self.client.post(
                "/api/floors",
                json={"name": "Floor 99", "initial_spots_count": 2},
                headers={"Authorization": f"Bearer {self.guard_token}"},
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(
                "/api/floors/Floor 1",
                headers={"Authorization": f"Bearer {self.biller_token}"},
            ).status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main()

