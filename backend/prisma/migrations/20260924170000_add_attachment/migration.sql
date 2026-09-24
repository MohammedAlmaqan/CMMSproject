-- CreateTable
CREATE TABLE "Attachment" (
    "attachmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT NOT NULL,
    "modifiedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("attachmentId")
);

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_isDeleted_idx" ON "Attachment"("entityType", "entityId", "isDeleted");
