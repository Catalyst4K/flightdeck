CREATE TABLE `flight_invoice` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flight_id` integer NOT NULL,
	`service_group` text NOT NULL,
	`receipt_id` text NOT NULL,
	`issued_utc` text NOT NULL,
	`icao` text NOT NULL,
	`tail` text NOT NULL,
	`operator` text,
	`total_usd` real,
	`total_text` text,
	`source_html_path` text NOT NULL,
	`receipt_json` text NOT NULL,
	FOREIGN KEY (`flight_id`) REFERENCES `flight`(`id`) ON UPDATE no action ON DELETE no action
);
