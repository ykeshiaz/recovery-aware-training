-- CreateEnum
CREATE TYPE "Role" AS ENUM ('client', 'trainer');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('apple_health', 'health_connect', 'garmin');

-- CreateEnum
CREATE TYPE "Quadrant" AS ENUM ('aligned_ready', 'aligned_fatigued', 'physical_only', 'mental_only');

-- CreateEnum
CREATE TYPE "AlertTriggerType" AS ENUM ('rolling_7day_flag');

-- CreateEnum
CREATE TYPE "GarminConnectionStatus" AS ENUM ('pending', 'connected', 'disconnected', 'error');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "trainer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_check_ins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mood" INTEGER NOT NULL,
    "motivation" INTEGER NOT NULL,
    "stress" INTEGER NOT NULL,
    "soreness" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "ActivitySource" NOT NULL,
    "hrv_ms" DOUBLE PRECISION,
    "resting_hr" INTEGER,
    "sleep_duration_min" INTEGER,
    "sleep_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_computations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "physical_readiness_score" INTEGER NOT NULL,
    "subjective_readiness_score" INTEGER NOT NULL,
    "quadrant" "Quadrant" NOT NULL,
    "recommendation" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_computations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "ActivitySource" NOT NULL,
    "steps" INTEGER NOT NULL,
    "active_calories" INTEGER,
    "resting_heart_rate" INTEGER,
    "hrv_ms" DOUBLE PRECISION,
    "sleep_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" "ActivitySource" NOT NULL,
    "type" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "calories" INTEGER,
    "avg_heart_rate" INTEGER,
    "distance_meters" DOUBLE PRECISION,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_alerts" (
    "id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "trigger_type" "AlertTriggerType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "coach_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garmin_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "terra_user_id" TEXT,
    "connected_at" TIMESTAMP(3),
    "status" "GarminConnectionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garmin_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_trainer_id_idx" ON "users"("trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_check_ins_user_id_date_key" ON "daily_check_ins"("user_id", "date");

-- CreateIndex
CREATE INDEX "biometric_snapshots_user_id_date_idx" ON "biometric_snapshots"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_snapshots_user_id_date_source_key" ON "biometric_snapshots"("user_id", "date", "source");

-- CreateIndex
CREATE INDEX "readiness_computations_user_id_date_idx" ON "readiness_computations"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_computations_user_id_date_key" ON "readiness_computations"("user_id", "date");

-- CreateIndex
CREATE INDEX "daily_activity_user_id_date_idx" ON "daily_activity"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_activity_user_id_date_source_key" ON "daily_activity"("user_id", "date", "source");

-- CreateIndex
CREATE INDEX "workouts_user_id_started_at_idx" ON "workouts"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "workouts_user_id_source_external_id_key" ON "workouts"("user_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "coach_alerts_trainer_id_resolved_idx" ON "coach_alerts"("trainer_id", "resolved");

-- CreateIndex
CREATE UNIQUE INDEX "garmin_connections_user_id_key" ON "garmin_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "garmin_connections_terra_user_id_key" ON "garmin_connections"("terra_user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_check_ins" ADD CONSTRAINT "daily_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_snapshots" ADD CONSTRAINT "biometric_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_computations" ADD CONSTRAINT "readiness_computations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_alerts" ADD CONSTRAINT "coach_alerts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garmin_connections" ADD CONSTRAINT "garmin_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
