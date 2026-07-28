from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .hospital_catalog import SPECIALTIES, match_routing_concepts
from .models import (
    Appointment,
    AppointmentSlot,
    AuditEvent,
    Department,
    Doctor,
    Escalation,
    PatientDocument,
    Reminder,
    ToolInvocation,
    User,
)

settings = get_settings()


def appointment_time_has_passed(appointment: Appointment) -> bool:
    start_time = appointment.slot.start_time
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    return start_time <= datetime.now(timezone.utc)


def audit(
    db: Session,
    *,
    actor_id: int | None,
    workflow_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    outcome: str = "success",
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditEvent(
            actor_id=actor_id,
            workflow_run_id=workflow_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            outcome=outcome,
            metadata_json=metadata or {},
        )
    )


def record_tool(
    db: Session,
    workflow_id: str,
    agent: str,
    tool: str,
    input_summary: dict,
    output_summary: dict,
    status: str = "success",
) -> None:
    db.add(
        ToolInvocation(
            workflow_run_id=workflow_id,
            agent_name=agent,
            tool_name=tool,
            input_summary=input_summary,
            output_summary=output_summary,
            status=status,
        )
    )


def policy_gate(user: User, required_scope: str, risk: str = "standard") -> None:
    if not settings.write_tools_enabled and required_scope.endswith(":write"):
        raise HTTPException(status_code=503, detail="Write tools are disabled by the safety switch")
    allowed = {
        "patient": {"appointment:write", "document:write", "workflow:write"},
        "staff": {"appointment:write", "document:write", "workflow:write", "escalation:review"},
        "reviewer": {"workflow:write", "escalation:review", "approval:decide"},
        "admin": {
            "appointment:write",
            "document:write",
            "workflow:write",
            "escalation:review",
            "approval:decide",
        },
    }
    if required_scope not in allowed.get(user.role, set()):
        raise HTTPException(status_code=403, detail=f"Scope {required_scope} denied")
    if risk == "sensitive" and user.role == "patient":
        raise HTTPException(status_code=409, detail="Sensitive action requires staff approval")


def lookup_department(db: Session, request_text: str) -> tuple[Department | None, float]:
    text = request_text.lower()
    departments = list(db.scalars(select(Department).where(Department.active.is_(True))))
    by_code = {department.code: department for department in departments}
    explicit = [
        by_code[code]
        for code, name, _ in SPECIALTIES
        if code in by_code
        and (
            name.lower() in text
            or re.search(rf"\b{re.escape(code.replace('-', ' '))}\b", text)
            or (code == "ent" and re.search(r"\bent\b", text))
        )
    ]
    if len(explicit) == 1:
        return explicit[0], 0.96
    if len(explicit) > 1:
        return None, 0.45

    concept_analysis = match_routing_concepts(request_text)
    leading_concept = concept_analysis["leading"]
    if leading_concept:
        department = by_code.get(leading_concept[1])
        if department:
            return department, 0.90 if concept_analysis["can_route"] else 0.70

    def routing_token(token: str) -> str:
        if token.endswith("ful") and len(token) > 5:
            token = token[:-3]
        if token.endswith("es") and len(token) > 5:
            token = token[:-2]
        elif token.endswith("s") and len(token) > 3:
            token = token[:-1]
        return token

    request_tokens = {routing_token(token) for token in re.findall(r"[a-z]{3,}", text)}
    request_tokens.discard("pain")
    scored: list[tuple[int, Department]] = []
    for code, _, symptom_text in SPECIALTIES:
        department = by_code.get(code)
        if not department:
            continue
        symptoms = [item.strip().lower() for item in symptom_text.split(",")]
        department_tokens = {
            routing_token(token)
            for symptom in symptoms
            for token in re.findall(r"[a-z]{3,}", symptom)
        }
        department_tokens.discard("pain")
        exact_phrase_bonus = sum(2 for symptom in symptoms if symptom in text)
        score = exact_phrase_bonus + len(request_tokens & department_tokens)
        if score:
            scored.append((score, department))
    scored.sort(key=lambda item: (-item[0], item[1].id))
    if scored:
        return scored[0][1], 0.68
    return None, 0.25


def search_slots(db: Session, department_id: int, limit: int = 5) -> list[AppointmentSlot]:
    now = datetime.now(timezone.utc)
    stmt = (
        select(AppointmentSlot)
        .join(Doctor)
        .where(
            Doctor.department_id == department_id,
            Doctor.active.is_(True),
            AppointmentSlot.status == "available",
            AppointmentSlot.start_time >= now,
        )
        .order_by(AppointmentSlot.start_time)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def book_slot(
    db: Session,
    *,
    patient_id: int,
    slot_id: int,
    workflow_id: str,
    reason: str,
) -> Appointment:
    slot = db.scalar(select(AppointmentSlot).where(AppointmentSlot.id == slot_id))
    if not slot or slot.status != "available":
        raise HTTPException(status_code=409, detail="Slot is no longer available")
    slot.status = "booked"
    slot.version += 1
    appointment = Appointment(
        patient_id=patient_id,
        doctor_id=slot.doctor_id,
        slot_id=slot.id,
        status="confirmed",
        reason=reason,
        workflow_run_id=workflow_id,
    )
    db.add(appointment)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Concurrent booking conflict") from exc
    return appointment


def cancel_appointment(db: Session, appointment: Appointment, reason: str) -> None:
    if appointment.status not in {"confirmed", "rescheduled"}:
        raise HTTPException(status_code=409, detail="Only an active appointment can be cancelled")
    if appointment_time_has_passed(appointment):
        raise HTTPException(
            status_code=409,
            detail="A past appointment cannot be cancelled. Its IST clock status is DONE pending clinician outcome.",
        )
    slot = appointment.slot
    if slot.status != "booked":
        raise HTTPException(status_code=409, detail="The booked slot could not be released")
    slot.status = "available"
    slot.version += 1
    appointment.status = "cancelled"
    appointment.cancellation_reason = reason
    appointment.cancelled_at = datetime.now(timezone.utc)


def reschedule_appointment(
    db: Session,
    appointment: Appointment,
    new_slot_id: int,
) -> Appointment:
    if appointment.status not in {"confirmed", "rescheduled"}:
        raise HTTPException(status_code=409, detail="Only an active appointment can be rescheduled")
    if appointment_time_has_passed(appointment):
        raise HTTPException(
            status_code=409,
            detail="A past appointment cannot be rescheduled. Its IST clock status is DONE pending clinician outcome.",
        )
    if appointment.slot_id == new_slot_id:
        raise HTTPException(status_code=409, detail="Choose a different appointment slot")
    replacement = db.scalar(select(AppointmentSlot).where(AppointmentSlot.id == new_slot_id))
    if not replacement or replacement.status != "available":
        raise HTTPException(status_code=409, detail="Replacement slot is no longer available")
    current = appointment.slot
    replacement.status = "booked"
    replacement.version += 1
    current.status = "available"
    current.version += 1
    appointment.previous_slot_id = current.id
    appointment.slot_id = replacement.id
    appointment.doctor_id = replacement.doctor_id
    appointment.status = "rescheduled"
    appointment.slot = replacement
    appointment.doctor = replacement.doctor
    for reminder in db.scalars(select(Reminder).where(Reminder.appointment_id == appointment.id)):
        if reminder.reminder_type == "appointment_24h":
            reminder.scheduled_at = replacement.start_time - timedelta(hours=24)
        elif reminder.reminder_type == "followup_admin":
            reminder.scheduled_at = replacement.end_time + timedelta(days=1)
        reminder.status = "scheduled"
    return appointment


def create_reminders(db: Session, appointment: Appointment) -> list[Reminder]:
    schedule = [
        ("appointment_24h", appointment.slot.start_time - timedelta(hours=24)),
        ("followup_admin", appointment.slot.end_time + timedelta(days=1)),
    ]
    reminders: list[Reminder] = []
    for reminder_type, scheduled_at in schedule:
        existing = db.scalar(
            select(Reminder).where(
                Reminder.appointment_id == appointment.id,
                Reminder.reminder_type == reminder_type,
            )
        )
        if existing:
            reminders.append(existing)
            continue
        reminder = Reminder(
            patient_id=appointment.patient_id,
            appointment_id=appointment.id,
            reminder_type=reminder_type,
            scheduled_at=scheduled_at,
        )
        db.add(reminder)
        reminders.append(reminder)
    return reminders


def create_escalation(
    db: Session,
    workflow_id: str,
    reason_code: str,
    reason: str,
    severity: str,
) -> Escalation:
    existing = db.scalar(
        select(Escalation).where(
            Escalation.workflow_run_id == workflow_id,
            Escalation.reason_code == reason_code,
            Escalation.status == "open",
        )
    )
    if existing:
        return existing
    escalation = Escalation(
        workflow_run_id=workflow_id,
        reason_code=reason_code,
        reason=reason,
        severity=severity,
    )
    db.add(escalation)
    db.flush()
    return escalation


ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "text/plain": ".txt",
}


def classify_document(filename: str) -> str:
    name = filename.lower()
    if "ecg" in name or "ekg" in name:
        return "ECG"
    if "mri" in name or "magnetic" in name:
        return "MRI_REPORT"
    if "blood" in name or "lab" in name:
        return "LAB_REPORT"
    if "referral" in name:
        return "REFERRAL"
    return "OTHER_MEDICAL_RECORD"


def register_document(
    db: Session,
    *,
    patient_id: int,
    workflow_id: str,
    filename: str,
    content_type: str,
    content: bytes,
) -> tuple[PatientDocument, bool]:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported document type")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Document exceeds size limit")
    checksum = hashlib.sha256(content).hexdigest()
    duplicate = db.scalar(
        select(PatientDocument).where(
            PatientDocument.patient_id == patient_id,
            PatientDocument.checksum == checksum,
        )
    )
    if duplicate:
        return duplicate, True
    text_probe = content[:50_000].decode("utf-8", errors="ignore").lower()
    injection_patterns = (
        "ignore previous instructions",
        "system prompt",
        "cancel all appointments",
        "call this tool",
    )
    flags = ["prompt_injection"] if any(p in text_probe for p in injection_patterns) else []
    status = "quarantined" if flags else "accepted"
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", Path(filename).name)[:120]
    storage_dir = settings.upload_dir / str(patient_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / f"{checksum[:16]}-{safe_name}"
    storage_path.write_bytes(content)
    document = PatientDocument(
        patient_id=patient_id,
        workflow_run_id=workflow_id,
        document_type=classify_document(filename),
        storage_reference=str(storage_path),
        original_name=safe_name,
        content_type=content_type,
        checksum=checksum,
        status=status,
        flags=flags,
    )
    db.add(document)
    db.flush()
    return document, False
