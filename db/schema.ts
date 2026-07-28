import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workflows = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    requestText: text("request_text").notNull(),
    intent: text("intent"),
    currentStep: text("current_step").notNull(),
    status: text("status").notNull(),
    stateJson: text("state_json").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("workflows_idempotency_key_uq").on(table.idempotencyKey)],
);

export const escalations = sqliteTable("escalations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowRunId: text("workflow_run_id").notNull(),
  reasonCode: text("reason_code").notNull(),
  reason: text("reason").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  reviewedBy: text("reviewed_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: text("resolved_at"),
});

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workflowRunId: text("workflow_run_id").notNull(),
    patientId: text("patient_id").notNull(),
    documentType: text("document_type").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    checksum: text("checksum").notNull(),
    status: text("status").notNull(),
    flagsJson: text("flags_json").notNull().default("[]"),
    storageReference: text("storage_reference"),
    sizeBytes: integer("size_bytes"),
    checksumAlgorithm: text("checksum_algorithm"),
    patientLinkConfidence: integer("patient_link_confidence"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("documents_patient_checksum_uq").on(table.patientId, table.checksum)],
);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowRunId: text("workflow_run_id"),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  outcome: text("outcome").notNull().default("success"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const uploadSessions = sqliteTable("upload_sessions", {
  id: text("id").primaryKey(),
  workflowRunId: text("workflow_run_id").notNull(),
  patientId: text("patient_id").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  chunkSize: integer("chunk_size").notNull(),
  totalChunks: integer("total_chunks").notNull(),
  receivedChunks: integer("received_chunks").notNull().default(0),
  storagePrefix: text("storage_prefix").notNull(),
  status: text("status").notNull(),
  flagsJson: text("flags_json").notNull().default("[]"),
  documentType: text("document_type"),
  checksum: text("checksum"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const uploadChunks = sqliteTable(
  "upload_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    chunkNumber: integer("chunk_number").notNull(),
    objectKey: text("object_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    flagsJson: text("flags_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("upload_chunks_session_number_uq").on(table.sessionId, table.chunkNumber)],
);

export const appointmentSlots = sqliteTable(
  "appointment_slots",
  {
    id: text("id").primaryKey(),
    departmentCode: text("department_code").notNull(),
    doctorName: text("doctor_name").notNull(),
    startTime: text("start_time").notNull(),
    status: text("status").notNull().default("available"),
    bookedWorkflowId: text("booked_workflow_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("appointment_slots_doctor_start_uq").on(table.doctorName, table.startTime),
  ],
);

export const appointments = sqliteTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id").notNull(),
    patientId: text("patient_id").notNull(),
    departmentCode: text("department_code").notNull(),
    doctorName: text("doctor_name").notNull(),
    slotId: text("slot_id").notNull(),
    startTime: text("start_time").notNull(),
    status: text("status").notNull().default("confirmed"),
    reason: text("reason").notNull(),
    previousSlotId: text("previous_slot_id"),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: text("cancelled_at"),
    completedAt: text("completed_at"),
    doctorNotes: text("doctor_notes"),
    prescribedMedicationsJson: text("prescribed_medications_json").notNull().default("[]"),
    followUpSuggestions: text("follow_up_suggestions"),
    followUpRecommendedAt: text("follow_up_recommended_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("appointments_workflow_uq").on(table.workflowRunId),
  ],
);

export const ragChunks = sqliteTable(
  "rag_chunks",
  {
    id: text("id").primaryKey(),
    documentKey: text("document_key").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    departmentCode: text("department_code"),
    chunkIndex: integer("chunk_index").notNull(),
    chunkType: text("chunk_type").notNull(),
    content: text("content").notNull(),
    termsJson: text("terms_json").notNull().default("[]"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    embeddingJson: text("embedding_json").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    status: text("status").notNull().default("active"),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("rag_chunks_document_version_chunk_uq").on(
      table.documentKey,
      table.version,
      table.chunkIndex,
    ),
  ],
);
