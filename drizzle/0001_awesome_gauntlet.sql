ALTER TABLE `aircraft` ADD `operator` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `livery` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `simbrief_airframe_id` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `oew_kg` real;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `mzfw_kg` real;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `mtow_kg` real;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `mlw_kg` real;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `max_fuel_kg` real;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `max_pax` integer;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `equip` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `transponder` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `pbn` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `wake_cat` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `current_icao` text;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `total_hours` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `total_cycles` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `aircraft` ADD `notes` text;