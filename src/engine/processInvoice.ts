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
  
    // STEP 2: Recall vendor memory
    const memories = await getVendorMemory(invoice.vendor);
  
    for (const mem of memories) {
      if (
        invoice.rawText.includes(mem.keyword) &&
        invoice.fields[mem.field] === null
      ) {
        proposedCorrections.push(
          `Auto-suggest ${mem.field} using vendor memory (${mem.keyword})`
        );
        reasoning.push(
          `Used past correction: ${mem.keyword} → ${mem.field}`
        );
        confidenceScore = Math.max(confidenceScore, mem.confidence);
      }
    }

    // STEP 3: Apply correction memory (VAT logic)
const correctionMemories = await getCorrectionMemory(invoice.vendor);

for (const mem of correctionMemories) {
    if (
      mem.pattern === "VAT_INCLUDED" &&
      (
        invoice.rawText.toLowerCase().includes("vat") ||
        invoice.rawText.toLowerCase().includes("mwst")
      )
    ) {
      proposedCorrections.push(
        "VAT already included — suggest tax recalculation"
      );
  
      reasoning.push(
        "Learned VAT-included pattern from past Parts AG correction"
      );
  
      confidenceScore = Math.max(confidenceScore, mem.confidence);
    }
  }
  // STEP 4: Freight & Co logic (Skonto + SKU)
if (invoice.vendor === "Freight & Co") {

    // Skonto detection
    if (
      invoice.rawText.toLowerCase().includes("skonto")
    ) {
      proposedCorrections.push(
        "Detected Skonto terms — record as discountTerms"
      );
      reasoning.push(
        "Learned Skonto pattern from Freight & Co invoices"
      );
      confidenceScore = Math.max(confidenceScore, 0.6);
    }
  
    // Description → FREIGHT SKU
    if (
      invoice.rawText.toLowerCase().includes("seefracht") ||
      invoice.rawText.toLowerCase().includes("shipping")
    ) {
      proposedCorrections.push(
        "Map description to SKU: FREIGHT"
      );
      reasoning.push(
        "Learned description-to-SKU mapping for Freight & Co"
      );
      confidenceScore = Math.max(confidenceScore, 0.6);
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
          details: "Vendor memory checked and applied"
        }
      ]
    };
  }
  