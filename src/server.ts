import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";

import {
  db,
  findUserByEmail,
  findUserByUsername,
  findUserByPhone,
  findUserById,
  createUser,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
  saveUserInvoice,
  getUserInvoices,
  getAllUsers,
  getAllUserActivity
} from "./memory/memoryStore";

/* =====================================================
   EXTEND Request with user info
===================================================== */
interface AuthRequest extends Request {
  user?: any;
}

/* =====================================================
   MULTER – file uploads
===================================================== */
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.match(/\.(pdf|jpg|jpeg|png|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files (JPG, PNG, WEBP) are allowed"));
    }
  }
});

/* =====================================================
   AUTH MIDDLEWARE
===================================================== */
async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const token = authHeader.split(" ")[1];
  try {
    const session = await getSession(token);
    if (!session) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    req.user = { id: session.uid, username: session.username, email: session.email, role: session.role };
    next();
  } catch (err) {
    res.status(500).json({ error: "Auth error" });
  }
}

function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/* =====================================================
   START SERVER
===================================================== */
export function startServer() {
  const app = express();
  const PORT = process.env.PORT || 5050;

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  app.use(express.json());

  /* =====================================================
     HEALTH CHECK
  ===================================================== */
  app.get("/", (_req: Request, res: Response) => {
    res.send("Memory Agent API Running");
  });

  /* =====================================================
     AUTH: REGISTER
  ===================================================== */
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, email, phone, password } = req.body;

      if (!email || !password || !username) {
        res.status(400).json({ error: "Username, email, and password are required" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      // Check if user already exists
      const existing = await findUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      const existingUsername = await findUserByUsername(username);
      if (existingUsername) {
        res.status(409).json({ error: "Username already taken" });
        return;
      }

      const userId = await createUser(username, email, phone || "", password, "user");
      const token = await createSession(userId);

      res.status(201).json({
        message: "Account created successfully",
        token,
        user: { id: userId, username, email, role: "user" }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Registration failed" });
    }
  });

  /* =====================================================
     AUTH: LOGIN
  ===================================================== */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { identity, password, loginType } = req.body;

      if (!identity || !password) {
        res.status(400).json({ error: "Credentials required" });
        return;
      }

      let user: any = null;

      if (loginType === "email" || identity.includes("@")) {
        user = await findUserByEmail(identity);
      } else if (loginType === "phone") {
        user = await findUserByPhone(identity);
      } else {
        user = await findUserByUsername(identity);
      }

      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const token = await createSession(user.id);

      res.json({
        message: "Login successful",
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Login failed" });
    }
  });

  /* =====================================================
     AUTH: ME (get current user)
  ===================================================== */
  app.get("/api/auth/me", authMiddleware, (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
  });

  /* =====================================================
     AUTH: LOGOUT
  ===================================================== */
  app.post("/api/auth/logout", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const token = req.headers.authorization!.split(" ")[1];
      await deleteSession(token);
      res.json({ message: "Logged out" });
    } catch (err) {
      res.status(500).json({ error: "Logout failed" });
    }
  });

  /* =====================================================
     UPLOAD INVOICE (user-facing)
  ===================================================== */
  app.post("/api/upload-invoice", authMiddleware, upload.single("invoice"), async (req: AuthRequest, res: Response) => {
    console.log(`[UPLOAD] Request received: ${req.file?.originalname} (${req.file?.mimetype})`);
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const filePath = req.file.path;
      const filename = req.file.originalname;
      const mimetype = req.file.mimetype;

      let rawText = "";

      if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
        // Extract text from PDF
        try {
          const { PDFParse } = await import("pdf-parse");
          
          const dataBuffer = fs.readFileSync(filePath);
          const pdfParser = new (PDFParse as any)({ data: new Uint8Array(dataBuffer) });
          const result = await pdfParser.getText();
          rawText = (typeof result === "string" ? result : result?.text) || "";
        } catch (pdfErr: any) {
          console.error(`[PDF ERROR] ${pdfErr.message}`);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          res.status(400).json({ error: `Failed to parse PDF: ${pdfErr.message}` });
          return;
        }
      } else {
        // OCR for images
        try {
          const Tesseract = await import("tesseract.js");
          // Use the static recognize method for simplicity and better error isolation
          const { data: { text } } = await Tesseract.recognize(filePath, "eng", {
            logger: m => console.log(`[OCR PROGRESS] ${m.status}: ${Math.round(m.progress * 100)}%`)
          });
          rawText = text;
        } catch (ocrErr: any) {
          console.error(`[OCR ERROR] ${ocrErr.message}`);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          res.status(400).json({ error: "Failed to process image OCR. Ensure it's a valid image." });
          return;
        }
      }

      // Clean up uploaded file
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      if (!rawText.trim()) {
        res.status(400).json({ error: "No text could be extracted from the file" });
        return;
      }

      // Try to extract structured fields from the raw text
      const extracted = extractFieldsFromText(rawText);

      // Run through memory agent engine
      const { processInvoice } = require("./engine/processInvoice");

      const invoiceObj = {
        invoiceId: `USER-${Date.now()}`,
        vendor: extracted.vendor || req.body.vendor || "Unknown",
        fields: {
          invoiceNumber: extracted.invoiceNumber || "—",
          serviceDate: extracted.serviceDate || null
        },
        rawText: rawText.substring(0, 2000) // limit raw text size
      };

      const result = await processInvoice(invoiceObj);

      const status = result.isDuplicate ? "duplicate" : result.requiresHumanReview ? "review" : "auto";

      // Save to user's history
      const invoiceId = await saveUserInvoice({
        userId: req.user.id,
        filename,
        rawText: rawText.substring(0, 2000),
        extractedJson: JSON.stringify({ ...extracted, ...result.normalizedInvoice }),
        vendor: invoiceObj.vendor,
        invoiceNumber: invoiceObj.fields.invoiceNumber,
        confidence: result.confidenceScore,
        status,
        corrections: JSON.stringify(result.proposedCorrections || []),
        reasoning: result.reasoning || ""
      });

      res.json({
        id: invoiceId,
        filename,
        extractedFields: { ...extracted, ...result.normalizedInvoice },
        rawTextPreview: rawText.substring(0, 500),
        memoryAgent: {
          confidence: result.confidenceScore,
          status,
          corrections: result.proposedCorrections,
          reasoning: result.reasoning,
          auditTrail: result.auditTrail,
          requiresHumanReview: result.requiresHumanReview
        }
      });
    } catch (err: any) {
      console.error(`[UPLOAD ERROR] ${err.message}`, err);
      res.status(500).json({ error: err.message || "Upload processing failed" });
    }
  });

  /* =====================================================
     MY INVOICES (user's own history)
  ===================================================== */
  app.get("/api/my-invoices", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const invoices = await getUserInvoices(req.user.id);
      res.json(invoices);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* =====================================================
     ADMIN: ALL USERS
  ===================================================== */
  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* =====================================================
     ADMIN: ALL USER ACTIVITY
  ===================================================== */
  app.get("/api/admin/activity", authMiddleware, adminMiddleware, async (_req: AuthRequest, res: Response) => {
    try {
      const activity = await getAllUserActivity();
      res.json(activity);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* =====================================================
     ADMIN: STATS (extended)
  ===================================================== */
  app.get("/api/admin/stats", authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
    db.get("SELECT COUNT(*) as count FROM users WHERE role = 'user'", (err: Error | null, usersCount: any) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get("SELECT COUNT(*) as count FROM user_invoices", (err2: Error | null, uploadsCount: any) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get("SELECT COUNT(*) as count FROM processed_invoices", (err3: Error | null, pipelineCount: any) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.get("SELECT COUNT(*) as count FROM user_invoices WHERE status = 'auto'", (err4: Error | null, autoCount: any) => {
            if (err4) return res.status(500).json({ error: err4.message });
            res.json({
              totalUsers: usersCount?.count || 0,
              totalUploads: uploadsCount?.count || 0,
              pipelineInvoices: pipelineCount?.count || 0,
              autoResolved: autoCount?.count || 0
            });
          });
        });
      });
    });
  });

  /* =====================================================
     EXISTING: STATS (public/pipeline data)
  ===================================================== */
  app.get("/api/stats", (_req: Request, res: Response) => {
    db.get("SELECT COUNT(*) as count FROM processed_invoices", (err: Error | null, invoices: any) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get("SELECT COUNT(*) as count FROM vendor_memory", (err2: Error | null, vendorMem: any) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get("SELECT COUNT(*) as count FROM correction_memory", (err3: Error | null, corrMem: any) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.get("SELECT COUNT(*) as count FROM processed_invoices WHERE status = 'auto'", (err4: Error | null, autoCount: any) => {
            if (err4) return res.status(500).json({ error: err4.message });
            res.json({
              invoices: invoices?.count || 0,
              vendorMemory: vendorMem?.count || 0,
              correctionMemory: corrMem?.count || 0,
              autoResolved: autoCount?.count || 0,
            });
          });
        });
      });
    });
  });

  /* =====================================================
     EXISTING: VENDOR MEMORY
  ===================================================== */
  app.get("/api/vendor-memory", (_req: Request, res: Response) => {
    db.all("SELECT * FROM vendor_memory ORDER BY confidence DESC", [], (err: Error | null, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  /* =====================================================
     EXISTING: CORRECTION MEMORY
  ===================================================== */
  app.get("/api/correction-memory", (_req: Request, res: Response) => {
    db.all("SELECT * FROM correction_memory ORDER BY confidence DESC", [], (err: Error | null, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  /* =====================================================
     EXISTING: INVOICES
  ===================================================== */
  app.get("/api/invoices", (_req: Request, res: Response) => {
    db.all("SELECT * FROM processed_invoices ORDER BY id DESC", [], (err: Error | null, rows: any[]) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  /* =====================================================
     START
  ===================================================== */
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🌐 API Server running at http://0.0.0.0:${PORT}`);
  });
}

/* =====================================================
   HELPERS: Extract fields from raw PDF text
===================================================== */
function extractFieldsFromText(text: string) {
  const result: any = {};

  // Try to extract invoice number
  const invMatch = text.match(/(?:invoice|rechnung|inv)[#:\s-]*([A-Z0-9][-A-Z0-9]+)/i);
  if (invMatch) result.invoiceNumber = invMatch[1].trim();

  // Try to extract vendor name (from first few lines)
  const lines = text.split("\n").filter(l => l.trim().length > 2);
  if (lines.length > 0) result.vendor = lines[0].trim().substring(0, 80);

  // Try to extract date
  const dateMatch = text.match(/(\d{2}[./-]\d{2}[./-]\d{4})/);
  if (dateMatch) {
    const parts = dateMatch[1].split(/[./-]/);
    result.serviceDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // Try to extract total amount
  const amountMatch = text.match(/(?:total|summe|betrag|amount)[:\s]*[€$]?\s*([\d,]+\.?\d*)/i);
  if (amountMatch) result.totalAmount = amountMatch[1];

  return result;
}