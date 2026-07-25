import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

import path from "path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "memory.db");
export const db = new sqlite3.Database(dbPath);

/* =====================================================
   INIT DATABASE
===================================================== */
export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {

      // ---------------- VENDOR MEMORY ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS vendor_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor TEXT,
          keyword TEXT,
          field TEXT,
          confidence REAL
        )
      `);

      // ---------------- CORRECTION MEMORY ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS correction_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor TEXT,
          pattern TEXT,
          action TEXT,
          confidence REAL
        )
      `);

      // ---------------- PROCESSED INVOICES ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS processed_invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoiceId TEXT,
          vendor TEXT,
          invoiceNumber TEXT,
          rawText TEXT,
          confidence REAL,
          status TEXT,
          corrections TEXT,
          reasoning TEXT,
          processedAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // ---------------- DUPLICATE TRACKING ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS seen_invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vendor TEXT,
          invoiceNumber TEXT
        )
      `);

      // ---------------- USERS ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          email TEXT UNIQUE,
          phone TEXT,
          passwordHash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          createdAt TEXT DEFAULT (datetime('now'))
        )
      `);

      // ---------------- SESSIONS ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          token TEXT UNIQUE,
          createdAt TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (userId) REFERENCES users(id)
        )
      `);

      // ---------------- USER INVOICES ----------------
      db.run(`
        CREATE TABLE IF NOT EXISTS user_invoices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER,
          filename TEXT,
          rawText TEXT,
          extractedJson TEXT,
          vendor TEXT,
          invoiceNumber TEXT,
          confidence REAL,
          status TEXT,
          corrections TEXT,
          reasoning TEXT,
          uploadedAt TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (userId) REFERENCES users(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });

    });
  });
}

/* =====================================================
   USER MANAGEMENT
===================================================== */

export async function createUser(
  username: string,
  email: string,
  phone: string,
  password: string,
  role: string = "user"
): Promise<number> {
  const hash = await bcrypt.hash(password, 10);
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, email, phone, passwordHash, role) VALUES (?, ?, ?, ?, ?)`,
      [username, email, phone || null, hash, role],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

export function findUserByEmail(email: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function findUserByUsername(username: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function findUserByPhone(phone: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE phone = ?`, [phone], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function findUserById(id: number): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id, username, email, phone, role, createdAt FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/* =====================================================
   SESSION MANAGEMENT
===================================================== */

export function createSession(userId: number): Promise<string> {
  const token = uuidv4();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO sessions (userId, token) VALUES (?, ?)`,
      [userId, token],
      (err) => {
        if (err) reject(err);
        else resolve(token);
      }
    );
  });
}

export function getSession(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT s.*, u.id as uid, u.username, u.email, u.role 
       FROM sessions s 
       JOIN users u ON s.userId = u.id 
       WHERE s.token = ?`,
      [token],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

export function deleteSession(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM sessions WHERE token = ?`, [token], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/* =====================================================
   USER INVOICE STORAGE
===================================================== */

export function saveUserInvoice(data: any): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO user_invoices 
       (userId, filename, rawText, extractedJson, vendor, invoiceNumber, confidence, status, corrections, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.userId,
        data.filename,
        data.rawText,
        data.extractedJson,
        data.vendor,
        data.invoiceNumber,
        data.confidence,
        data.status,
        data.corrections,
        data.reasoning
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

export function getUserInvoices(userId: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM user_invoices WHERE userId = ? ORDER BY id DESC`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

export function getAllUsers(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, username, email, phone, role, createdAt FROM users ORDER BY id DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

export function getAllUserActivity(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT ui.*, u.username, u.email 
       FROM user_invoices ui 
       JOIN users u ON ui.userId = u.id 
       ORDER BY ui.id DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/* =====================================================
   VENDOR MEMORY
===================================================== */

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

/* =====================================================
   CORRECTION MEMORY
===================================================== */

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

/* =====================================================
   DUPLICATE HANDLING
===================================================== */

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

export function resetAllData(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`DELETE FROM seen_invoices`);
      db.run(`DELETE FROM processed_invoices`);
      db.run(`DELETE FROM vendor_memory`);
      db.run(`DELETE FROM correction_memory`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

/* =====================================================
   PROCESSED INVOICE STORAGE
===================================================== */

export function saveProcessedInvoice(data: any) {
  const status = data.isDuplicate
    ? "duplicate"
    : data.requiresHumanReview
    ? "review"
    : "auto";

  db.run(
    `
    INSERT INTO processed_invoices 
    (invoiceId, vendor, invoiceNumber, rawText, confidence, status, corrections, reasoning)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.invoiceId,
      data.vendor,
      data.invoiceNumber,
      data.rawText,
      data.confidenceScore,
      status,
      JSON.stringify(data.proposedCorrections || []),
      data.reasoning || ""
    ]
  );
}