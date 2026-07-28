CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`department_code` text NOT NULL,
	`doctor_name` text NOT NULL,
	`slot_id` text NOT NULL,
	`start_time` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`reason` text NOT NULL,
	`previous_slot_id` text,
	`cancellation_reason` text,
	`cancelled_at` text,
	`completed_at` text,
	`doctor_notes` text,
	`prescribed_medications_json` text DEFAULT '[]' NOT NULL,
	`follow_up_suggestions` text,
	`follow_up_recommended_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_workflow_uq` ON `appointments` (`workflow_run_id`);