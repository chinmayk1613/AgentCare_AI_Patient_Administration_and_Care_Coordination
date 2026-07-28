CREATE TABLE `appointment_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`department_code` text NOT NULL,
	`doctor_name` text NOT NULL,
	`start_time` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`booked_workflow_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointment_slots_doctor_start_uq` ON `appointment_slots` (`doctor_name`,`start_time`);