CREATE TABLE `upload_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`chunk_number` integer NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`checksum` text NOT NULL,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_chunks_session_number_uq` ON `upload_chunks` (`session_id`,`chunk_number`);--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`chunk_size` integer NOT NULL,
	`total_chunks` integer NOT NULL,
	`received_chunks` integer DEFAULT 0 NOT NULL,
	`storage_prefix` text NOT NULL,
	`status` text NOT NULL,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`document_type` text,
	`checksum` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `storage_reference` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `size_bytes` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `checksum_algorithm` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `patient_link_confidence` integer;