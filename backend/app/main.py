from contextlib import asynccontextmanager
from datetime import timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, engine, get_db
from .models import Appointment, AuditEvent, Department, Escalation, PatientDocument, Reminder, ToolInvocation, User, WorkflowRun, utcnow
from .orchestrator import WorkflowOrchestrator
from .schemas import AppointmentActionRequest, LoginRequest, ReviewRequest, TokenResponse, WorkflowRequest, WorkflowSummary
from .security import (
    assert_patient_access,
    create_access_token,
    get_current_user,
    require_roles,
    verify_password,
)
from .services import (
    audit,
    appointment_time_has_passed,
    cancel_appointment,
    policy_gate,
    record_tool,
    register_document,
    reschedule_appointment,
    search_slots,
)

settings = get_settings()
HOSPITAL_TIME_ZONE = ZoneInfo("Asia/Kolkata")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AgentCare Evidence-Gated API",
    version="1.0.0",
    description="Non-clinical patient administration with durable agent orchestration.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "llm_mode": "enabled" if settings.llm_enabled and settings.openai_api_key else "safe-fallback",
        "write_tools": settings.write_tools_enabled,
    }


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email, User.active.is_(True)))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(
        access_token=create_access_token(user),
        role=user.role,
        name=user.name,
    )


@app.get("/api/me")
def me(user: Annotated[User, Depends(get_current_user)]) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "patient_id": user.patient_profile.id if user.patient_profile else None,
    }


@app.post("/api/workflows", response_model=WorkflowSummary)
def create_workflow(
    payload: WorkflowRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("patient"))],
) -> WorkflowRun:
    return WorkflowOrchestrator(db, user).start(
        payload.request_text, payload.idempotency_key, payload.confirm_first_available
    )


@app.get("/api/workflows", response_model=list[WorkflowSummary])
def list_workflows(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[WorkflowRun]:
    stmt = select(WorkflowRun).order_by(WorkflowRun.created_at.desc())
    if user.role == "patient":
        if not user.patient_profile:
            return []
        stmt = stmt.where(WorkflowRun.patient_id == user.patient_profile.id)
    elif user.role not in {"staff", "reviewer", "admin"}:
        raise HTTPException(status_code=403, detail="Workflow access denied")
    return list(db.scalars(stmt))


@app.get("/api/workflows/{workflow_id}")
def workflow_detail(
    workflow_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    run = db.get(WorkflowRun, workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found")
    assert_patient_access(user, run.patient_id)
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.workflow_run_id == run.id)
            .order_by(AuditEvent.created_at)
        )
    )
    invocations = list(
        db.scalars(
            select(ToolInvocation)
            .where(ToolInvocation.workflow_run_id == run.id)
            .order_by(ToolInvocation.created_at)
        )
    )
    return {
        "workflow": WorkflowSummary.model_validate(run),
        "audit": [
            {
                "id": event.id,
                "action": event.action,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "outcome": event.outcome,
                "metadata": event.metadata_json,
                "created_at": event.created_at,
            }
            for event in events
        ],
        "tools": [
            {
                "agent": item.agent_name,
                "tool": item.tool_name,
                "status": item.status,
                "input": item.input_summary,
                "output": item.output_summary,
                "created_at": item.created_at,
            }
            for item in invocations
        ],
    }


def appointment_payload(appointment: Appointment) -> dict:
    time_has_passed = appointment_time_has_passed(appointment)
    display_status = (
        appointment.status
        if appointment.status in {"cancelled", "completed", "no_show"}
        else "done"
        if time_has_passed
        else appointment.status
    )
    clock_now = utcnow()
    return {
        "id": str(appointment.id),
        "workflow_id": appointment.workflow_run_id,
        "patient_id": str(appointment.patient_id),
        "department_code": appointment.doctor.department.code,
        "doctor": appointment.doctor.name,
        "slot_id": str(appointment.slot_id),
        "start_time": appointment.slot.start_time,
        "status": appointment.status,
        "display_status": display_status,
        "reason": appointment.reason,
        "previous_slot_id": str(appointment.previous_slot_id) if appointment.previous_slot_id else None,
        "cancellation_reason": appointment.cancellation_reason,
        "cancelled_at": appointment.cancelled_at,
        "completed_at": appointment.completed_at,
        "doctor_notes": appointment.doctor_notes,
        "prescribed_medications": appointment.prescribed_medications or [],
        "follow_up_suggestions": appointment.follow_up_suggestions,
        "follow_up_recommended_at": appointment.follow_up_recommended_at,
        "clinical_source": "clinician_entered_only",
        "created_at": appointment.created_at,
        "updated_at": appointment.updated_at,
        "clock": {
            "time_zone": "Asia/Kolkata",
            "time_zone_label": "IST",
            "now_utc": clock_now.astimezone(timezone.utc).isoformat(),
            "now_local": clock_now.astimezone(HOSPITAL_TIME_ZONE).isoformat(),
        },
    }


@app.get("/api/appointments/{workflow_id}")
def appointment_detail(
    workflow_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    run = db.get(WorkflowRun, workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Appointment not found")
    assert_patient_access(user, run.patient_id)
    appointment = db.scalar(select(Appointment).where(Appointment.workflow_run_id == workflow_id))
    if not appointment:
        raise HTTPException(status_code=404, detail="No committed appointment exists for this case")
    department_code = appointment.doctor.department.code
    if (
        user.role in {"staff", "reviewer"}
        and user.department_scope not in {None, "all", department_code}
    ):
        raise HTTPException(status_code=403, detail="This appointment is outside your department scope")
    documents = list(
        db.scalars(
            select(PatientDocument)
            .where(PatientDocument.workflow_run_id == workflow_id)
            .order_by(PatientDocument.created_at)
        )
    )
    reminders = list(
        db.scalars(
            select(Reminder)
            .where(Reminder.appointment_id == appointment.id)
            .order_by(Reminder.scheduled_at)
        )
    )
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.workflow_run_id == workflow_id)
            .order_by(AuditEvent.created_at)
        )
    )
    time_has_passed = appointment_time_has_passed(appointment)
    alternatives = (
        search_slots(db, appointment.doctor.department_id, limit=9)
        if appointment.status in {"confirmed", "rescheduled"} and not time_has_passed
        else []
    )
    record_tool(
        db,
        workflow_id,
        "Appointment Agent",
        "search_slots",
        {"department_id": appointment.doctor.department_id, "purpose": "reschedule"},
        {"slot_ids": [slot.id for slot in alternatives]},
    )
    audit(
        db,
        actor_id=user.id,
        workflow_id=workflow_id,
        action="appointment.details.viewed",
        entity_type="appointment",
        entity_id=str(appointment.id),
        metadata={"role": user.role},
    )
    db.commit()
    return {
        "appointment": appointment_payload(appointment),
        "workflow": WorkflowSummary.model_validate(run),
        "documents": [
            {
                "id": item.id,
                "document_type": item.document_type,
                "original_name": item.original_name,
                "status": item.status,
                "created_at": item.created_at,
            }
            for item in documents
        ],
        "reminders": [
            {
                "id": item.id,
                "type": item.reminder_type,
                "scheduled_at": item.scheduled_at,
                "status": item.status,
            }
            for item in reminders
        ],
        "alternative_slots": [
            {
                "id": str(slot.id),
                "doctor": slot.doctor.name,
                "start_time": slot.start_time,
                "department_code": department_code,
            }
            for slot in alternatives
        ],
        "history": [
            {
                "id": event.id,
                "action": event.action,
                "outcome": event.outcome,
                "metadata": event.metadata_json,
                "created_at": event.created_at,
            }
            for event in events
            if event.entity_type == "appointment" or event.action.startswith("appointment.")
        ],
        "capabilities": {
            "can_cancel": not time_has_passed and user.role in {"patient", "staff", "reviewer", "admin"},
            "can_reschedule": not time_has_passed and user.role in {"patient", "staff", "reviewer", "admin"},
            "can_record_clinical_outcome": user.role in {"reviewer", "admin"},
        },
    }


@app.patch("/api/appointments/{workflow_id}")
def update_appointment(
    workflow_id: str,
    payload: AppointmentActionRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    run = db.get(WorkflowRun, workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Appointment not found")
    assert_patient_access(user, run.patient_id)
    appointment = db.scalar(select(Appointment).where(Appointment.workflow_run_id == workflow_id))
    if not appointment:
        raise HTTPException(status_code=404, detail="No committed appointment exists for this case")
    department_code = appointment.doctor.department.code
    if (
        user.role in {"staff", "reviewer"}
        and user.department_scope not in {None, "all", department_code}
    ):
        raise HTTPException(status_code=403, detail="This appointment is outside your department scope")
    state = dict(run.state or {})
    appointment_state = dict(state.get("appointment", {}))
    timeline = list(state.get("timeline", []))

    if payload.action == "cancel":
        policy_gate(user, "appointment:write")
        if not payload.reason:
            raise HTTPException(status_code=400, detail="A cancellation reason is required")
        old_slot_id = appointment.slot_id
        cancel_appointment(db, appointment, payload.reason)
        for reminder in db.scalars(select(Reminder).where(Reminder.appointment_id == appointment.id)):
            reminder.status = "cancelled"
        appointment_state.update(
            {
                "status": "cancelled",
                "cancellation_reason": payload.reason,
                "cancelled_at": appointment.cancelled_at.isoformat(),
            }
        )
        state["reminders"] = [
            {**item, "status": "cancelled"} for item in state.get("reminders", [])
        ]
        state["message"] = "The appointment was cancelled, its slot was released, and its reminders were stopped."
        action = "appointment.cancelled"
        metadata = {"reason": payload.reason, "slot_id": old_slot_id}
        record_tool(
            db,
            workflow_id,
            "Appointment Agent",
            "cancel_appointment",
            {"appointment_id": appointment.id, "slot_id": old_slot_id},
            {"status": "cancelled", "slot_released": True},
        )
        timeline.append({"step": "appointment_cancellation", "status": "complete"})
    elif payload.action == "reschedule":
        policy_gate(user, "appointment:write")
        if payload.new_slot_id is None:
            raise HTTPException(status_code=400, detail="Choose an available replacement slot")
        old_slot_id = appointment.slot_id
        reschedule_appointment(db, appointment, payload.new_slot_id)
        appointment_state.update(
            {
                "status": "rescheduled",
                "doctor": appointment.doctor.name,
                "start_time": appointment.slot.start_time.isoformat(),
                "slot_id": appointment.slot_id,
                "previous_slot_id": old_slot_id,
            }
        )
        state["reminders"] = [
            {
                "id": item.id,
                "type": item.reminder_type,
                "scheduled_at": item.scheduled_at.isoformat(),
                "status": item.status,
            }
            for item in db.scalars(select(Reminder).where(Reminder.appointment_id == appointment.id))
        ]
        state["message"] = "The replacement slot is committed, the previous slot is available again, and reminders were rebuilt."
        action = "appointment.rescheduled"
        metadata = {
            "previous_slot_id": old_slot_id,
            "new_slot_id": appointment.slot_id,
            "doctor": appointment.doctor.name,
            "start_time": appointment.slot.start_time.isoformat(),
        }
        record_tool(
            db,
            workflow_id,
            "Appointment Agent",
            "reschedule_appointment",
            {"current_slot_id": old_slot_id, "new_slot_id": appointment.slot_id},
            {"status": "rescheduled", "previous_slot_released": True},
        )
        timeline.append({"step": "appointment_reschedule", "status": "complete"})
    else:
        if user.role not in {"reviewer", "admin"}:
            raise HTTPException(
                status_code=403,
                detail="Only an authorized clinician can record appointment outcomes, notes, or medicines",
            )
        if payload.visit_status is None:
            raise HTTPException(status_code=400, detail="A valid appointment outcome is required")
        appointment.status = (
            "rescheduled"
            if payload.visit_status == "scheduled" and appointment.status == "rescheduled"
            else "confirmed"
            if payload.visit_status == "scheduled"
            else payload.visit_status
        )
        appointment.completed_at = utcnow() if payload.visit_status == "completed" else None
        appointment.doctor_notes = payload.doctor_notes
        appointment.prescribed_medications = [
            item.strip() for item in payload.prescribed_medications if item.strip()
        ][:20]
        appointment.follow_up_suggestions = payload.follow_up_suggestions
        appointment.follow_up_recommended_at = payload.follow_up_recommended_at
        appointment_state.update(
            {
                "status": appointment.status,
                "completed_at": appointment.completed_at.isoformat()
                if appointment.completed_at
                else None,
                "clinical_record_source": "clinician_entered",
            }
        )
        state["message"] = "The clinician recorded the visit outcome. AgentCare did not generate or alter the clinical content."
        action = "appointment.clinical_record_updated"
        metadata = {
            "source": "clinician_entered",
            "visit_status": payload.visit_status,
            "medication_entries": len(appointment.prescribed_medications),
        }
        timeline.append({"step": "clinician_outcome", "status": "complete"})

    state["appointment"] = appointment_state
    state["timeline"] = timeline
    run.state = state
    audit(
        db,
        actor_id=user.id,
        workflow_id=workflow_id,
        action=action,
        entity_type="appointment",
        entity_id=str(appointment.id),
        metadata=metadata,
    )
    db.commit()
    db.refresh(appointment)
    return {"appointment": appointment_payload(appointment)}


@app.post("/api/workflows/{workflow_id}/documents")
async def upload_document(
    workflow_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("patient", "staff", "admin"))],
    file: Annotated[UploadFile, File()],
    declared_type: Annotated[str | None, Form()] = None,
) -> dict:
    run = db.get(WorkflowRun, workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found")
    assert_patient_access(user, run.patient_id)
    policy_gate(user, "document:write")
    content = await file.read()
    document, was_duplicate = register_document(
        db,
        patient_id=run.patient_id,
        workflow_id=run.id,
        filename=file.filename or "document",
        content_type=file.content_type or "application/octet-stream",
        content=content,
    )
    state = dict(run.state)
    doc_state = dict(state.get("documents", {}))
    expected = list(doc_state.get("expected", []))
    if expected and document.document_type not in expected:
        document.status = "mismatch"
        document.flags = list({*document.flags, "document_type_mismatch"})
        doc_state.update(
            {
                "missing": expected,
                "latest_status": "type_mismatch",
                "latest_mismatch": {
                    "received": document.document_type,
                    "expected": expected,
                    "filename": file.filename,
                },
            }
        )
        state["documents"] = doc_state
        state["message"] = (
            f"Document type mismatch: {document.document_type} was received, but "
            f"{', '.join(expected)} is required. Upload the required document."
        )
        run.state = state
        record_tool(
            db,
            run.id,
            "Document Agent",
            "check_document_requirements",
            {"declared_type": declared_type, "classified_type": document.document_type},
            {"expected": expected, "match": False, "counted": False},
        )
        audit(
            db,
            actor_id=user.id,
            workflow_id=run.id,
            action="document.type_mismatch",
            entity_type="document",
            entity_id=str(document.id),
            metadata={
                "received_document_type": document.document_type,
                "expected_document_types": expected,
                "counted_toward_requirement": False,
            },
        )
        db.commit()
        return {
            "id": document.id,
            "document_type": document.document_type,
            "status": "mismatch",
            "flags": document.flags,
            "duplicate": was_duplicate,
            "missing": expected,
            "warning": state["message"],
        }
    received = list(doc_state.get("received", []))
    if document.document_type not in received and document.status == "accepted":
        received.append(document.document_type)
    doc_state.update(
        {
            "received": received,
            "missing": [item for item in expected if item not in received],
            "latest_status": document.status,
        }
    )
    state["documents"] = doc_state
    run.state = state
    record_tool(
        db,
        run.id,
        "Document Agent",
        "register_document",
        {"filename": file.filename, "content_type": file.content_type},
        {
            "document_id": document.id,
            "type": document.document_type,
            "status": document.status,
            "duplicate": was_duplicate,
        },
    )
    audit(
        db,
        actor_id=user.id,
        workflow_id=run.id,
        action="document.registered",
        entity_type="document",
        entity_id=str(document.id),
        metadata={"status": document.status, "flags": document.flags},
    )
    db.commit()
    return {
        "id": document.id,
        "document_type": document.document_type,
        "status": document.status,
        "flags": document.flags,
        "duplicate": was_duplicate,
        "missing": doc_state["missing"],
    }


@app.get("/api/staff/escalations")
def escalation_queue(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("staff", "reviewer", "admin"))],
) -> list[dict]:
    items = list(
        db.scalars(select(Escalation).order_by(Escalation.status, Escalation.created_at.desc()))
    )
    return [
        {
            "id": item.id,
            "workflow_run_id": item.workflow_run_id,
            "reason_code": item.reason_code,
            "reason": item.reason,
            "severity": item.severity,
            "status": item.status,
            "resolution": item.resolution,
            "reviewed_by": item.reviewed_by,
            "created_at": item.created_at,
            "resolved_at": item.resolved_at,
        }
        for item in items
    ]


@app.get("/api/staff/escalations/{escalation_id}")
def escalation_detail(
    escalation_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("staff", "reviewer", "admin"))],
) -> dict:
    escalation = db.get(Escalation, escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")
    run = db.get(WorkflowRun, escalation.workflow_run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Workflow not found")
    events = list(db.scalars(select(AuditEvent).where(AuditEvent.workflow_run_id == run.id)))
    tools = list(db.scalars(select(ToolInvocation).where(ToolInvocation.workflow_run_id == run.id)))
    documents = list(db.scalars(select(PatientDocument).where(PatientDocument.workflow_run_id == run.id)))
    departments = list(db.scalars(select(Department).where(Department.active.is_(True)).order_by(Department.name)))
    return {
        "escalation": {
            "id": escalation.id,
            "workflow_run_id": escalation.workflow_run_id,
            "reason_code": escalation.reason_code,
            "reason": escalation.reason,
            "severity": escalation.severity,
            "status": escalation.status,
            "resolution": escalation.resolution,
            "reviewed_by": escalation.reviewed_by,
            "created_at": escalation.created_at,
            "resolved_at": escalation.resolved_at,
        },
        "workflow": WorkflowSummary.model_validate(run),
        "departments": [{"code": item.code, "name": item.name} for item in departments],
        "recommended_department": run.state.get("routing", {}).get("recommended_department"),
        "resume_supported": escalation.reason_code == "AMBIGUOUS_DEPARTMENT",
        "documents": [
            {
                "id": item.id,
                "document_type": item.document_type,
                "original_name": item.original_name,
                "status": item.status,
                "checksum": item.checksum[:16],
                "created_at": item.created_at,
            }
            for item in documents
        ],
        "audit": [
            {
                "id": item.id,
                "action": item.action,
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "outcome": item.outcome,
                "metadata": item.metadata_json,
                "created_at": item.created_at,
            }
            for item in events
        ],
        "tools": [
            {
                "agent": item.agent_name,
                "tool": item.tool_name,
                "status": item.status,
                "input": item.input_summary,
                "output": item.output_summary,
                "created_at": item.created_at,
            }
            for item in tools
        ],
    }


@app.post("/api/staff/escalations/{escalation_id}/review")
def review_escalation(
    escalation_id: int,
    payload: ReviewRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("reviewer", "admin"))],
) -> dict:
    policy_gate(user, "escalation:review")
    escalation = db.get(Escalation, escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")
    if escalation.status != "open":
        raise HTTPException(status_code=409, detail="Escalation is already resolved")
    escalation.status = "resolved"
    escalation.reviewed_by = user.id
    escalation.resolution = f"{payload.decision}: {payload.rationale}"
    escalation.resolved_at = utcnow()
    run = db.get(WorkflowRun, escalation.workflow_run_id)
    resumed = False
    if run:
        state = {
            **run.state,
            "human_review": {
                "decision": payload.decision,
                "rationale": payload.rationale,
                "reviewer_id": user.id,
                "department_code": payload.department_code,
            },
        }
        if payload.decision == "approved" and escalation.reason_code == "AMBIGUOUS_DEPARTMENT":
            department = db.scalar(
                select(Department).where(
                    Department.code == payload.department_code,
                    Department.active.is_(True),
                )
            )
            if not department:
                raise HTTPException(status_code=400, detail="A valid department is required")
            slots = search_slots(db, department.id)
            state["routing"] = {
                **state.get("routing", {}),
                "decision": "route",
                "department_id": department.id,
                "department_code": department.code,
                "department_name": department.name,
                "confidence": 1.0,
                "approved_by": user.id,
                "approval_rationale": payload.rationale,
            }
            state["available_slots"] = [
                {
                    "id": slot.id,
                    "start_time": slot.start_time.isoformat(),
                    "doctor": slot.doctor.name,
                    "department_code": department.code,
                }
                for slot in slots
            ]
            state["message"] = (
                f"{department.name} was confirmed by authorized staff. "
                "Choose one of the MCP-backed available slots."
            )
            run.current_step = "availability"
            run.status = "awaiting_input" if slots else "approved_for_manual_action"
            record_tool(
                db,
                run.id,
                "Appointment Agent",
                "search_slots",
                {"department_id": department.id, "resumed_after_approval": True},
                {"slot_ids": [slot.id for slot in slots]},
            )
            resumed = bool(slots)
        else:
            run.status = "approved_for_manual_action" if payload.decision == "approved" else "closed"
        run.state = state
    audit(
        db,
        actor_id=user.id,
        workflow_id=escalation.workflow_run_id,
        action="escalation.reviewed",
        entity_type="escalation",
        entity_id=str(escalation.id),
        metadata={
            "decision": payload.decision,
            "department_code": payload.department_code,
            "resumed": resumed,
        },
    )
    db.commit()
    return {
        "status": escalation.status,
        "workflow_status": run.status if run else None,
        "resumed": resumed,
    }
