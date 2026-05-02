const {
  getVendorMemory,
  getCorrectionMemory,
  isDuplicate,
  markInvoiceSeen
} = require("../memory/memoryStore");

async function processInvoice(invoice: any) {

  let reasoning: string[] = [];
  let proposedCorrections: string[] = [];
  let confidenceScore = 0.5;

  // Track applied patterns (avoid duplicates)
  const appliedPatterns = new Set<string>();

  /* =====================================================
     STEP 1: DUPLICATE CHECK
  ===================================================== */
  const duplicate = await isDuplicate(
    invoice.vendor,
    invoice.fields.invoiceNumber
  );

  if (duplicate) {
    return {
      normalizedInvoice: invoice.fields,
      proposedCorrections: [],
      isDuplicate: true,
      requiresHumanReview: true,
      reasoning: "Duplicate invoice detected (same vendor + invoice number)",
      confidenceScore: 0.0,
      memoryUpdates: [],
      auditTrail: [
        {
          step: "decide",
          timestamp: new Date().toISOString(),
          details: "Invoice flagged as duplicate"
        }
      ]
    };
  }

  // mark as seen
  markInvoiceSeen(invoice.vendor, invoice.fields.invoiceNumber);

  /* =====================================================
     STEP 2: VENDOR MEMORY (FIELD EXTRACTION)
  ===================================================== */
  const vendorMemories = await getVendorMemory(invoice.vendor);

  for (const mem of vendorMemories) {

    if (
      invoice.rawText.toLowerCase().includes(mem.keyword.toLowerCase()) &&
      invoice.fields[mem.field] === null &&
      !appliedPatterns.has(mem.keyword)
    ) {

      proposedCorrections.push(
        `Extract ${mem.field} using keyword "${mem.keyword}"`
      );

      reasoning.push(
        `Matched vendor pattern "${mem.keyword}" → ${mem.field}`
      );

      appliedPatterns.add(mem.keyword);

      // simulate extraction (replace later with real parsing)
      const dateMatch = invoice.rawText.match(/\d{2}\.\d{2}\.\d{4}/);

if (dateMatch) {
  const [day, month, year] = dateMatch[0].split(".");
  invoice.fields[mem.field] = `${year}-${month}-${day}`;
}

confidenceScore += 0.25;
if (appliedPatterns.size > 0) {
  confidenceScore += 0.1;
}
    }
  }

  /* =====================================================
     STEP 3: CORRECTION MEMORY (BUSINESS LOGIC)
  ===================================================== */
  const correctionMemories = await getCorrectionMemory(invoice.vendor);

  for (const mem of correctionMemories) {

    // VAT INCLUDED
    if (
      mem.pattern === "VAT_INCLUDED" &&
      (
        invoice.rawText.toLowerCase().includes("vat") ||
        invoice.rawText.toLowerCase().includes("mwst")
      ) &&
      !appliedPatterns.has("VAT")
    ) {

      proposedCorrections.push("VAT included — recalculate tax");

      reasoning.push("Applied VAT_INCLUDED correction rule");

      appliedPatterns.add("VAT");

      confidenceScore += 0.15;
    }

    // FREIGHT DESCRIPTION
    if (
      mem.pattern === "FREIGHT_DESC" &&
      (
        invoice.rawText.toLowerCase().includes("seefracht") ||
        invoice.rawText.toLowerCase().includes("shipping")
      ) &&
      !appliedPatterns.has("FREIGHT")
    ) {

      proposedCorrections.push("Map service to SKU: FREIGHT");

      reasoning.push("Applied FREIGHT mapping rule");

      appliedPatterns.add("FREIGHT");

      confidenceScore += 0.15;
    }
  }

  /* =====================================================
     STEP 4: FREIGHT SPECIAL LOGIC
  ===================================================== */
  if (invoice.vendor === "Freight & Co") {

    if (
      invoice.rawText.toLowerCase().includes("skonto") &&
      !appliedPatterns.has("SKONTO")
    ) {

      proposedCorrections.push("Detected Skonto → add discountTerms");

      reasoning.push("Detected discount terms (Skonto)");

      appliedPatterns.add("SKONTO");

      confidenceScore += 0.1;
    }
  }

  /* =====================================================
     STEP 5: FINAL DECISION
  ===================================================== */

  // normalize confidence
  confidenceScore = Math.min(1.0, confidenceScore);

  const requiresHumanReview = confidenceScore < 0.75;

  return {
    normalizedInvoice: invoice.fields,

    proposedCorrections,

    requiresHumanReview,

    reasoning: reasoning.join(". "),

    confidenceScore,

    memoryUpdates: [],

    auditTrail: [
      {
        step: "recall+apply",
        timestamp: new Date().toISOString(),
        details: "Memory recalled and applied"
      },
      {
        step: "decide",
        timestamp: new Date().toISOString(),
        details: requiresHumanReview
          ? "Low confidence → human review required"
          : "High confidence → auto-approved"
      }
    ]
  };
}

module.exports = { processInvoice };