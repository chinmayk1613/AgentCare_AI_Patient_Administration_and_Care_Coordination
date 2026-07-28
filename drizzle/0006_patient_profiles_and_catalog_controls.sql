CREATE TABLE `demo_patient_profiles` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`phone` text,
	`preferred_language` text DEFAULT 'en' NOT NULL,
	`emergency_contact` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hospital_catalog_controls` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`department_code` text NOT NULL,
	`display_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
