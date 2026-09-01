CREATE TABLE `track_point` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flight_id` integer NOT NULL,
	`ts_utc` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`altitude_m` real NOT NULL,
	`altitude_agl_m` real NOT NULL,
	`indicated_airspeed_ms` real NOT NULL,
	`ground_speed_ms` real NOT NULL,
	`vertical_speed_ms` real NOT NULL,
	`heading_true_deg` real NOT NULL,
	`pitch_deg` real NOT NULL,
	`bank_deg` real NOT NULL,
	`phase` text NOT NULL,
	`on_ground` integer NOT NULL,
	`fuel_kg` real NOT NULL,
	FOREIGN KEY (`flight_id`) REFERENCES `flight`(`id`) ON UPDATE no action ON DELETE no action
);
