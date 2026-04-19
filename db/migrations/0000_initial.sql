CREATE TABLE `accounts` (
	`user_id` varchar(255) NOT NULL,
	`type` varchar(32) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` int,
	`token_type` varchar(64),
	`scope` varchar(512),
	`id_token` text,
	`session_state` varchar(255),
	CONSTRAINT `accounts_provider_provider_account_id_pk` PRIMARY KEY(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `sessions_session_token` PRIMARY KEY(`session_token`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(255) NOT NULL,
	`email_verified` timestamp(3),
	`image` varchar(1024),
	`password_hash` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` varchar(255) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `verification_tokens_identifier_token_pk` PRIMARY KEY(`identifier`,`token`)
);
--> statement-breakpoint
CREATE TABLE `agent_run_steps` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`file_bucket_index` int NOT NULL,
	`step_index` int NOT NULL,
	`tool_id` varchar(64) NOT NULL,
	`file_id` varchar(36),
	`input_json` json NOT NULL,
	`status` enum('pending','running','succeeded','failed','cancelled','skipped') NOT NULL DEFAULT 'pending',
	`ai_output_id` varchar(36),
	`output_file_id` varchar(36),
	`output_text` mediumtext,
	`spent_credits` int NOT NULL DEFAULT 0,
	`idempotency_key` varchar(128),
	`error_code` varchar(64),
	`error_note` text,
	`started_at` timestamp(3),
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_run_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_run_steps_idempotency_idx` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`prompt_text` text NOT NULL,
	`plan_json` json NOT NULL,
	`file_ids_json` json NOT NULL,
	`quote_credits` int NOT NULL,
	`spent_credits` int NOT NULL DEFAULT 0,
	`planner_provider_id` varchar(32),
	`planner_model` varchar(128),
	`status` enum('pending_approval','approved','running','paused','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending_approval',
	`error_code` varchar(64),
	`started_at` timestamp(3),
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_outputs` (
	`file_id` varchar(36) NOT NULL,
	`kind` enum('summary','translation','ocr','comparison') NOT NULL,
	`content_md` mediumtext NOT NULL,
	`meta` json,
	`idempotency_key` varchar(128),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_outputs_file_id` PRIMARY KEY(`file_id`),
	CONSTRAINT `ai_outputs_idempotency_idx` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`label` varchar(128) NOT NULL,
	`key_hash` varchar(128) NOT NULL,
	`prefix` varchar(12) NOT NULL,
	`last_used_at` timestamp(3),
	`revoked_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`role` enum('system','user','assistant') NOT NULL,
	`content` text NOT NULL,
	`provider_id` varchar(32),
	`model` varchar(128),
	`tokens_in` int,
	`tokens_out` int,
	`stop_reason` varchar(32),
	`credit_cost` int,
	`idempotency_key` varchar(128),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_messages_idempotency_idx` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`file_id` varchar(36),
	`title` varchar(256) NOT NULL DEFAULT 'New chat',
	`provider_id` varchar(32),
	`model` varchar(128),
	`archived_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`delta` int NOT NULL,
	`reason` varchar(64) NOT NULL,
	`note` text,
	`payment_id` varchar(36),
	`idempotency_key` varchar(128),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_ledger_idempotency_idx` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `credits` (
	`user_id` varchar(255) NOT NULL,
	`balance` int NOT NULL DEFAULT 0,
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `credits_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`name` varchar(512) NOT NULL,
	`mime` varchar(128) NOT NULL DEFAULT 'application/pdf',
	`size_bytes` bigint NOT NULL DEFAULT 0,
	`sha256` varchar(64),
	`storage_key` varchar(512),
	`status` enum('pending','ready','error') NOT NULL DEFAULT 'pending',
	`source` enum('upload','tool') NOT NULL DEFAULT 'upload',
	`tool_id` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`provider_id` varchar(32) NOT NULL,
	`provider_ref` varchar(128),
	`mode` enum('one_time','subscription') NOT NULL,
	`status` enum('pending','captured','failed','refunded','partial_refund','cancelled') NOT NULL DEFAULT 'pending',
	`amount_minor` bigint NOT NULL,
	`currency` varchar(3) NOT NULL,
	`pack_id` varchar(32),
	`plan_code` varchar(64),
	`subscription_id` varchar(36),
	`metadata` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_provider_ref_idx` UNIQUE(`provider_id`,`provider_ref`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`provider_id` varchar(32) NOT NULL,
	`provider_ref` varchar(128) NOT NULL,
	`plan_code` varchar(64) NOT NULL,
	`status` enum('pending','active','paused','cancelled','failed') NOT NULL DEFAULT 'pending',
	`current_period_start` timestamp(3),
	`current_period_end` timestamp(3),
	`cancelled_at` timestamp(3),
	`metadata` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_provider_ref_idx` UNIQUE(`provider_id`,`provider_ref`)
);
--> statement-breakpoint
CREATE TABLE `user_macros` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`tool_id` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`params_json` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_macros_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_macros_user_tool_name_idx` UNIQUE(`user_id`,`tool_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` varchar(36) NOT NULL,
	`provider_id` varchar(32) NOT NULL,
	`provider_event_id` varchar(128) NOT NULL,
	`event_type` varchar(128) NOT NULL,
	`normalized_kind` varchar(64) NOT NULL,
	`payment_id` varchar(36),
	`raw_payload` json,
	`received_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_provider_event_idx` UNIQUE(`provider_id`,`provider_event_id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_run_steps` ADD CONSTRAINT `agent_run_steps_run_id_agent_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_outputs` ADD CONSTRAINT `ai_outputs_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_session_id_chat_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD CONSTRAINT `credit_ledger_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credits` ADD CONSTRAINT `credits_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `files` ADD CONSTRAINT `files_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_macros` ADD CONSTRAINT `user_macros_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `agent_run_steps_run_order_idx` ON `agent_run_steps` (`run_id`,`file_bucket_index`,`step_index`);--> statement-breakpoint
CREATE INDEX `agent_run_steps_run_status_idx` ON `agent_run_steps` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `agent_run_steps_file_idx` ON `agent_run_steps` (`file_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_user_idx` ON `agent_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);--> statement-breakpoint
CREATE INDEX `agent_runs_created_idx` ON `agent_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_outputs_kind_idx` ON `ai_outputs` (`kind`);--> statement-breakpoint
CREATE INDEX `ai_outputs_created_idx` ON `ai_outputs` (`created_at`);--> statement-breakpoint
CREATE INDEX `api_keys_user_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_session_idx` ON `chat_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_session_created_idx` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_sessions_user_idx` ON `chat_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_sessions_file_idx` ON `chat_sessions` (`file_id`);--> statement-breakpoint
CREATE INDEX `chat_sessions_updated_idx` ON `chat_sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `credit_ledger_user_idx` ON `credit_ledger` (`user_id`);--> statement-breakpoint
CREATE INDEX `credit_ledger_payment_idx` ON `credit_ledger` (`payment_id`);--> statement-breakpoint
CREATE INDEX `files_user_idx` ON `files` (`user_id`);--> statement-breakpoint
CREATE INDEX `files_created_idx` ON `files` (`created_at`);--> statement-breakpoint
CREATE INDEX `files_source_idx` ON `files` (`source`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `payments_provider_idx` ON `payments` (`provider_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `payments_created_idx` ON `payments` (`created_at`);--> statement-breakpoint
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE INDEX `user_macros_user_tool_idx` ON `user_macros` (`user_id`,`tool_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_payment_idx` ON `webhook_events` (`payment_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_received_idx` ON `webhook_events` (`received_at`);