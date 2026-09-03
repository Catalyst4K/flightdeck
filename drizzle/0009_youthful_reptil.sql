CREATE TABLE `landing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flight_id` integer NOT NULL,
	`touchdown_ts_utc` text NOT NULL,
	`vertical_speed_ms` real NOT NULL,
	`g_force` real NOT NULL,
	`pitch_deg` real NOT NULL,
	`bank_deg` real NOT NULL,
	`heading_true_deg` real NOT NULL,
	`indicated_airspeed_ms` real NOT NULL,
	`ground_speed_ms` real NOT NULL,
	`wind_speed_ms` real NOT NULL,
	`wind_direction_deg` real NOT NULL,
	`headwind_ms` real,
	`crosswind_ms` real,
	`runway_ident` text,
	`distance_from_threshold_m` real,
	`centreline_offset_m` real,
	`flap_setting` integer,
	`touchdown_source` text DEFAULT 'derived' NOT NULL,
	FOREIGN KEY (`flight_id`) REFERENCES `flight`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `landing_flight_id_unique` ON `landing` (`flight_id`);--> statement-breakpoint
ALTER TABLE `track_point` ADD `g_force` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `track_point` ADD `wind_speed_ms` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `track_point` ADD `wind_direction_deg` real DEFAULT 0 NOT NULL;