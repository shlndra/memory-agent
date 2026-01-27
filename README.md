# 🧠 Memory-Driven Invoice Agent

## Overview

This project implements a memory-driven learning layer for invoice processing systems.  
Instead of treating every invoice as a new case, the system learns from past human corrections and applies those learnings to future invoices in an explainable and auditable way.

This project focuses on **post-extraction intelligence**, not OCR or document parsing.

---

## Key Objectives

- Learn reusable patterns from human invoice corrections  
- Apply learned memory to future invoices  
- Increase automation safely using confidence thresholds  
- Provide explainable decisions and audit trails  
- Prevent bad learning from duplicates or low-confidence cases  

---

## System Architecture

```

Invoice Input
↓
Recall Memory
↓
Apply Memory
↓
Decision Engine
↓
Learn from Human Feedback

````

---

## Technology Stack

- Node.js  
- TypeScript (strict mode)  
- SQLite (persistent memory store)  

---

## Memory Types Implemented

### 1. Vendor Memory
Stores vendor-specific label-to-field mappings.

**Example**
- Supplier GmbH: `"Leistungsdatum"` → `serviceDate`

Used to normalize future invoices from the same vendor.

---

### 2. Correction Memory
Stores recurring correction strategies learned from humans.

**Example**
- Parts AG: VAT already included → tax recalculation strategy

Applied when similar patterns are detected again.

---

### 3. Confidence-Based Resolution
Each memory entry maintains a confidence score that increases with human approval.

| Confidence Score | System Behavior |
|-----------------|----------------|
| ≥ 0.75 | Auto-suggest / auto-apply |
| < 0.75 | Require human review |

---

## Duplicate Invoice Handling

Invoices are flagged as duplicates when:
- Vendor matches
- Invoice number matches
- Invoice was already processed in the same run

Duplicates:
- Always require human review  
- Do not affect learned memory  

---

## Learning Flow Example

1. Invoice from Supplier GmbH is missing `serviceDate`
2. Human corrects using `"Leistungsdatum"`
3. System stores vendor memory
4. Future invoices auto-suggest `serviceDate`
5. Confidence increases and human review is reduced

---

## Supported Vendor Behaviors

### Supplier GmbH
- Service date extracted from `"Leistungsdatum"`

### Parts AG
- Detects `"MwSt. inkl." / "Prices incl. VAT"`
- Suggests VAT recalculation with clear reasoning

### Freight & Co
- Detects Skonto discount terms
- Maps descriptions like `"Seefracht / Shipping"` to SKU `FREIGHT`

---

## Output Format

Each processed invoice returns the following structure:

```json
{
  "normalizedInvoice": {},
  "proposedCorrections": [],
  "requiresHumanReview": true,
  "reasoning": "Explanation of decisions",
  "confidenceScore": 0.0,
  "memoryUpdates": [],
  "auditTrail": [
    {
      "step": "recall|apply|decide|learn",
      "timestamp": "...",
      "details": "..."
    }
  ]
}
````

---

## Running the Project

### Install dependencies

```bash
npm install
```

### Run the demo

```bash
npx ts-node src/index.ts
```

---

## Design Decisions

* Heuristic-based learning (no ML training)
* Memory only updated after explicit human approval
* Confidence grows gradually to avoid unsafe automation
* Explainability prioritized over aggressive auto-correction

---

## Possible Enhancements

* Memory visualization dashboard
* Confidence decay for outdated patterns
* Negative reinforcement for rejected suggestions
* Vendor-specific confidence thresholds

---

## Author

**Shailender**
AI Agent Development 

