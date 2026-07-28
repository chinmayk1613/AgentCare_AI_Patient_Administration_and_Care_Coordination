from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), index=True)
    facility_scope: Mapped[str] = mapped_column(String(80), default="berlin-demo")
    department_scope: Mapped[str | None] = mapped_column(String(80), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    patient_profile: Mapped[PatientProfile | None] = relationship(back_populates="user")


class PatientProfile(Base):
    __tablename__ = "patient_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    date_of_birth: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(10), default="en")
    emergency_contact: Mapped[str | None] = mapped_column(String(160), nullable=True)
    consent_status: Mapped[str] = mapped_column(String(30), default="granted")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    user: Mapped[User] = relationship(back_populates="patient_profile")


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    department: Mapped[Department] = relationship()


class AppointmentSlot(Base):
    __tablename__ = "appointment_slots"
    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="available", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    doctor: Mapped[Doctor] = relationship()


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (UniqueConstraint("slot_id", name="uq_appointment_slot"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    slot_id: Mapped[int] = mapped_column(ForeignKey("appointment_slots.id"))
    status: Mapped[str] = mapped_column(String(30), default="confirmed")
    reason: Mapped[str] = mapped_column(Text)
    workflow_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    previous_slot_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    doctor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    prescribed_medications: Mapped[list[str]] = mapped_column(JSON, default=list)
    follow_up_suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_recommended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    doctor: Mapped[Doctor] = relationship()
    slot: Mapped[AppointmentSlot] = relationship()


class PatientDocument(Base):
    __tablename__ = "patient_documents"
    __table_args__ = (
        UniqueConstraint("patient_id", "checksum", name="uq_patient_document_checksum"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    workflow_run_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    document_type: Mapped[str] = mapped_column(String(60))
    storage_reference: Mapped[str] = mapped_column(String(500))
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    checksum: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="accepted")
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    request_text: Mapped[str] = mapped_column(Text)
    intent: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_step: Mapped[str] = mapped_column(String(60), default="registration")
    status: Mapped[str] = mapped_column(String(40), default="running", index=True)
    state: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Reminder(Base):
    __tablename__ = "reminders"
    __table_args__ = (
        UniqueConstraint("appointment_id", "reminder_type", name="uq_appointment_reminder"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patient_profiles.id"), index=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"))
    reminder_type: Mapped[str] = mapped_column(String(40))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="scheduled")


class Escalation(Base):
    __tablename__ = "escalations"
    id: Mapped[int] = mapped_column(primary_key=True)
    workflow_run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    reason_code: Mapped[str] = mapped_column(String(80))
    reason: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(primary_key=True)
    workflow_run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PolicyDocument(Base):
    __tablename__ = "policy_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    policy_key: Mapped[str] = mapped_column(String(100), index=True)
    title: Mapped[str] = mapped_column(String(180))
    body: Mapped[str] = mapped_column(Text)
    department_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    version: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="active")
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    workflow_run_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(80))
    outcome: Mapped[str] = mapped_column(String(30), default="success")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ToolInvocation(Base):
    __tablename__ = "tool_invocations"
    id: Mapped[int] = mapped_column(primary_key=True)
    workflow_run_id: Mapped[str] = mapped_column(String(36), index=True)
    agent_name: Mapped[str] = mapped_column(String(80))
    tool_name: Mapped[str] = mapped_column(String(100))
    input_summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="success")
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
