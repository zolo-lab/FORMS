ALTER TABLE "requests" ADD COLUMN "campaign" text;--> statement-breakpoint
CREATE INDEX "requests_campaign_idx" ON "requests" USING btree ("campaign");