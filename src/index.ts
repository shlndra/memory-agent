import invoices from "./data/invoices.json";
import corrections from "./data/human_corrections.json";
import { processInvoice } from "./engine/processInvoice";
import {
  initDatabase,
  saveVendorMemory,
  saveCorrectionMemory,
  increaseConfidence,
  resetSeenInvoices
} from "./memory/memoryStore";

async function run() {
  // STEP 0: init DB
  await initDatabase();

  // Reset duplicates per run
  resetSeenInvoices();

  // ---------------- STEP 1: LEARN FROM HUMAN CORRECTIONS ----------------
  for (const hc of corrections) {
    if (hc.finalDecision !== "approved") continue;

    for (const c of hc.corrections) {

      // Supplier GmbH → Leistungsdatum
      if (
        hc.vendor === "Supplier GmbH" &&
        c.reason.includes("Leistungsdatum")
      ) {
        saveVendorMemory(
          hc.vendor,
          "Leistungsdatum",
          c.field
        );
        increaseConfidence(hc.vendor, "Leistungsdatum");
        console.log("LEARNED memory for:", hc.vendor);
      }

      // Parts AG → VAT included
      if (
        hc.vendor === "Parts AG" &&
        c.reason.toLowerCase().includes("vat")
      ) {
        saveCorrectionMemory(
          "Parts AG",
          "VAT_INCLUDED",
          "RECALCULATE_TAX"
        );
        increaseConfidence("Parts AG", "VAT_INCLUDED");
        console.log("LEARNED VAT logic for Parts AG");
      }

      // Freight & Co → Skonto
      if (
        hc.vendor === "Freight & Co" &&
        c.reason.toLowerCase().includes("skonto")
      ) {
        saveVendorMemory(
          "Freight & Co",
          "Skonto",
          "discountTerms"
        );
        increaseConfidence("Freight & Co", "Skonto");
        console.log("LEARNED Skonto logic for Freight & Co");
      }

      // Freight & Co → SKU mapping
      if (
        hc.vendor === "Freight & Co" &&
        c.reason.toLowerCase().includes("freight")
      ) {
        saveCorrectionMemory(
          "Freight & Co",
          "FREIGHT_DESC",
          "MAP_TO_FREIGHT_SKU"
        );
        increaseConfidence("Freight & Co", "FREIGHT_DESC");
        console.log("LEARNED SKU mapping for Freight & Co");
      }
    }
  }

  // ---------------- STEP 2: PROCESS INVOICES ----------------
  for (const invoice of invoices) {
    const result = await processInvoice(invoice);
    console.log("AFTER LEARNING:");
    console.log(JSON.stringify(result, null, 2));
  }
}

run();
