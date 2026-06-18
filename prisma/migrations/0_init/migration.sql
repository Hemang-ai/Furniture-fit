-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'inches',
    "imageUrl" TEXT,
    "rawExtractedJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "roomImagePath" TEXT NOT NULL,
    "polygonPointsJson" TEXT,
    "availableWidth" DOUBLE PRECISION,
    "availableHeight" DOUBLE PRECISION,
    "availableDepth" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'inches',
    "calibrationMethod" TEXT NOT NULL DEFAULT 'user_entered',
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitCheck" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "roomImagePath" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "fitReportJson" TEXT,
    "generatedPreviewPath" TEXT,

    CONSTRAINT "FitCheck_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FitCheck" ADD CONSTRAINT "FitCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitCheck" ADD CONSTRAINT "FitCheck_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

