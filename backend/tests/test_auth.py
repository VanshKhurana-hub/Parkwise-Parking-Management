import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import create_access_token, get_password_hash, verify_password
from app.database import Base, get_session
from app.main import app
from app.models import ParkingSpot, User


class AuthAndRBACTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)

        # Seed test users
        self.admin_user = User(
            id="user-admin-1",
            username="admin_test",
            hashed_password=get_password_hash("adminpass"),
            role="admin",
            full_name="Admin Test",
        )
        self.attendant_user = User(
            id="user-attendant-1",
            username="attendant_test",
            hashed_password=get_password_hash("attendantpass"),
            role="attendant",
            full_name="Attendant Test",
        )
        self.session.add_all([self.admin_user, self.attendant_user])

        # Seed a test spot
        self.session.add(
            ParkingSpot(id="A-01", zone="Zone A", spot_type="standard", row=1, column=1, status="available")
        )
        self.session.commit()

        def override_get_session():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = override_get_session
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()

    def test_password_hashing_and_verification(self) -> None:
        hashed = get_password_hash("mysecret")
        self.assertTrue(verify_password("mysecret", hashed))
        self.assertFalse(verify_password("wrongsecret", hashed))

    def test_login_success_and_invalid(self) -> None:
        # Valid login
        res = self.client.post("/api/auth/login", json={"username": "admin_test", "password": "adminpass"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["role"], "admin")

        # Invalid password
        res_fail = self.client.post("/api/auth/login", json={"username": "admin_test", "password": "wrong"})
        self.assertEqual(res_fail.status_code, 401)

        # Non-existent user
        res_none = self.client.post("/api/auth/login", json={"username": "not_real", "password": "any"})
        self.assertEqual(res_none.status_code, 401)

    def test_auth_me_endpoint(self) -> None:
        token = create_access_token({"sub": "attendant_test", "role": "attendant"})
        res = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["username"], "attendant_test")
        self.assertEqual(res.json()["role"], "attendant")

        # Missing token
        res_unauth = self.client.get("/api/auth/me")
        self.assertEqual(res_unauth.status_code, 401)

    def test_public_spots_endpoint(self) -> None:
        res = self.client.get("/api/spots")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(isinstance(res.json(), list))

    def test_admin_only_create_spot_rbac(self) -> None:
        spot_payload = {
            "id": "A-99",
            "zone": "Zone A",
            "spot_type": "standard",
            "row": 2,
            "column": 5,
        }

        # 1. Unauthenticated -> 401
        res_anon = self.client.post("/api/spots", json=spot_payload)
        self.assertEqual(res_anon.status_code, 401)

        # 2. Attendant -> 403 Forbidden
        attendant_token = create_access_token({"sub": "attendant_test", "role": "attendant"})
        res_attendant = self.client.post(
            "/api/spots",
            json=spot_payload,
            headers={"Authorization": f"Bearer {attendant_token}"},
        )
        self.assertEqual(res_attendant.status_code, 403)

        # 3. Admin -> 201 Created
        admin_token = create_access_token({"sub": "admin_test", "role": "admin"})
        res_admin = self.client.post(
            "/api/spots",
            json=spot_payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(res_admin.status_code, 201)
        self.assertEqual(res_admin.json()["id"], "A-99")

    def test_checkout_rbac(self) -> None:
        # First check in a vehicle
        checkin_res = self.client.post(
            "/api/checkin",
            json={"license_plate": "XY-9999", "vehicle_type": "standard", "phone_number": "+1 555 999 8888"},
        )
        self.assertEqual(checkin_res.status_code, 201)
        ticket_id = checkin_res.json()["id"]

        # 1. Unauthenticated checkout -> 401
        res_anon = self.client.post("/api/checkout", json={"ticket_id": ticket_id})
        self.assertEqual(res_anon.status_code, 401)

        # 2. Attendant checkout -> 200 OK
        attendant_token = create_access_token({"sub": "attendant_test", "role": "attendant"})
        res_attendant = self.client.post(
            "/api/checkout",
            json={"ticket_id": ticket_id},
            headers={"Authorization": f"Bearer {attendant_token}"},
        )
        self.assertEqual(res_attendant.status_code, 200)
        self.assertEqual(res_attendant.json()["ticket"]["id"], ticket_id)


if __name__ == "__main__":
    unittest.main()

