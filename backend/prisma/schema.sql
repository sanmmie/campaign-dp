-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('political', 'campaign', 'community', 'youth', 'business', 'event', 'celebration', 'awareness', 'culture', 'custom');

-- CreateEnum
CREATE TYPE "LayerType" AS ENUM ('image', 'text', 'photo', 'shape');

-- CreateEnum
CREATE TYPE "ShapeType" AS ENUM ('rect', 'circle', 'ellipse', 'polygon');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'reviewed', 'dismissed', 'actioned');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('template', 'generation', 'project');

-- CreateTable
CREATE TABLE "CampaignPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authorizedBy" TEXT,
    "authorizationRef" TEXT,
    "disclaimer" TEXT NOT NULL,
    "brandPrimary" TEXT NOT NULL,
    "brandSecondary" TEXT NOT NULL,
    "brandAccent" TEXT NOT NULL,
    "brandLockupId" TEXT,
    "defaultHeadline" TEXT NOT NULL,
    "defaultSubhead" TEXT NOT NULL,
    "shareTargets" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackAsset" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "latestVersion" INTEGER NOT NULL DEFAULT 1,
    "packId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "canvasWidth" INTEGER NOT NULL,
    "canvasHeight" INTEGER NOT NULL,
    "photoZoneX" DOUBLE PRECISION NOT NULL,
    "photoZoneY" DOUBLE PRECISION NOT NULL,
    "photoZoneWidth" DOUBLE PRECISION NOT NULL,
    "photoZoneHeight" DOUBLE PRECISION NOT NULL,
    "photoZoneShape" TEXT NOT NULL,
    "photoZoneBorderRadius" DOUBLE PRECISION,
    "photoZoneLocked" BOOLEAN NOT NULL DEFAULT false,
    "layersJson" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "packId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "templateSnapshot" TEXT NOT NULL,
    "photoUrl" TEXT,
    "photoTransform" TEXT,
    "textValues" TEXT NOT NULL DEFAULT '{}',
    "editorState" TEXT NOT NULL DEFAULT '{}',
    "exportSettings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "defaultName" TEXT,
    "defaultTitle" TEXT,
    "defaultOrganisation" TEXT,
    "defaultWardLGA" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storagePath" TEXT,
    "userId" TEXT,
    "presetId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseReport" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FontDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "weights" INTEGER[],
    "url" TEXT NOT NULL,
    "unicodeRanges" TEXT[],
    "supportsYoruba" BOOLEAN NOT NULL DEFAULT false,
    "variable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FontDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "properties" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPack_brandLockupId_key" ON "CampaignPack"("brandLockupId");

-- CreateIndex
CREATE INDEX "CampaignPack_authorizedBy_idx" ON "CampaignPack"("authorizedBy");

-- CreateIndex
CREATE INDEX "PackAsset_packId_idx" ON "PackAsset"("packId");

-- CreateIndex
CREATE INDEX "Template_packId_idx" ON "Template"("packId");

-- CreateIndex
CREATE INDEX "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX "TemplateVersion_templateId_idx" ON "TemplateVersion"("templateId");

-- CreateIndex
CREATE INDEX "TemplateVersion_isPublished_idx" ON "TemplateVersion"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_packId_idx" ON "Project"("packId");

-- CreateIndex
CREATE INDEX "Project_templateId_idx" ON "Project"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE INDEX "GenerationRecord_projectId_idx" ON "GenerationRecord"("projectId");

-- CreateIndex
CREATE INDEX "GenerationRecord_userId_idx" ON "GenerationRecord"("userId");

-- CreateIndex
CREATE INDEX "GenerationRecord_createdAt_idx" ON "GenerationRecord"("createdAt");

-- CreateIndex
CREATE INDEX "AbuseReport_targetType_targetId_idx" ON "AbuseReport"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AbuseReport_status_idx" ON "AbuseReport"("status");

-- CreateIndex
CREATE INDEX "AbuseReport_reporterId_idx" ON "AbuseReport"("reporterId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_event_idx" ON "AnalyticsEvent"("event");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_timestamp_idx" ON "AnalyticsEvent"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- AddForeignKey
ALTER TABLE "CampaignPack" ADD CONSTRAINT "CampaignPack_brandLockupId_fkey" FOREIGN KEY ("brandLockupId") REFERENCES "PackAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackAsset" ADD CONSTRAINT "PackAsset_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CampaignPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CampaignPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

