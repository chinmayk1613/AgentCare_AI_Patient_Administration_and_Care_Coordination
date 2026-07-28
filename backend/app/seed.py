from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .hospital_catalog import (
    RAG_CORPUS_VERSION,
    SPECIALTIES,
    TERMINOLOGY,
    concepts_for_department,
    doctor_name,
    validate_catalog,
)
from .models import AppointmentSlot, Department, Doctor, PatientProfile, PolicyDocument, User
from .security import hash_password


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)):
            return
        patient = User(
            name="Maya Chen",
            email="patient@agentcare.demo",
            password_hash=hash_password("Patient123!"),
            role="patient",
        )
        staff = User(
            name="Leonie Weber",
            email="staff@agentcare.demo",
            password_hash=hash_password("Staff123!"),
            role="staff",
            department_scope="all",
        )
        reviewer = User(
            name="Dr. Alex Morgan",
            email="reviewer@agentcare.demo",
            password_hash=hash_password("Reviewer123!"),
            role="reviewer",
            department_scope="all",
        )
        new_patients = [
            User(name="Noah Williams", email="noah.patient@agentcare.demo", password_hash=hash_password("Patient123!"), role="patient"),
            User(name="Sofia Rossi", email="sofia.patient@agentcare.demo", password_hash=hash_password("Patient123!"), role="patient"),
            User(name="Liam O'Connor", email="liam.patient@agentcare.demo", password_hash=hash_password("Patient123!"), role="patient"),
            User(name="Aisha Khan", email="aisha.patient@agentcare.demo", password_hash=hash_password("Patient123!"), role="patient"),
            User(name="Mateo Garcia", email="mateo.patient@agentcare.demo", password_hash=hash_password("Patient123!"), role="patient"),
        ]
        new_reviewers = [
            User(name="Dr. Priya Singh", email="priya.orthopedics@agentcare.demo", password_hash=hash_password("Reviewer123!"), role="reviewer", department_scope="orthopedic-surgery"),
            User(name="Dr. Elena Novak", email="elena.cardiology@agentcare.demo", password_hash=hash_password("Reviewer123!"), role="reviewer", department_scope="cardiology"),
            User(name="Dr. Samuel Okafor", email="samuel.general@agentcare.demo", password_hash=hash_password("Reviewer123!"), role="reviewer", department_scope="general-medicine"),
            User(name="Hannah Weber", email="hannah.coordination@agentcare.demo", password_hash=hash_password("Reviewer123!"), role="staff", department_scope="all"),
        ]
        db.add_all([patient, staff, reviewer, *new_patients, *new_reviewers])
        db.flush()
        db.add_all([
            PatientProfile(
                user_id=item.id,
                phone=f"+49 30 555 01{42 + index:02d}",
                preferred_language="en",
                emergency_contact="Synthetic Demo Contact",
            )
            for index, item in enumerate([patient, *new_patients])
        ])
        validate_catalog()
        departments = [
            Department(code=code, name=name, description=f"Common routing signals: {symptoms}")
            for code, name, symptoms in SPECIALTIES
        ]
        db.add_all(departments)
        db.flush()
        now = datetime.now(timezone.utc)
        for index, department in enumerate(departments):
            for doctor_index in range(3):
                doctor = Doctor(
                    department_id=department.id,
                    name=doctor_name(index * 3 + doctor_index),
                )
                db.add(doctor)
                db.flush()
                for cycle in range(4):
                    start = (now + timedelta(days=2 + cycle * 4 + ((index + doctor_index) % 3))).replace(
                        hour=8 + doctor_index * 2,
                        minute=30 if doctor_index == 1 else 0,
                        second=0,
                        microsecond=0,
                    )
                    db.add(
                        AppointmentSlot(
                            doctor_id=doctor.id,
                            start_time=start,
                            end_time=start + timedelta(minutes=30),
                        )
                    )
        policies = [
            PolicyDocument(
                policy_key=f"routing-{code}",
                title=f"{name} administrative routing and provider directory",
                body=(
                    f"Explicit {name} requests may route administratively. Common routing signals: "
                    f"{symptoms}. Approved terminology concepts: "
                    f"{'; '.join(concept[2] + ' [' + ', '.join(term for canonical in concept[3] for term in TERMINOLOGY[canonical]) + ']' for concept in concepts_for_department(code)) or 'none'}. "
                    f"Only concepts marked for autonomous administrative routing may bypass staff confirmation; no concept establishes a diagnosis. "
                    f"Providers: {', '.join(doctor_name(index * 3 + slot) for slot in range(3))}."
                ),
                department_code=code,
                version=RAG_CORPUS_VERSION,
                effective_from=now - timedelta(days=30),
            )
            for index, (code, name, symptoms) in enumerate(SPECIALTIES)
        ] + [
            PolicyDocument(
                policy_key="document-ecg",
                title="Cardiology document coordination",
                body="Prior ECG may be attached as an ECG document. Staff verify relevance; the system does not interpret clinical findings.",
                department_code="cardiology",
                version="2026-07",
                effective_from=now - timedelta(days=30),
            ),
            PolicyDocument(
                policy_key="document-mri",
                title="MRI report document coordination",
                body="An MRI report may be classified and linked after security, checksum, duplicate, and patient checks. Clinical findings are not interpreted.",
                department_code="radiology",
                version="2026-07",
                effective_from=now - timedelta(days=30),
            ),
            PolicyDocument(
                policy_key="safety-boundary",
                title="Non-clinical safety boundary",
                body="Diagnosis, prescription, dosage, emergency, and uncertain clinical requests are not autonomously handled and must be blocked or escalated.",
                department_code=None,
                version="2026-07",
                effective_from=now - timedelta(days=30),
            ),
        ]
        db.add_all(policies)
        db.commit()


if __name__ == "__main__":
    seed()
