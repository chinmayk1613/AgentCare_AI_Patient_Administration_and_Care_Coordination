import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build contains the AgentCare product and hosted API", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  const [app, styles, layout, hosting, migration, uploadMigration, slotMigration, ragMigration, appointmentMigration, rateLimitMigration, workflowRoute, workflowDetailRoute, advanceRoute, confirmRoute, appointmentRoute, uploadRoute, uploadProcess, reviewRoute, reviewDetailRoute, agentic, accounts, authLib, rateLimit, hospitalCatalog, routingKnowledge, ragPipeline] = await Promise.all([
    readFile(new URL("../app/AgentCareApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_adorable_cloak.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_hot_jazinda.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_wise_cyclops.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_certain_starfox.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_majestic_annihilus.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_dashing_lord_tyger.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflows/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflows/[workflowId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflows/[workflowId]/advance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflows/[workflowId]/confirm-slot/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/appointments/[workflowId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/[sessionId]/process/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/staff/escalations/[escalationId]/review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/staff/escalations/[escalationId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_agentic.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_accounts.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_rate_limit.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_hospital_catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_routing_knowledge.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_rag.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /AgentCare \| Evidence-gated patient administration/);
  assert.match(app, /Your care coordination/);
  assert.match(app, /Safety boundary/);
  assert.match(app, /Coordinated patient journey/);
  assert.match(app, /Request progress/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.match(migration, /CREATE TABLE `workflows`/);
  assert.match(uploadMigration, /CREATE TABLE `upload_sessions`/);
  assert.match(slotMigration, /CREATE TABLE `appointment_slots`/);
  assert.match(slotMigration, /appointment_slots_doctor_start_uq/);
  assert.match(ragMigration, /CREATE TABLE `rag_chunks`/);
  assert.match(ragMigration, /rag_chunks_document_version_chunk_uq/);
  assert.match(appointmentMigration, /CREATE TABLE `appointments`/);
  assert.match(appointmentMigration, /doctor_notes/);
  assert.match(appointmentMigration, /prescribed_medications_json/);
  assert.match(rateLimitMigration, /CREATE TABLE `api_rate_limits`/);
  assert.match(rateLimitMigration, /DELETE FROM `workflows`/);
  assert.match(workflowRoute, /status: "running"/);
  assert.doesNotMatch(workflowRoute, /status: "completed"/);
  assert.match(workflowDetailRoute, /patientDocuments/);
  assert.match(workflowDetailRoute, /checksum_algorithm/);
  assert.match(workflowDetailRoute, /patient_link_confidence/);
  assert.match(workflowDetailRoute, /workflow\.patientId !== identity\.patientId/);
  assert.match(advanceRoute, /callMcpTool\("Routing Agent", "retrieve_approved_policy"/);
  assert.match(advanceRoute, /nextStatus = "awaiting_input"/);
  assert.match(advanceRoute, /nextStatus = expected.length \? "awaiting_document"/);
  assert.match(advanceRoute, /check_document_requirements/);
  assert.match(confirmRoute, /patient_confirmed: true/);
  assert.match(confirmRoute, /book_appointment_slot/);
  assert.match(confirmRoute, /atomic_reservation: true/);
  assert.match(confirmRoute, /db\.insert\(appointments\)/);
  assert.match(appointmentRoute, /cancel_appointment_slot/);
  assert.match(appointmentRoute, /reschedule_appointment_slot/);
  assert.match(appointmentRoute, /clinical:write/);
  assert.match(appointmentRoute, /clinician_entered/);
  assert.match(appointmentRoute, /Asia\/Kolkata/);
  assert.match(appointmentRoute, /display_status/);
  assert.match(appointmentRoute, /appointmentTimeHasPassed/);
  assert.match(agentic, /document-mri/);
  assert.match(agentic, /recommended_department/);
  assert.match(reviewRoute, /resumeRouting \? "running"/);
  assert.match(reviewRoute, /callMcpTool\("Appointment Agent", "find_available_slots"/);
  assert.match(reviewRoute, /finalWorkflowStatus = "awaiting_input"/);
  assert.match(reviewRoute, /finalWorkflowStep = "availability"/);
  assert.match(reviewDetailRoute, /resume_supported/);
  assert.match(agentic, /OPENAI_FINE_TUNED_MODEL/);
  assert.match(agentic, /transport: "mcp-json-rpc"/);
  assert.match(agentic, /inspect_rag_index/);
  assert.match(agentic, /APPROVED_RAG_CONCEPT_MATCH/);
  assert.match(app, /Encrypted private upload/);
  assert.match(app, /Demonstration only — not for clinical use/);
  assert.match(app, /synthetic demonstration data only and no real PHI/);
  assert.match(uploadRoute, /X-AgentCare-Synthetic-Data|x-agentcare-synthetic-data/i);
  assert.match(uploadRoute, /10 MB/);
  assert.match(rateLimit, /status: 429/);
  assert.match(rateLimit, /api_rate_limits/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /setHospitalClock\(Date\.now\(\)\), 1_000/);
  assert.match(app, /await loadWorkflows\(\)/);
  assert.match(app, /Approve route and resume/);
  assert.match(app, /Approved care-routing guidance/);
  assert.match(uploadProcess, /security_scanning/);
  assert.match(uploadProcess, /document\.type_mismatch/);
  assert.match(uploadProcess, /check_document_requirements/);
  assert.match(uploadProcess, /counted_toward_requirement: false/);
  assert.match(app, /Administrative edge-case test catalog/);
  assert.match(app, /Test account/);
  assert.match(app, /processState\.status === "mismatch"/);
  assert.match(accounts, /patient-chinmay/);
  assert.match(accounts, /patient-mayuresh/);
  assert.match(accounts, /reviewer-vikas/);
  assert.match(accounts, /reviewer-arunima/);
  assert.equal((accounts.match(/role: "patient"/g) || []).length, 2);
  assert.equal((accounts.match(/role: "reviewer"/g) || []).length, 2);
  assert.match(authLib, /identityFromRequest/);
  assert.match(authLib, /case_number: caseNumber/);
  assert.match(authLib, /`AC-\$\{row\.id/);
  assert.match(workflowRoute, /identity\.patientId/);
  assert.equal((hospitalCatalog.match(/code: "/g) || []).length, 42);
  assert.match(hospitalCatalog, /exactly three globally unique doctors per department/);
  assert.match(agentic, /HOSPITAL_DEPARTMENTS/);
  assert.match(ragPipeline + routingKnowledge, /never establishes a diagnosis|never establish a diagnosis/i);
  assert.match(agentic, /appointmentSlots\.status, "available"/);
  assert.match(routingKnowledge, /urology-painful-urination/);
  assert.match(routingKnowledge, /requiredTerms: \["urination", "pain"\]/);
  assert.match(routingKnowledge, /analyzeApprovedConcepts/);
  assert.match(ragPipeline, /parseKnowledgeDocuments/);
  assert.match(ragPipeline, /embedKnowledgeText/);
  assert.match(ragPipeline, /semantic section chunks/);
  assert.match(ragPipeline, /retrieveRagEvidence/);
  assert.match(app, /Approved routing indicators/);
  assert.match(app, /% relevance/);
  assert.match(app, /openDocumentCase/);
  assert.match(app, /Medical record coordination/);
  assert.match(app, /File safety screening/);
  assert.match(app, /Hospital time/);
  assert.match(app, /Compliance history/);
  assert.match(app, /Find by case number/);
  assert.match(app, /Search compliance history by case number/);
  assert.match(app, /Only your own requests and activity history are available/);
  assert.match(app, /Patient-owned history/);
  assert.match(app, /topbar-ist-clock/);
  assert.match(styles, /grid-template-columns: minmax\(260px, 320px\) minmax\(0, 1fr\)/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.doesNotMatch(app, /RAG evidence packet|Agent and MCP trace|Live SQL workflow/);
  assert.match(app, /Appointment done\?/);
  assert.match(app, /Cancel appointment/);
  assert.match(app, /Choose a replacement slot/);
  assert.match(app, /Never generated by AgentCare/);
  assert.match(app, /HOSPITAL_TIME_ZONE = "Asia\/Kolkata"/);
  assert.match(app, /appointmentDisplayStatus/);
  assert.match(app, /DONE · scheduled time passed/);
  assert.match(app, /Clinician outcome is still pending/);
  assert.doesNotMatch(app, /Thursday, 23 July/);
  assert.doesNotMatch(app + layout, /codex-preview|react-loading-skeleton/);
});
