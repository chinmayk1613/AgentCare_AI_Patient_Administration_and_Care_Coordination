CREATE TABLE `rag_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_key` text NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`department_code` text,
	`chunk_index` integer NOT NULL,
	`chunk_type` text NOT NULL,
	`content` text NOT NULL,
	`terms_json` text DEFAULT '[]' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`embedding_json` text NOT NULL,
	`embedding_model` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rag_chunks_document_version_chunk_uq` ON `rag_chunks` (`document_key`,`version`,`chunk_index`);