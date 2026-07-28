CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_run_id` text,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`outcome` text DEFAULT 'success' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_run_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`document_type` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`checksum` text NOT NULL,
	`status` text NOT NULL,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_patient_checksum_uq` ON `documents` (`patient_id`,`checksum`);--> statement-breakpoint
CREATE TABLE `escalations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_run_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`reviewed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`request_text` text NOT NULL,
	`intent` text,
	`current_step` text NOT NULL,
	`status` text NOT NULL,
	`state_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflows_idempotency_key_uq` ON `workflows` (`idempotency_key`);