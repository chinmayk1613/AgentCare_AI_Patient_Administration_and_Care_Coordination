CREATE TABLE `api_rate_limits` (
	`rate_key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DELETE FROM `upload_chunks`;
--> statement-breakpoint
DELETE FROM `upload_sessions`;
--> statement-breakpoint
DELETE FROM `documents`;
--> statement-breakpoint
DELETE FROM `audit_events`;
--> statement-breakpoint
DELETE FROM `escalations`;
--> statement-breakpoint
DELETE FROM `appointments`;
--> statement-breakpoint
DELETE FROM `workflows`;
--> statement-breakpoint
UPDATE `appointment_slots`
SET `status` = 'available',
	`booked_workflow_id` = NULL,
	`updated_at` = CURRENT_TIMESTAMP;
