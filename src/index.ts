const { startServer } = require("./server");
const invoices = require("./data/invoices.json");
const corrections = require("./data/human_corrections.json");
const { processInvoice } = require("./engine/processInvoice");

const {
  initDatabase,
  saveVendorMemory,
  saveCorrectionMemory,
  increaseConfidence,
  saveProcessedInvoice,
  resetAllData,
  findUserByEmail,
  createUser
} = require("./memory/memoryStore");

/* =====================================================
   SEED ADMIN USER
===================================================== */
async function seedAdmin() {
  const existing = await findUserByEmail("admin@memoryagent.com");
  if (!existing) {
    await createUser("admin", "admin@memoryagent.com", "", "Shlndra9711", "admin");
    console.log("👑 Admin user created (admin@memoryagent.com)");
  } else {
    console.log("👑 Admin user already exists");
  }
}

/* =====================================================
   MAIN PIPELINE
===================================================== */

async function run() {
  try {
    console.log("🧠 Initializing database...\n");
    await initDatabase();

    // Seed admin user
    await seedAdmin();

    await resetAllData();

    console.log("🧠 Learning from human corrections...\n");

    /* =====================================================
       STEP 1: LEARNING
    ===================================================== */
    for (const hc of corrections) {
      if (hc.finalDecision !== "approved") continue;

      for (const c of hc.corrections) {
        if (c.type === "FIELD_EXTRACTION") {
          saveVendorMemory(hc.vendor, c.keyword, c.field, c.to);
          increaseConfidence(hc.vendor, c.keyword);
          console.log(`✔ Learned field → ${hc.vendor} (${c.keyword})`);
        }

        if (c.type === "BUSINESS_RULE") {
          saveCorrectionMemory(hc.vendor, c.pattern, "AUTO_APPLY");
          increaseConfidence(hc.vendor, c.pattern);
          console.log(`✔ Learned rule → ${hc.vendor} (${c.pattern})`);
        }
      }
    }

    console.log("\n📄 Processing invoices...\n");

    /* =====================================================
       STEP 2: PROCESS INVOICES
    ===================================================== */
    for (const invoice of invoices) {
      try {
        const result = await processInvoice(invoice);

        saveProcessedInvoice({
          invoiceId: invoice.invoiceId,
          vendor: invoice.vendor,
          invoiceNumber: invoice.fields.invoiceNumber,
          rawText: invoice.rawText,
          ...result
        });

        console.log("Processed:", invoice.invoiceId);
        console.log(JSON.stringify(result, null, 2));
        console.log("--------------------------------------------------");

        if (!result.requiresHumanReview && result.confidenceScore >= 0.75) {
          console.log("📈 Confidence reinforced from successful processing");
        }

      } catch (err) {
        console.error("❌ Error processing invoice:", invoice.invoiceId);
        console.error(err);
      }
    }

    console.log("\n✅ Pipeline finished\n");

  } catch (err) {
    console.error("🔥 PIPELINE ERROR:", err);
  }
}

/* =====================================================
   MAIN ENTRY
===================================================== */
async function main() {
  try {
    console.log("🚀 Starting API server...\n");
    startServer();
    console.log("⚙️ Running pipeline...\n");
    await run();
  } catch (err) {
    console.error("🔥 FATAL ERROR:", err);
  }
}

main();