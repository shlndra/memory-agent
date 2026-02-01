import {
  getVendorMemory,
  getCorrectionMemory,
  isDuplicate,
  markInvoiceSeen
} from "../memory/memoryStore";

export async function processInvoice(invoice: any) {

  let reasoning: string[] = [];
  let proposedCorrections: string[] = [];
  let confidenceScore = 0.5;

  // Track applied patterns (avoid duplicates)
  const appliedPatterns = new Set<string>();

  // STEP 1: Duplicate check
  const duplicate = await isDuplicate(
    invoice.vendor,
    invoice.fields.invoiceNumber
  );

  if (duplicate) {
    return {
      normalizedInvoice: invoice.fields,
      proposedCorrections: [],
      requiresHumanReview: true,
      reasoning: "Duplicate invoice detected (same vendor and invoice number)",
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

  // Mark invoice as seen
  markInvoiceSeen(invoice.vendor, invoice.fields.invoiceNumber);

  // STEP 2: Vendor memory
  const memories = await getVendorMemory(invoice.vendor);

  for (const mem of memories) {

    if (
      invoice.rawText.includes(mem.keyword) &&
      invoice.fields[mem.field] === null &&
      !appliedPatterns.has(mem.keyword)
    ) {

      proposedCorrections.push(
        `Auto-suggest ${mem.field} using vendor memory (${mem.keyword})`
      );

      reasoning.push(
        `Used past correction: ${mem.keyword} → ${mem.field}`
      );

      confidenceScore = Math.max(confidenceScore, mem.confidence);

      appliedPatterns.add(mem.keyword);

      // Auto-fill if confident
      if (mem.confidence >= 0.8) {
        invoice.fields[mem.field] = "AUTO_FILLED";
      }
    }
  }

  // STEP 3: VAT correction memory
  const correctionMemories = await getCorrectionMemory(invoice.vendor);

  for (const mem of correctionMemories) {

    if (
      mem.pattern === "VAT_INCLUDED" &&
      (
        invoice.rawText.toLowerCase().includes("vat") ||
        invoice.rawText.toLowerCase().includes("mwst")
      ) &&
      !appliedPatterns.has("VAT")
    ) {

      proposedCorrections.push(
        "VAT already included — suggest tax recalculation"
      );

      reasoning.push(
        "Applied learned VAT-included correction"
      );

      confidenceScore = Math.max(confidenceScore, mem.confidence);

      appliedPatterns.add("VAT");
    }
  }

  // STEP 4: Freight & Co logic
  if (invoice.vendor === "Freight & Co") {

    // Skonto
    if (
      invoice.rawText.toLowerCase().includes("skonto") &&
      !appliedPatterns.has("SKONTO")
    ) {

      proposedCorrections.push(
        "Detected Skonto terms — record as discountTerms"
      );

      reasoning.push(
        "Detected discount terms from historical patterns"
      );

      confidenceScore = Math.max(confidenceScore, 0.6);

      appliedPatterns.add("SKONTO");
    }

    // SKU mapping
    if (
      (
        invoice.rawText.toLowerCase().includes("seefracht") ||
        invoice.rawText.toLowerCase().includes("shipping")
      ) &&
      !appliedPatterns.has("SKU")
    ) {

      proposedCorrections.push(
        "Map description to SKU: FREIGHT"
      );

      reasoning.push(
        "Mapped service description to FREIGHT SKU"
      );

      confidenceScore = Math.max(confidenceScore, 0.6);

      appliedPatterns.add("SKU");
    }
  }

  return {
    normalizedInvoice: invoice.fields,

    proposedCorrections,

    requiresHumanReview: confidenceScore < 0.75,

    reasoning: reasoning.join(". "),

    confidenceScore,

    memoryUpdates: [],

    auditTrail: [
      {
        step: "recall+apply",
        timestamp: new Date().toISOString(),
        details: "Memory recalled and applied"
      }
    ]
  };
}
