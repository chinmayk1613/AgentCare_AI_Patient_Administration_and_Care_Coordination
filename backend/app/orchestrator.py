from __future__ import annotations

import re
import uuid
from datetime import timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .agents import APPOINTMENT, COORDINATOR, FOLLOW_UP, ROUTING, SAFETY, AgentHarness
from .models import Appointment, WorkflowRun, User
from .policy_rag import retrieve_policy
from .services import (
    audit,
    book_slot,
    create_escalation,
    create_reminders,
    lookup_department,
    policy_gate,
    record_tool,
    search_slots,
)

EMERGENCY_TERMS = {
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "severe bleeding",
    "unconscious",
    "suicidal",
    "stroke",
}
PROHIBITED_TERMS = {
    "diagnose me",
    "what disease",
    "prescribe",
    "what dosage",
    "change my dose",
    "which medicine",
}


class WorkflowOrchestrator:
    def __init__(self, db: Session, actor: User) -> None:
        self.db = db
        self.actor = actor
        self.harness = AgentHarness()

    def _checkpoint(self, run: WorkflowRun, step: str, patch: dict) -> None:
        state = dict(run.state or {})
        state.update(patch)
        timeline = list(state.get("timeline", []))
        timeline.append({"step": step, "status": "complete"})
        state["timeline"] = timeline
        run.current_step = step
        run.state = state
        run.version += 1
        self.db.flush()
        audit(
            self.db,
            actor_id=self.actor.id,
            workflow_id=run.id,
            action="workflow.checkpoint",
            entity_type="workflow",
            entity_id=run.id,
            metadata={"step": step, "version": run.version},
        )

    def start(
        self, request_text: str, idempotency_key: str, confirm_first_available: bool
    ) -> WorkflowRun:
        policy_gate(self.actor, "workflow:write")
        if not self.actor.patient_profile:
            raise HTTPException(status_code=400, detail="Patient profile is required")
        existing = self.db.scalar(
            select(WorkflowRun).where(WorkflowRun.idempotency_key == idempotency_key)
        )
        if existing:
            return existing
        run = WorkflowRun(
            id=str(uuid.uuid4()),
            patient_id=self.actor.patient_profile.id,
            request_text=request_text,
            idempotency_key=idempotency_key,
            status="running",
            state={"timeline": [], "agent_harness": "openai-agents-sdk-with-safe-fallback"},
        )
        self.db.add(run)
        self.db.flush()
        self._checkpoint(run, "registration", {"patient_resolved": True})

        text = request_text.lower()
        emergency_hits = sorted(term for term in EMERGENCY_TERMS if term in text)
        prohibited_hits = sorted(term for term in PROHIBITED_TERMS if term in text)
        llm_safety = self.harness.propose(
            SAFETY, request_text, {"emergency_hits": emergency_hits, "prohibited_hits": prohibited_hits}
        )
        if emergency_hits or prohibited_hits:
            reason_code = "EMERGENCY_LANGUAGE" if emergency_hits else "CLINICAL_REQUEST_BLOCKED"
            severity = "urgent" if emergency_hits else "high"
            escalation = create_escalation(
                self.db,
                run.id,
                reason_code,
                "Request requires human attention and is outside autonomous administration.",
                severity,
            )
            record_tool(
                self.db,
                run.id,
                SAFETY.name,
                "create_escalation",
                {"reason_code": reason_code},
                {"escalation_id": escalation.id},
            )
            run.status = "human_review"
            self._checkpoint(
                run,
                "safety_escalation",
                {
                    "safety": {
                        "decision": "escalate",
                        "reason_code": reason_code,
                        "llm_proposal": llm_safety.model_dump() if llm_safety else None,
                    },
                    "message": (
                        "This request cannot be handled autonomously. If this may be an emergency, "
                        "contact local emergency services now."
                    ),
                },
            )
            self.db.commit()
            return run

        intent = "cancel" if "cancel" in text else "reschedule" if "reschedul" in text else "book"
        run.intent = intent
        self._checkpoint(
            run,
            "intent_detection",
            {"intent": intent, "safety": {"decision": "allow_administrative", "confidence": 0.99}},
        )

        policies = retrieve_policy(self.db, request_text)
        department, confidence = lookup_department(self.db, request_text)
        llm_route = self.harness.propose(
            ROUTING,
            request_text,
            {"active_policy_evidence": policies, "deterministic_confidence": confidence},
        )
        record_tool(
            self.db,
            run.id,
            ROUTING.name,
            "retrieve_policy",
            {"query_tokens": request_text[:120]},
            {"evidence_refs": [p["evidence_ref"] for p in policies]},
        )
        if not department or confidence < 0.75:
            escalation = create_escalation(
                self.db,
                run.id,
                "AMBIGUOUS_DEPARTMENT",
                "No single administrative department could be selected safely.",
                "medium",
            )
            run.status = "human_review"
            self._checkpoint(
                run,
                "routing_escalation",
                {
                    "routing": {
                        "decision": "human_review",
                        "confidence": confidence,
                        "evidence": policies,
                        "recommended_department": (
                            {"code": department.code, "name": department.name}
                            if department
                            else None
                        ),
                        "llm_proposal": llm_route.model_dump() if llm_route else None,
                    },
                    "escalation_id": escalation.id,
                    "message": "A staff coordinator will confirm the correct department.",
                },
            )
            self.db.commit()
            return run

        self._checkpoint(
            run,
            "department_routing",
            {
                "routing": {
                    "department_id": department.id,
                    "department_code": department.code,
                    "department_name": department.name,
                    "confidence": confidence,
                    "evidence": policies,
                    "llm_proposal": llm_route.model_dump() if llm_route else None,
                }
            },
        )

        if intent != "book":
            escalation = create_escalation(
                self.db,
                run.id,
                "EXISTING_APPOINTMENT_SELECTION_REQUIRED",
                f"{intent.title()} needs the patient or staff to select an existing appointment.",
                "low",
            )
            run.status = "awaiting_input"
            self._checkpoint(
                run,
                "appointment_selection",
                {
                    "escalation_id": escalation.id,
                    "message": "Select the appointment to continue this request.",
                },
            )
            self.db.commit()
            return run

        slots = search_slots(self.db, department.id)
        record_tool(
            self.db,
            run.id,
            APPOINTMENT.name,
            "search_slots",
            {"department_id": department.id},
            {"slot_ids": [slot.id for slot in slots]},
        )
        if not slots:
            escalation = create_escalation(
                self.db, run.id, "NO_SLOTS_AVAILABLE", "No active slots are available.", "low"
            )
            run.status = "human_review"
            self._checkpoint(
                run,
                "availability",
                {"available_slots": [], "escalation_id": escalation.id, "message": "Staff will follow up with availability."},
            )
            self.db.commit()
            return run

        slot_data = [
            {
                "id": slot.id,
                "start_time": slot.start_time.astimezone(timezone.utc).isoformat(),
                "doctor": slot.doctor.name,
            }
            for slot in slots
        ]
        self._checkpoint(run, "availability", {"available_slots": slot_data})
        if not confirm_first_available:
            run.status = "awaiting_input"
            run.state = {**run.state, "message": "Choose one of the available appointment slots."}
            self.db.commit()
            return run

        policy_gate(self.actor, "appointment:write")
        appointment = book_slot(
            self.db,
            patient_id=run.patient_id,
            slot_id=slots[0].id,
            workflow_id=run.id,
            reason=request_text,
        )
        record_tool(
            self.db,
            run.id,
            APPOINTMENT.name,
            "book_slot",
            {"slot_id": slots[0].id, "idempotency_key": f"{run.id}:book:v1"},
            {"appointment_id": appointment.id, "status": appointment.status},
        )
        self._checkpoint(
            run,
            "appointment_booking",
            {
                "appointment": {
                    "id": appointment.id,
                    "status": appointment.status,
                    "doctor": appointment.doctor.name,
                    "start_time": appointment.slot.start_time.astimezone(timezone.utc).isoformat(),
                }
            },
        )

        expected_documents = []
        if re.search(r"\becg\b|\bekg\b", text):
            expected_documents.append("ECG")
        if re.search(r"\bmri\b|\bmagnetic resonance\b", text):
            expected_documents.append("MRI_REPORT")
        if "blood" in text or "lab" in text:
            expected_documents.append("LAB_REPORT")
        self._checkpoint(
            run,
            "document_coordination",
            {
                "documents": {
                    "expected": expected_documents,
                    "received": [],
                    "missing": expected_documents,
                    "instruction": "Upload only records you are authorized to share.",
                }
            },
        )

        reminders = create_reminders(self.db, appointment)
        record_tool(
            self.db,
            run.id,
            FOLLOW_UP.name,
            "create_reminder",
            {"appointment_id": appointment.id},
            {"reminder_ids": [item.id for item in reminders]},
        )
        self._checkpoint(
            run,
            "confirmation_and_followup",
            {
                "reminders": [
                    {
                        "id": item.id,
                        "type": item.reminder_type,
                        "scheduled_at": item.scheduled_at.astimezone(timezone.utc).isoformat(),
                    }
                    for item in reminders
                ],
                "message": (
                    f"Appointment {appointment.id} is confirmed with {appointment.doctor.name} "
                    f"at {appointment.slot.start_time.isoformat()}. "
                    + (
                        f"Still needed: {', '.join(expected_documents)}."
                        if expected_documents
                        else "No requested documents are outstanding."
                    )
                ),
            },
        )
        run.status = "completed"
        run.current_step = "completed"
        audit(
            self.db,
            actor_id=self.actor.id,
            workflow_id=run.id,
            action="workflow.completed",
            entity_type="workflow",
            entity_id=run.id,
            metadata={"coordinator": COORDINATOR.name},
        )
        self.db.commit()
        return run
