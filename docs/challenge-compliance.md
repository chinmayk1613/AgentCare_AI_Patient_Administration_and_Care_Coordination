# AgentCare challenge compliance audit

Audited against the supplied challenge statement on 2026-07-28.

## Core journey

| Requirement | Status | Implementation evidence |
|---|---|---|
| Identify or create patient record | Implemented | Authentication resolves a persisted synthetic patient profile; the ownership-scoped My profile workspace performs audited backend updates. |
| Detect administrative intent | Implemented | Safety and Intent agents persist `book`, `reschedule`, or `cancel` proposals and checkpoints. |
| Route to department | Implemented | Versioned RAG chunks, retrieval evidence, approved concepts, confidence gates, and human review are wired to the routing workflow. |
| Retrieve doctors and live slots | Implemented | The Appointment Agent invokes MCP against transactional SQL slot state and excludes booked slots. |
| Book appointment | Implemented | Explicit slot confirmation performs a conditional reservation and writes a persisted appointment record. |
| Reschedule appointment | Implemented | The agentic request flow and appointment detail window reserve a replacement before releasing the current slot, recover on conflicts, rebuild reminders, and audit the change. |
| Cancel appointment | Implemented | The agentic request flow and appointment detail window release the exact owned slot, stop reminders, retain history, and audit the change. |
| Coordinate documents | Implemented | Chunked R2 upload, SQL metadata, classification, type mismatch, duplicate checksum, missing-document checks, quarantine, and workflow resume are wired. |
| Confirmation and reminders | Implemented | Confirmation and administrative reminder state are rebuilt from committed appointment data. |
| Follow-up scheduling | Implemented | Administrative follow-up reminders are persisted. Clinician follow-up suggestions are stored only as clinician-entered data. |
| Human escalation | Implemented | Emergency, prohibited clinical, ambiguous routing, unavailable slots, and unsafe document cases create persisted escalation/audit evidence. |

## Roles and authorization

| Requirement | Status | Implementation evidence |
|---|---|---|
| Patient submits requests and views status | Implemented | Patient-scoped workflow APIs and UI. |
| Patient books, reschedules, and cancels | Implemented | Backend ownership checks plus appointment actions in the detail window and natural-language agent flow. |
| Patient uploads and views documents | Implemented | Patient ownership is enforced by backend routes. |
| Patient views reminders/follow-up | Implemented | A dedicated Reminders & Follow-up workspace displays persisted task type, scheduled IST time, status, case number, appointment context, and clinician-entered follow-up records; appointment detail remains available for the full case. |
| Patient creates/updates profile | Implemented | My profile calls a patient-only API, persists phone/language/emergency contact, and audits the update. |
| Staff reviews escalations and approvals | Implemented | Staff-only APIs, complete evidence package, decision rationale, workflow resume, and audit log. |
| Staff views workflow/audit history | Implemented | Staff workbench and audit evidence UI. |
| Staff manages departments/doctors/slots | Implemented | Staff-only directory APIs and UI persist department/doctor activation controls, create unique future slots, protect booked slots, and audit changes. |
| Clinician records outcome/notes/medicines | Implemented extension | Only accounts with backend `clinical:write` permission (or Python reviewer/admin role) can enter clinical records. AgentCare never generates them. |

## Technical and agentic requirements

| Requirement | Status | Implementation evidence |
|---|---|---|
| Meaningful Python backend | Implemented | FastAPI, SQLAlchemy, Alembic, orchestration, tools, RBAC, safety, appointment lifecycle, documents, escalation, and tests. |
| LLM integration | Implemented, runtime-configured | OpenAI Responses API integration prefers a configured fine-tuned model and uses a deterministic safe fallback when no key is available. A deployment key is required to demonstrate live model execution. |
| Three distinct agents | Implemented | Coordinator, Safety, Routing, Appointment, Document, and Follow-up responsibilities, prompts, tool allowlists, and outputs are distinct. |
| Three functional tools | Implemented | RAG retrieval, department lookup, SQL availability, booking/reschedule/cancel, document requirements/storage, escalation, and reminders perform real work. |
| MCP | Implemented | JSON-RPC tool discovery/calls use an AgentCare hospital administration MCP surface with persisted tool traces. |
| Persistent SQL and workflow state | Implemented | SQLite/PostgreSQL-compatible Python backend plus D1 hosted workflow, appointment, slot, document, RAG, escalation, and audit tables. |
| RAG parsing/chunking/embeddings | Implemented | Versioned parsing, semantic chunks, embeddings, retrieval scoring, citations, and approved routing concepts. |
| Human approval | Implemented | Backend-enforced decision routes persist reviewer identity, rationale, resolution, and resumed state. |
| Audit logging | Implemented | Agent proposals, MCP calls, workflow checkpoints, appointment changes, document decisions, and clinical record updates are audited. |
| Retry/recovery | Implemented | Idempotency, upload processing retries, slot conflict refresh, reschedule rollback, and safe workflow pauses. |
| Environment configuration | Implemented | Model/API/runtime values are environment-driven; examples contain placeholders only. |
| Synthetic data and secret safety | Implemented with repository caution | Demo identities/data are synthetic. The local untracked `ECG-Sample-Report.pdf` must not be committed if it contains sensitive information. |
| Working user interface | Implemented | Patient workflow, appointment detail/actions, document coordination, staff review, and audit surfaces call backend logic. |

## Eligibility and disqualification pre-check

| Rule | Status | Evidence |
|---|---|---|
| Accessible source and branch | Pass | Public repository, `main`, complete source and workflows. |
| Meaningful Python backend | Pass | FastAPI/SQLAlchemy/Alembic backend with orchestration, tools, persistence, RBAC, and tests. |
| Agentic AI | Pass | OpenAI client plus multi-step agents, RAG, MCP tools, state hand-offs, and persisted outcomes. |
| Persistent SQL | Pass | SQLite/PostgreSQL-ready backend and hosted D1 relational state. |
| Healthcare safety | Pass | Deterministic prohibition of diagnosis, prescription, dosage, and autonomous clinical interpretation. |
| Data and secret safety | Pass | Synthetic repository data, gitignored environment files, server-only hosted secrets, and private uploads. |

## Deliberately bounded production integration

The demo creates and persists real reminder/notification tasks and exposes
their lifecycle in the interface. It does not claim delivery through an
external SMS/email provider. Production delivery requires a hospital-approved
provider, consent policy, templates, credentials, retries, and delivery
receipts. Insurance, billing, bed allocation, pharmacy operations, staff
scheduling, and operating-theatre scheduling remain optional extensions and
are not required for the core score.
