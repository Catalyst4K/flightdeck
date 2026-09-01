CREATE TABLE `aircraft` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`registration` text NOT NULL,
	`icao_type` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aircraft_registration_unique` ON `aircraft` (`registration`);