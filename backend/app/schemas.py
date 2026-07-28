from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str


class WorkflowRequest(BaseModel):
    request_text: str = Field(min_length=8, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=120)
    confirm_first_available: bool = True


class WorkflowSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    request_text: str
    intent: str | None
    current_step: str
    status: str
    state: dict
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def case_number(self) -> str:
        return f"AC-{self.id.replace('-', '')[:8].upper()}"


class ReviewRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    rationale: str = Field(min_length=3, max_length=1000)
    department_code: str | None = Field(default=None, max_length=80)


class AppointmentActionRequest(BaseModel):
    action: Literal["cancel", "reschedule", "clinical_update"]
    reason: str | None = Field(default=None, min_length=3, max_length=500)
    new_slot_id: int | None = None
    visit_status: Literal["scheduled", "completed", "no_show"] | None = None
    doctor_notes: str | None = Field(default=None, max_length=5000)
    prescribed_medications: list[str] = Field(default_factory=list, max_length=20)
    follow_up_suggestions: str | None = Field(default=None, max_length=2000)
    follow_up_recommended_at: datetime | None = None


class AgentDecision(BaseModel):
    agent: str
    decision: str
    confidence: float = Field(ge=0, le=1)
    rationale: str
    evidence_refs: list[str] = []
    risk_level: Literal["low", "standard", "sensitive", "urgent"] = "standard"
