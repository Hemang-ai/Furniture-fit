-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUrl" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "depth" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'inches',
    "imageUrl" TEXT,
    "rawExtractedJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomImagePath" TEXT NOT NULL,
    "polygonPointsJson" TEXT,
    "availableWidth" REAL,
    "availableHeight" REAL,
    "availableDepth" REAL,
    "unit" TEXT NOT NULL DEFAULT 'inches',
    "calibrationMethod" TEXT NOT NULL DEFAULT 'user_entered',
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FitCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "roomImagePath" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "fitReportJson" TEXT,
    "generatedPreviewPath" TEXT,
    CONSTRAINT "FitCheck_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FitCheck_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
