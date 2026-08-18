-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "user_object" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "target_object" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);
