CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flight` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`aircraft_id` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`flight_number` text,
	`dep_icao` text NOT NULL,
	`arr_icao` text NOT NULL,
	`altn_icao` text,
	`route_string` text,
	`cruise_alt_m` real,
	`sched_out_utc` text,
	`sched_in_utc` text,
	`actual_out_utc` text,
	`actual_off_utc` text,
	`actual_on_utc` text,
	`actual_in_utc` text,
	`block_minutes` real,
	`air_minutes` real,
	`fuel_planned_kg` real,
	`fuel_out_kg` real,
	`fuel_in_kg` real,
	`fuel_burn_kg` real,
	`pax` integer,
	`cargo_kg` real,
	`zfw_kg` real,
	`tow_kg` real,
	`ldw_kg` real,
	`ofp_id` text,
	`ofp_json` text,
	`sim_version` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`aircraft_id`) REFERENCES `aircraft`(`id`) ON UPDATE no action ON DELETE no action
);
