CREATE TABLE `Photo` (
	`id` text PRIMARY KEY NOT NULL,
	`resumeId` text NOT NULL,
	`data` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resumeId`) REFERENCES `Resume`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Photo_resumeId_idx` ON `Photo` (`resumeId`);--> statement-breakpoint
CREATE TABLE `RateLimit` (
	`key` text NOT NULL,
	`windowStart` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `windowStart`)
);
--> statement-breakpoint
CREATE INDEX `RateLimit_windowStart_idx` ON `RateLimit` (`windowStart`);--> statement-breakpoint
CREATE TABLE `ResumeVersion` (
	`id` text PRIMARY KEY NOT NULL,
	`resumeId` text NOT NULL,
	`snapshot` text NOT NULL,
	`photoId` text,
	`note` text,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resumeId`) REFERENCES `Resume`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photoId`) REFERENCES `Photo`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ResumeVersion_resumeId_idx` ON `ResumeVersion` (`resumeId`);--> statement-breakpoint
CREATE TABLE `Resume` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text DEFAULT '我的简历' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`photoId` text,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastArchivedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photoId`) REFERENCES `Photo`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `Resume_userId_idx` ON `Resume` (`userId`);--> statement-breakpoint
CREATE TABLE `Session` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `Session_expire_idx` ON `Session` (`expire`);--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`passwordHash` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_username_unique` ON `User` (`username`);