import sqlite3 from "sqlite3";

export const db = new sqlite3.Database("memory.db");

export function initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS vendor_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor TEXT,
            keyword TEXT,
            field TEXT,
            confidence REAL
          )
        `);
  
        db.run(`
          CREATE TABLE IF NOT EXISTS correction_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor TEXT,
            pattern TEXT,
            action TEXT,
            confidence REAL
          )
        `);
  
        db.run(`
          CREATE TABLE IF NOT EXISTS seen_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor TEXT,
            invoiceNumber TEXT
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
  

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS correction_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor TEXT,
          pattern TEXT,
          action TEXT,
          confidence REAL
        )
      `);
      

  db.run(`
    CREATE TABLE IF NOT EXISTS seen_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT,
      invoiceNumber TEXT
    )
  `);
});

// ---------------- MEMORY FUNCTIONS ----------------

export function saveVendorMemory(
  vendor: string,
  keyword: string,
  field: string
) {
  db.run(
    `
    INSERT INTO vendor_memory (vendor, keyword, field, confidence)
    VALUES (?, ?, ?, ?)
    `,
    [vendor, keyword, field, 0.6]
  );
}

export function getVendorMemory(vendor: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM vendor_memory WHERE vendor = ?`,
      [vendor],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

export function increaseConfidence(vendor: string, keyword: string) {
  db.run(
    `
    UPDATE vendor_memory
    SET confidence = MIN(confidence + 0.15, 1.0)
    WHERE vendor = ? AND keyword = ?
    `,
    [vendor, keyword]
  );
}

// ---------------- DUPLICATE FUNCTIONS ----------------

export function markInvoiceSeen(vendor: string, invoiceNumber: string) {
  db.run(
    `INSERT INTO seen_invoices (vendor, invoiceNumber) VALUES (?, ?)`,
    [vendor, invoiceNumber]
  );
}

export function isDuplicate(
  vendor: string,
  invoiceNumber: string
): Promise<boolean> {
  return new Promise((resolve) => {
    db.get(
      `SELECT 1 FROM seen_invoices WHERE vendor = ? AND invoiceNumber = ?`,
      [vendor, invoiceNumber],
      (err, row) => {
        resolve(!!row);
      }
    );
  });
}

export function resetSeenInvoices() {
    db.run(`DELETE FROM seen_invoices`);
  }
  
  export function saveCorrectionMemory(
    vendor: string,
    pattern: string,
    action: string
  ) {
    db.run(
      `
      INSERT INTO correction_memory (vendor, pattern, action, confidence)
      VALUES (?, ?, ?, ?)
      `,
      [vendor, pattern, action, 0.6]
    );
  }
  
  export function getCorrectionMemory(vendor: string): Promise<any[]> {
    return new Promise((resolve) => {
      db.all(
        `SELECT * FROM correction_memory WHERE vendor = ?`,
        [vendor],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });
  }

  
  