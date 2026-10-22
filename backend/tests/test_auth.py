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

    def test_rates_rbac_and_price_update(self) -> None:
        # 1. Public GET /api/rates returns defaults
        get_res = self.client.get("/api/rates")
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertIn("standard", data)
        self.assertIn("ev", data)
        self.assertIn("accessible", data)

        new_rates = {"standard": 55.0, "ev": 85.0, "accessible": 35.0}

        # 2. Unauthenticated PUT -> 401
        res_anon = self.client.put("/api/rates", json=new_rates)
        self.assertEqual(res_anon.status_code, 401)

        # 3. Attendant PUT -> 403 Forbidden
        attendant_token = create_access_token({"sub": "attendant_test", "role": "attendant"})
        res_attendant = self.client.put(
            "/api/rates",
            json=new_rates,
            headers={"Authorization": f"Bearer {attendant_token}"},
        )
        self.assertEqual(res_attendant.status_code, 403)

        # 4. Admin PUT -> 200 OK
        admin_token = create_access_token({"sub": "admin_test", "role": "admin"})
        res_admin = self.client.put(
            "/api/rates",
            json=new_rates,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(res_admin.status_code, 200)
        self.assertEqual(res_admin.json()["standard"], 55.0)
        self.assertEqual(res_admin.json()["ev"], 85.0)
        self.assertEqual(res_admin.json()["accessible"], 35.0)

        # 5. Verify GET /api/rates now returns updated rates
        get_res2 = self.client.get("/api/rates")
        self.assertEqual(get_res2.status_code, 200)
        self.assertEqual(get_res2.json()["standard"], 55.0)

    def test_transaction_logging_and_retrieval(self) -> None:
        # 1. Perform check-in
        checkin_res = self.client.post(
            "/api/checkin",
            json={"license_plate": "DL-1001", "vehicle_type": "standard", "phone_number": "+91 9876543210"},
        )
        self.assertEqual(checkin_res.status_code, 201)
        ticket_id = checkin_res.json()["id"]

        # 2. Perform checkout by attendant
        attendant_token = create_access_token({"sub": "attendant_test", "role": "attendant"})
        checkout_res = self.client.post(
            "/api/checkout",
            json={"ticket_id": ticket_id},
            headers={"Authorization": f"Bearer {attendant_token}"},
        )
        self.assertEqual(checkout_res.status_code, 200)

        # 3. Admin rate change
        admin_token = create_access_token({"sub": "admin_test", "role": "admin"})
        self.client.put(
            "/api/rates",
            json={"standard": 50.0, "ev": 80.0, "accessible": 35.0},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # 4. Admin spot create
        self.client.post(
            "/api/spots",
            json={"id": "A-50", "zone": "Zone A", "spot_type": "standard", "row": 3, "column": 3},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # 5. List transactions
        tx_res = self.client.get("/api/transactions")
        self.assertEqual(tx_res.status_code, 200)
        txs = tx_res.json()
        self.assertGreaterEqual(len(txs), 4)

        actions = [t["action"] for t in txs]
        self.assertIn("CHECK_IN", actions)
        self.assertIn("CHECK_OUT", actions)
        self.assertIn("RATE_UPDATE", actions)
        self.assertIn("SPOT_CREATE", actions)

        # Check checkout tx specifics
        checkout_tx = next(t for t in txs if t["action"] == "CHECK_OUT")
        self.assertEqual(checkout_tx["license_plate"], "DL-1001")
        self.assertEqual(checkout_tx["performed_by"], "attendant_test")
        self.assertIsNotNone(checkout_tx["amount"])

        # Check action filter
        filtered_res = self.client.get("/api/transactions?action=RATE_UPDATE")
        self.assertEqual(filtered_res.status_code, 200)
        filtered_txs = filtered_res.json()
        self.assertTrue(all(t["action"] == "RATE_UPDATE" for t in filtered_txs))
        self.assertEqual(filtered_txs[0]["performed_by"], "admin_test")

        # Check search filter
        search_res = self.client.get("/api/transactions?q=DL-1001")
        self.assertEqual(search_res.status_code, 200)
        search_txs = search_res.json()
        self.assertTrue(any(t["license_plate"] == "DL-1001" for t in search_txs))



if __name__ == "__main__":
    unittest.main()

