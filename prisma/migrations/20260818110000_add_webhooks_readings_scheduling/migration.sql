-- Device: add hmacSecret, make serial_number globally unique instead of per-tenant
ALTER TABLE "devices" ADD COLUMN "hmac_secret" TEXT;
UPDATE "devices" SET "hmac_secret" = md5(random()::text || id) WHERE "hmac_secret" IS NULL;
ALTER TABLE "devices" ALTER COLUMN "hmac_secret" SET NOT NULL;

ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_tenant_id_serial_number_key";
ALTER TABLE "devices" ADD CONSTRAINT "devices_serial_number_key" UNIQUE ("serial_number");

-- WebhookEvent
CREATE TABLE "webhook_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "external_event_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_device_id_external_event_id_key" ON "webhook_events"("device_id", "external_event_id");
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reading
CREATE TABLE "readings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "patient_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "webhook_event_id" TEXT NOT NULL,
  "heart_rate" INTEGER NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "readings_webhook_event_id_key" ON "readings"("webhook_event_id");
ALTER TABLE "readings" ADD CONSTRAINT "readings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "readings" ADD CONSTRAINT "readings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "readings" ADD CONSTRAINT "readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "readings" ADD CONSTRAINT "readings_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Alert: dedupe key
ALTER TABLE "alerts" ADD COLUMN "dedupe_key" TEXT;

-- ScheduledJobRun
CREATE TABLE "scheduled_job_runs" (
  "id" TEXT NOT NULL,
  "tick_key" TEXT NOT NULL,
  "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "run_by_pid" INTEGER NOT NULL,
  CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scheduled_job_runs_tick_key_key" ON "scheduled_job_runs"("tick_key");
