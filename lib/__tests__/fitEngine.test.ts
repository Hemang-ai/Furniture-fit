import {
  calculateFit,
  getClearanceRules,
  updateClearanceRules,
  resetClearanceRules,
  resolveClearance,
  normalizeCategory,
  STANDARD_WARNINGS,
  type CalculateFitInput,
} from "@/lib/fitEngine";

const base = (overrides: Partial<CalculateFitInput> = {}): CalculateFitInput => ({
  category: "refrigerator",
  productDimensions: { width: 30, height: 60, depth: 28, unit: "inches" },
  availableDimensions: { width: 36, height: 66, depth: 32, unit: "inches" },
  ...overrides,
});

afterEach(() => {
  resetClearanceRules();
});

describe("calculateFit — verdicts", () => {
  it("returns FITS with HIGH confidence when there is generous clearance", () => {
    const report = calculateFit(base());
    expect(report.verdict).toBe("FITS");
    expect(report.confidence).toBe("HIGH");
  });

  it("matches the seeded French Door Refrigerator example (FITS)", () => {
    const report = calculateFit({
      category: "refrigerator",
      productDimensions: { width: 35.75, height: 70, depth: 31.5, unit: "inches" },
      availableDimensions: { width: 40, height: 74, depth: 36, unit: "inches" },
    });
    expect(report.verdict).toBe("FITS");
    expect(report.confidence).toBe("HIGH");
  });

  it("returns TIGHT_FIT with MEDIUM confidence when margins are minimal", () => {
    // Dishwasher seed example: exactly meets side clearance (0 slack).
    const report = calculateFit({
      category: "dishwasher",
      productDimensions: { width: 23.75, height: 33.875, depth: 24, unit: "inches" },
      availableDimensions: { width: 24.25, height: 34.5, depth: 25.5, unit: "inches" },
    });
    expect(report.verdict).toBe("TIGHT_FIT");
    expect(report.confidence).toBe("MEDIUM");
  });

  it("returns DOES_NOT_FIT with HIGH confidence and a dimension-specific warning when too large", () => {
    // TV seed example: 57\" wide product into a 50\" niche.
    const report = calculateFit({
      category: "tv",
      productDimensions: { width: 57, height: 32.7, depth: 2.4, unit: "inches" },
      availableDimensions: { width: 50, height: 36, depth: 6, unit: "inches" },
    });
    expect(report.verdict).toBe("DOES_NOT_FIT");
    expect(report.confidence).toBe("HIGH");
    const widthWarnings = report.warnings.filter((w) => /side/i.test(w) && /short by/i.test(w));
    expect(widthWarnings.length).toBeGreaterThan(0);
  });

  it("returns NEED_MORE_DATA / LOW when product dimensions are missing", () => {
    const report = calculateFit(base({ productDimensions: null }));
    expect(report.verdict).toBe("NEED_MORE_DATA");
    expect(report.confidence).toBe("LOW");
    expect(report.productDimensions).toBeNull();
  });

  it("returns NEED_MORE_DATA / LOW when available dimensions are missing", () => {
    const report = calculateFit(base({ availableDimensions: { width: 36 } }));
    expect(report.verdict).toBe("NEED_MORE_DATA");
    expect(report.confidence).toBe("LOW");
  });

  it("returns NEED_MORE_DATA when forceNeedMoreData is set (the 'I don't know' path)", () => {
    const report = calculateFit(base({ forceNeedMoreData: true }));
    expect(report.verdict).toBe("NEED_MORE_DATA");
    expect(report.confidence).toBe("LOW");
  });
});

describe("calculateFit — margin math", () => {
  it("computes left/right/top/rear/total margins correctly", () => {
    const report = calculateFit({
      category: "tv", // zero clearances to isolate margin math
      productDimensions: { width: 30, height: 50, depth: 4, unit: "inches" },
      availableDimensions: { width: 40, height: 56, depth: 10, unit: "inches" },
    });
    expect(report.margins.sideLeft).toBe(5); // (40-30)/2
    expect(report.margins.sideRight).toBe(5);
    expect(report.margins.total).toBe(10); // 40-30
    expect(report.margins.top).toBe(6); // 56-50
    expect(report.margins.rear).toBe(6); // 10-4
  });
});

describe("calculateFit — category-specific clearances", () => {
  it("applies different clearance rules per category", () => {
    expect(resolveClearance("refrigerator")).toEqual({ side: 0.5, top: 1, rear: 2 });
    expect(resolveClearance("range")).toEqual({ side: 0.25, top: 0, rear: 1 });
    expect(resolveClearance("dishwasher")).toEqual({ side: 0.25, top: 0.25, rear: 1 });
    expect(resolveClearance("tv")).toEqual({ side: 0, top: 0, rear: 1 });
  });

  it("uses the washer's larger rear clearance (4 inches)", () => {
    const rules = resolveClearance("washer");
    expect(rules.rear).toBe(4);

    // Product that would fit with a small rear gap fails the 4\" washer rule.
    const report = calculateFit({
      category: "washer",
      productDimensions: { width: 27, height: 38, depth: 33, unit: "inches" },
      availableDimensions: { width: 31, height: 42, depth: 35, unit: "inches" }, // rear gap = 2
    });
    expect(report.verdict).toBe("DOES_NOT_FIT");
    expect(report.warnings.some((w) => /rear/i.test(w) && /short by/i.test(w))).toBe(true);
  });

  it("matches the seeded washer example (FITS with 4\" rear clearance satisfied)", () => {
    const report = calculateFit({
      category: "washer",
      productDimensions: { width: 27, height: 38.7, depth: 31.3, unit: "inches" },
      availableDimensions: { width: 31, height: 42, depth: 37, unit: "inches" },
    });
    expect(report.verdict).toBe("FITS");
  });

  it("treats unknown categories with the default (zero side/top, 1\" rear) rule", () => {
    expect(resolveClearance("spaceship")).toEqual({ side: 0, top: 0, rear: 1 });
    expect(normalizeCategory("spaceship")).toBe("default");
  });
});

describe("calculateFit — edge cases", () => {
  it("treats an exact fit (zero slack after clearance) as TIGHT_FIT, not DOES_NOT_FIT", () => {
    // TV with zero side/top clearance, product exactly as wide as the space.
    const report = calculateFit({
      category: "tv",
      productDimensions: { width: 50, height: 30, depth: 3, unit: "inches" },
      availableDimensions: { width: 50, height: 32, depth: 5, unit: "inches" },
    });
    expect(report.verdict).toBe("TIGHT_FIT");
  });

  it("flags DOES_NOT_FIT when a non-zero clearance is not satisfied at exact size", () => {
    // Refrigerator needs 0.5\" each side but the opening equals the product width.
    const report = calculateFit({
      category: "refrigerator",
      productDimensions: { width: 36, height: 60, depth: 28, unit: "inches" },
      availableDimensions: { width: 36, height: 66, depth: 32, unit: "inches" },
    });
    expect(report.verdict).toBe("DOES_NOT_FIT");
  });
});

describe("calculateFit — custom clearance rules", () => {
  it("respects per-call custom clearance overrides", () => {
    const lenient = calculateFit({
      category: "refrigerator",
      productDimensions: { width: 36, height: 60, depth: 28, unit: "inches" },
      availableDimensions: { width: 36.2, height: 66, depth: 32, unit: "inches" },
      customClearanceRules: { side: 0, top: 0, rear: 0 },
    });
    expect(lenient.verdict).toBe("TIGHT_FIT"); // 0.1\" each side, no clearance required
    expect(lenient.requiredClearances).toEqual({ side: 0, top: 0, rear: 0 });
  });

  it("updateClearanceRules mutates the in-memory rules and getClearanceRules reflects it", () => {
    updateClearanceRules({ refrigerator: { side: 2 } });
    expect(getClearanceRules().refrigerator).toEqual({ side: 2, top: 1, rear: 2 });

    const report = calculateFit({
      category: "refrigerator",
      productDimensions: { width: 30, height: 60, depth: 28, unit: "inches" },
      availableDimensions: { width: 33, height: 66, depth: 32, unit: "inches" }, // 1.5\" each side < 2 required
    });
    expect(report.verdict).toBe("DOES_NOT_FIT");
  });
});

describe("calculateFit — confidence ceiling (AI-estimated dimensions)", () => {
  it("caps a HIGH verdict to LOW when dimensions are AI-estimated", () => {
    const report = calculateFit(base({ confidenceCeiling: "LOW" }));
    expect(report.verdict).toBe("FITS");
    expect(report.confidence).toBe("LOW");
    expect(report.warnings.some((w) => /AI-estimated/i.test(w))).toBe(true);
  });

  it("does not raise confidence above what was computed", () => {
    // Tight fit computes MEDIUM; a HIGH ceiling must not bump it up.
    const report = calculateFit({
      category: "dishwasher",
      productDimensions: { width: 23.75, height: 33.875, depth: 24, unit: "inches" },
      availableDimensions: { width: 24.25, height: 34.5, depth: 25.5, unit: "inches" },
      confidenceCeiling: "HIGH",
    });
    expect(report.confidence).toBe("MEDIUM");
  });
});

describe("calculateFit — standard warnings", () => {
  it("always appends the standard caveats to every report", () => {
    for (const input of [
      base(),
      base({ forceNeedMoreData: true }),
      base({
        productDimensions: { width: 100, height: 100, depth: 100, unit: "inches" },
      }),
    ]) {
      const report = calculateFit(input);
      for (const warning of STANDARD_WARNINGS) {
        expect(report.warnings).toContain(warning);
      }
    }
  });

  it("never returns an empty plain-English summary", () => {
    expect(calculateFit(base()).plainEnglishSummary.length).toBeGreaterThan(0);
  });
});
