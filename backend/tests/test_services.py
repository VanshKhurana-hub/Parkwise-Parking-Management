import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import ParkingSpot
from app.schemas import CheckInRequest
from app.services import check_in, checkout, recommend_spot


class ParkingServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.session.add_all(
            [
                ParkingSpot(id="A-01", zone="Zone A", spot_type="standard", row=1, column=1),
                ParkingSpot(id="B-01", zone="Zone B", spot_type="ev", row=1, column=2),
                ParkingSpot(id="C-01", zone="Zone C", spot_type="accessible", row=1, column=3),
            ]
        )
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_recommends_compatible_spot_and_charges_rounded_hours(self) -> None:
        ticket = check_in(
            self.session,
            CheckInRequest(
                license_plate="ab-123",
                vehicle_type="standard",
                phone_number="+1 555 123 4567",
            ),
        )
        self.assertEqual(ticket.spot_id, "A-01")
        ticket.checked_in_at = datetime.now(timezone.utc) - timedelta(hours=1, minutes=2)
        self.session.commit()

        checked_out, minutes, amount = checkout(self.session, ticket.id)

        self.assertEqual(checked_out.spot_id, "A-01")
        self.assertGreaterEqual(minutes, 62)
        self.assertEqual(amount, Decimal("80.00"))
        self.assertEqual(self.session.get(ParkingSpot, "A-01").status, "available")

    def test_prevents_incompatible_and_double_occupied_spots(self) -> None:
        with self.assertRaises(HTTPException) as incompatible:
            check_in(
                self.session,
                CheckInRequest(
                    license_plate="AB123",
                    vehicle_type="ev",
                    phone_number="+1 555 123 4567",
                    spot_id="A-01",
                ),
            )
        self.assertEqual(incompatible.exception.status_code, 422)
        check_in(
            self.session,
            CheckInRequest(
                license_plate="AB123",
                vehicle_type="standard",
                phone_number="+1 555 123 4567",
                spot_id="A-01",
            ),
        )
        with self.assertRaises(HTTPException) as occupied:
            check_in(
                self.session,
                CheckInRequest(
                    license_plate="CD456",
                    vehicle_type="standard",
                    phone_number="+1 555 123 4567",
                    spot_id="A-01",
                ),
            )
        self.assertEqual(occupied.exception.status_code, 409)

    def test_rejects_unknown_and_pre_checkin_checkout(self) -> None:
        with self.assertRaises(HTTPException) as unknown:
            checkout(self.session, "not-a-ticket")
        self.assertEqual(unknown.exception.status_code, 404)
        ticket = check_in(
            self.session,
            CheckInRequest(
                license_plate="AB123",
                vehicle_type="standard",
                phone_number="+1 555 123 4567",
            ),
        )
        with self.assertRaises(HTTPException) as too_early:
            checkout(self.session, ticket.id, ticket.checked_in_at - timedelta(seconds=1))
        self.assertEqual(too_early.exception.status_code, 422)

    def test_rejects_future_checkout_and_repeated_checkout(self) -> None:
        ticket = check_in(
            self.session,
            CheckInRequest(
                license_plate="AB123",
                vehicle_type="standard",
                phone_number="+1 555 123 4567",
            ),
        )
        with self.assertRaises(HTTPException) as future:
            checkout(self.session, ticket.id, datetime.now(timezone.utc) + timedelta(minutes=1))
        self.assertEqual(future.exception.status_code, 422)

        checkout(self.session, ticket.id)
        with self.assertRaises(HTTPException) as repeated:
            checkout(self.session, ticket.id)
        self.assertEqual(repeated.exception.status_code, 409)

    def test_does_not_recommend_an_incompatible_zone(self) -> None:
        self.assertEqual(recommend_spot(self.session, "ev").id, "B-01")

    def test_prevents_a_vehicle_from_holding_multiple_active_tickets(self) -> None:
        self.session.add(
            ParkingSpot(id="A-02", zone="Zone A", spot_type="standard", row=1, column=2)
        )
        self.session.commit()
        check_in(
            self.session,
            CheckInRequest(
                license_plate="AB123",
                vehicle_type="standard",
                phone_number="+1 555 123 4567",
                spot_id="A-01",
            ),
        )
        with self.assertRaises(HTTPException) as duplicate:
            check_in(
                self.session,
                CheckInRequest(
                    license_plate="AB123",
                    vehicle_type="standard",
                    phone_number="+1 555 123 4567",
                    spot_id="A-02",
                ),
            )
        self.assertEqual(duplicate.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
