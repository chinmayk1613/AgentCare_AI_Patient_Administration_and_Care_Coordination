import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Appointment


def test_end_to_end_booking_is_persisted(client, patient_headers):
    response = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": "I need a cardiology follow-up next week and want to attach my old ECG.",
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": True,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "completed"
    assert body["case_number"].startswith("AC-")
    assert len(body["case_number"]) == 11
    assert body["state"]["appointment"]["status"] == "confirmed"
    assert body["state"]["documents"]["missing"] == ["ECG"]
    detail = client.get(f"/api/workflows/{body['id']}", headers=patient_headers)
    assert detail.status_code == 200
    assert any(item["tool"] == "book_slot" for item in detail.json()["tools"])


def test_idempotency_returns_same_workflow(client, patient_headers):
    key = f"test-{uuid.uuid4()}"
    payload = {
        "request_text": "Book a dermatology appointment next week.",
        "idempotency_key": key,
        "confirm_first_available": True,
    }
    first = client.post("/api/workflows", headers=patient_headers, json=payload)
    second = client.post("/api/workflows", headers=patient_headers, json=payload)
    assert first.json()["id"] == second.json()["id"]


def test_clinical_request_is_blocked_and_reviewable(client, patient_headers, reviewer_headers):
    response = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": "Please diagnose me and prescribe which medicine I should take.",
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": True,
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "human_review"
    queue = client.get("/api/staff/escalations", headers=reviewer_headers)
    assert queue.status_code == 200
    assert any(item["reason_code"] == "CLINICAL_REQUEST_BLOCKED" for item in queue.json())


def test_patient_cannot_access_staff_queue(client, patient_headers):
    response = client.get("/api/staff/escalations", headers=patient_headers)
    assert response.status_code == 403


def test_new_patient_and_staff_accounts_can_sign_in(client):
    new_patients = [
        "chinmay.kashikar@agentcare.demo",
        "mayuresh.kashikar@agentcare.demo",
    ]
    new_staff = [
        "vikas.jha@agentcare.demo",
        "arunima.gosavi@agentcare.demo",
    ]
    for email in new_patients:
        response = client.post(
            "/api/auth/login",
            json={"email": email, "password": "Patient123!"},
        )
        assert response.status_code == 200, email
        assert response.json()["role"] == "patient"
    for email in new_staff:
        response = client.post(
            "/api/auth/login",
            json={"email": email, "password": "Reviewer123!"},
        )
        assert response.status_code == 200, email
        assert response.json()["role"] in {"reviewer", "staff"}


def test_ambiguous_mri_routing_can_be_reviewed_and_resumed(
    client, patient_headers, reviewer_headers
):
    response = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": "My legs are painful. I need to consult a doctor and submit my MRI report.",
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": False,
        },
    )
    assert response.status_code == 200, response.text
    workflow = response.json()
    assert workflow["status"] == "human_review"
    assert workflow["state"]["routing"]["recommended_department"]["code"] == "orthopedic-surgery"

    queue = client.get("/api/staff/escalations", headers=reviewer_headers)
    item = next(
        row for row in queue.json()
        if row["workflow_run_id"] == workflow["id"]
        and row["reason_code"] == "AMBIGUOUS_DEPARTMENT"
    )
    detail = client.get(
        f"/api/staff/escalations/{item['id']}", headers=reviewer_headers
    )
    assert detail.status_code == 200
    assert detail.json()["resume_supported"] is True

    decision = client.post(
        f"/api/staff/escalations/{item['id']}/review",
        headers=reviewer_headers,
        json={
            "decision": "approved",
            "rationale": "MRI and limb request reviewed for administrative routing only.",
            "department_code": "orthopedic-surgery",
        },
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()["resumed"] is True
    assert decision.json()["workflow_status"] == "awaiting_input"


def test_colloquial_urinary_request_uses_enriched_rag_without_staff_review(
    client, patient_headers
):
    response = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": (
                "From last 2 days when I go to pee it is really paining "
                "when liquid is out. I need a doctor's appointment."
            ),
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": False,
        },
    )
    assert response.status_code == 200, response.text
    workflow = response.json()
    assert workflow["status"] == "awaiting_input"
    assert workflow["current_step"] == "availability"
    assert workflow["state"]["routing"]["department_code"] == "urology"
    assert workflow["state"]["routing"]["confidence"] >= 0.85
    assert any(
        evidence["department_code"] == "urology"
        and evidence["embedding_model"] == "agentcare-private-semantic-hash-v1"
        for evidence in workflow["state"]["routing"]["evidence"]
    )


def test_patient_can_reschedule_and_cancel_a_persisted_appointment(client, patient_headers):
    created = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": "Book a cardiology appointment next week.",
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": True,
        },
    ).json()
    detail = client.get(f"/api/appointments/{created['id']}", headers=patient_headers)
    assert detail.status_code == 200, detail.text
    original = detail.json()["appointment"]
    replacement = detail.json()["alternative_slots"][0]

    changed = client.patch(
        f"/api/appointments/{created['id']}",
        headers=patient_headers,
        json={"action": "reschedule", "new_slot_id": replacement["id"]},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["appointment"]["status"] == "rescheduled"
    assert changed.json()["appointment"]["slot_id"] != original["slot_id"]

    cancelled = client.patch(
        f"/api/appointments/{created['id']}",
        headers=patient_headers,
        json={"action": "cancel", "reason": "Patient is unavailable."},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["appointment"]["status"] == "cancelled"
    assert cancelled.json()["appointment"]["cancellation_reason"] == "Patient is unavailable."


def test_clinician_can_record_outcome_but_patient_cannot(client, patient_headers, reviewer_headers):
    created = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": "Book a dermatology appointment next week.",
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": True,
        },
    ).json()
    payload = {
        "action": "clinical_update",
        "visit_status": "completed",
        "doctor_notes": "Clinician-authored synthetic demo note.",
        "prescribed_medications": ["Synthetic medicine entry"],
        "follow_up_suggestions": "Synthetic clinician follow-up entry.",
    }
    denied = client.patch(
        f"/api/appointments/{created['id']}",
        headers=patient_headers,
        json=payload,
    )
    assert denied.status_code == 403

    recorded = client.patch(
        f"/api/appointments/{created['id']}",
        headers=reviewer_headers,
        json=payload,
    )
    assert recorded.status_code == 200, recorded.text
    body = recorded.json()["appointment"]
    assert body["status"] == "completed"
    assert body["doctor_notes"] == payload["doctor_notes"]
    assert body["prescribed_medications"] == payload["prescribed_medications"]
    assert body["clinical_source"] == "clinician_entered_only"


def test_ist_internal_clock_marks_past_scheduled_appointment_done(client, patient_headers):
    created = client.post(
        "/api/workflows",
        headers=patient_headers,
        json={
            "request_text": "Book an ophthalmology appointment next week.",
            "idempotency_key": f"test-{uuid.uuid4()}",
            "confirm_first_available": True,
        },
    ).json()
    with SessionLocal() as db:
        appointment = db.scalar(
            select(Appointment).where(Appointment.workflow_run_id == created["id"])
        )
        assert appointment is not None
        appointment.slot.start_time = datetime.now(timezone.utc) - timedelta(days=3)
        appointment.slot.end_time = appointment.slot.start_time + timedelta(minutes=30)
        db.commit()

    detail = client.get(f"/api/appointments/{created['id']}", headers=patient_headers)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["appointment"]["status"] == "confirmed"
    assert body["appointment"]["display_status"] == "done"
    assert body["appointment"]["clock"]["time_zone"] == "Asia/Kolkata"
    assert body["appointment"]["clock"]["time_zone_label"] == "IST"
    assert body["capabilities"]["can_cancel"] is False
    assert body["capabilities"]["can_reschedule"] is False
    assert body["alternative_slots"] == []

    rejected = client.patch(
        f"/api/appointments/{created['id']}",
        headers=patient_headers,
        json={"action": "cancel", "reason": "Too late to cancel."},
    )
    assert rejected.status_code == 409
    assert "IST clock status is DONE" in rejected.json()["detail"]
