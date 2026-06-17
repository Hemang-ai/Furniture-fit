import { config } from "dotenv";
config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

import { PrismaClient } from "@prisma/client";
import { calculateFit } from "../lib/fitEngine";

const prisma = new PrismaClient();

interface SeedSpec {
  product: {
    name: string;
    category: string;
    width: number;
    height: number;
    depth: number;
    sourceUrl?: string;
    imageUrl?: string;
  };
  available: { width: number; height: number; depth: number };
  expected: string; // documented expectation
}

const SEEDS: SeedSpec[] = [
  {
    product: {
      name: "French Door Refrigerator",
      category: "refrigerator",
      width: 35.75,
      height: 70,
      depth: 31.5,
    },
    available: { width: 40, height: 74, depth: 36 },
    expected: "FITS",
  },
  {
    product: {
      name: "Stainless Steel Dishwasher",
      category: "dishwasher",
      width: 23.75,
      height: 33.875,
      depth: 24,
    },
    available: { width: 24.25, height: 34.5, depth: 25.5 },
    expected: "TIGHT_FIT",
  },
  {
    product: {
      name: "Front-Load Washer",
      category: "washer",
      width: 27,
      height: 38.7,
      depth: 31.3,
    },
    available: { width: 31, height: 42, depth: 37 },
    expected: "FITS",
  },
  {
    product: {
      name: '65" Wall-Mounted TV',
      category: "tv",
      width: 57,
      height: 32.7,
      depth: 2.4,
    },
    available: { width: 50, height: 36, depth: 6 },
    expected: "DOES_NOT_FIT",
  },
];

async function main() {
  console.log("Seeding FitVision AI database...\n");

  // Idempotent: clear existing data, then recreate.
  await prisma.fitCheck.deleteMany();
  await prisma.measurement.deleteMany();
  await prisma.product.deleteMany();

  const urls: string[] = [];

  for (const seed of SEEDS) {
    const unit = "inches";

    const report = calculateFit({
      category: seed.product.category,
      productDimensions: { ...dims(seed.product), unit },
      availableDimensions: { ...seed.available, unit },
    });

    const product = await prisma.product.create({
      data: {
        name: seed.product.name,
        category: seed.product.category,
        width: seed.product.width,
        height: seed.product.height,
        depth: seed.product.depth,
        unit,
        sourceUrl: seed.product.sourceUrl ?? null,
        imageUrl: seed.product.imageUrl ?? null,
      },
    });

    const measurement = await prisma.measurement.create({
      data: {
        roomImagePath: "/uploads/sample-room.svg",
        polygonPointsJson: JSON.stringify([
          { x: 0.3, y: 0.3 },
          { x: 0.7, y: 0.3 },
          { x: 0.7, y: 0.8 },
          { x: 0.3, y: 0.8 },
        ]),
        availableWidth: seed.available.width,
        availableHeight: seed.available.height,
        availableDepth: seed.available.depth,
        unit,
        calibrationMethod: "user_entered",
        confidence: "MEDIUM",
      },
    });

    const fitCheck = await prisma.fitCheck.create({
      data: {
        status: "complete",
        roomImagePath: measurement.roomImagePath,
        productId: product.id,
        measurementId: measurement.id,
        fitReportJson: JSON.stringify(report),
      },
    });

    const ok = report.verdict === seed.expected ? "OK" : `MISMATCH (expected ${seed.expected})`;
    urls.push(`  /fit-check/${fitCheck.id}  ->  ${report.verdict}  [${ok}]  (${seed.product.name})`);
  }

  console.log("Seeded fit checks:");
  console.log(urls.join("\n"));
  console.log("\nStart the app with `npm run dev` and open the URLs above.");
}

function dims(p: { width: number; height: number; depth: number }) {
  return { width: p.width, height: p.height, depth: p.depth };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
