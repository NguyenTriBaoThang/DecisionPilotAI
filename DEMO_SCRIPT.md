# DecisionPilot AI — Demo Presentation Script

This document guides a presenter, competitor, or evaluator through a **5–7 minute live demonstration** of **DecisionPilot AI** for the *AI for Business Innovation 2026 — LIKELION & K-TECH College* competition.

> **Demonstration Target:** Showcase how DecisionPilot AI turns scattered SME transaction data into actionable, grounded decisions through a closed-loop intelligence chain: **Ask → Detect → Explain → Forecast → Simulate → Decide**.

---

## ⏱️ Demo Timing Overview

| Duration | Segment | Main Goal | Key Screen / Route |
| :---: | :--- | :--- | :--- |
| **0:00 - 0:45** | Opening & The SME Decision Paradox | Introduce the problem: Data exists, but decisions are delayed and guessed. | `/landing` & `/` |
| **0:45 - 2:00** | Executive Dashboard & Anomaly Center | Spot sudden revenue dip and marketing efficiency drop in real time. | `/` & `/anomalies` |
| **2:00 - 3:15** | Ask AI Copilot (Zero-Hallucination Causal Drill-down) | Query *"Why did revenue decrease this month?"* with SQL grounding. | `/ask` |
| **3:15 - 4:15** | Demand Forecast Center & Stockout Early Warnings | Examine LightGBM 30-day demand forecast and stockout risks. | `/forecast` |
| **4:15 - 5:45** | Interactive 3D Holographic Scenario Simulator | Test 0%, 5%, 10% discounts on Three.js 3D Sphere & Landscape. | `/scenarios` |
| **5:45 - 6:30** | Grounded Recommendation, Human Decision & Conclusion | Accept optimal 5% discount, verify audit trail, and close pitch. | `/recommendations` |

---

## 🚀 Detailed Step-by-Step Script

### Step 1: Opening & The SME Decision Paradox (0:00 - 0:45)
- **Screen Action:** Open `http://127.0.0.1:5173/landing` or `http://127.0.0.1:5173/`.
- **Presenter Script:**
  > *"Respected Judges, Small and Medium Enterprises today generate immense amounts of transactional data across POS, online stores, and digital ads. Yet when monthly profits decline, managers spend hours manually crunching Excel sheets—or worse, make high-stakes decisions based purely on gut feeling.*
  >
  > *Generic AI chatbots fail here because they hallucinate numbers and cannot simulate market economics. We built **DecisionPilot AI** to solve this: **an AI Decision Intelligence copilot that doesn't just tell managers what happened, but why it happened, what will happen next, and what they should decide.**"*

---

### Step 2: Executive Dashboard & Proactive Anomaly Detection (0:45 - 2:00)
- **Screen Action:** Navigate to the Executive Dashboard (`/`). Point to the KPI cards, the sparklines, and the active Alert banner. Then click into `/anomalies`.
- **Presenter Script:**
  > *"On the Executive Dashboard, we immediately observe that October Gross Revenue has dropped by 11.2% compared to September. But instead of waiting for an end-of-month financial audit, our **Anomaly Center** has automatically flagged two high-severity irregularities:*
  >
  > *1. Meta Ads spend surged by 35% while attributed revenue declined by 18%, indicating campaign saturation.*  
  > *2. Our best-selling SKU, 'SmartDesk Mini', suffered a 24% revenue drop in the Ho Chi Minh City retail branch.*  
  >
  > *These anomalies are ranked by financial severity using Isolation Forest and robust statistical z-scores—ensuring executives focus only on critical risks."*

---

### Step 3: Natural Language Copilot with Zero-Hallucination SQL Grounding (2:00 - 3:15)
- **Screen Action:** Click into `/ask`. Click the prompt button: *"Why did revenue decrease this month?"* (or type it into the chat input). Wait 1.5 seconds for the response to render with chart and SQL trace.
- **Presenter Script:**
  > *"When managers want to investigate, they don't need to write SQL or wait for a data analyst. They simply ask in plain English or Vietnamese.*
  >
  > *Notice that DecisionPilot AI does not let the LLM guess numbers. The system routes the intent, executes a constrained analytical SQL query against our SQLite/PostgreSQL transaction database, and returns a verified bar chart alongside the exact SQL trace.*
  >
  > *The result is crystal clear: 72% of the total revenue drop was driven by returning customers in District 1 buying fewer units due to price resistance, combined with reduced Meta Ads conversion."*

---

### Step 4: Demand Forecast Center & Stockout Prevention (3:15 - 4:15)
- **Screen Action:** Navigate to `/forecast`. Select product *"SmartDesk Mini"* and planning horizon *"30 Days"*.
- **Presenter Script:**
  > *"Now that we understand the root cause, what will happen next? We turn to the **Forecast Center**.*
  >
  > *Our LightGBM model, trained on 14 lag and rolling demand features, projects next month's daily demand curve with calibrated 90% confidence intervals. It beats standard moving average baselines by over 18% in WAPE.*
  >
  > *Crucially, look at the supply chain warning: with upcoming Black Friday seasonality, projected demand will exceed our current inventory by 140 units on Day 18. If we run a promotion without restocking, we will hit a severe stockout."*

---

### Step 5: Interactive 3D Holographic Scenario Simulator (4:15 - 5:45)
- **Screen Action:** Navigate to `/scenarios`.  
  1. Move the mouse to demonstrate the Three.js 3D Holographic AI Data Sphere and glowing tiered pedestal.
  2. Switch between **Overview Mode**, **Focus Mode**, and **Comparison Mode**.
  3. Under Tab 2 (Pricing & Discount), adjust the discount slider from 0% to 5% and 10% in real time.
- **Presenter Script:**
  > *"This brings us to the signature innovation of DecisionPilot AI: the **Interactive 3D Scenario Simulator**.*
  >
  > *At the center sits our 3D Holographic AI Data Sphere, surrounded by floating glassmorphic control panels. Rather than static calculations, our microeconomic engine simulates realistic market dynamics:*
  >
  > - *If we offer **0% discount**, demand stays stagnant, leaving inventory unfulfilled.*
  > - *If we push a **10% discount**, volume increases, but high price elasticity and supplier costs cause contribution profit to drop by $5,200.*
  > - *At a **5% discount**, volume expands by 26% while preserving healthy gross margins, generating an optimal **+$8,160 in incremental contribution profit**.*
  >
  > *In Comparison Mode, our 3D landscape physically elevates platforms based on profit yield, allowing executives to visually weigh trade-offs before risking a single dollar."*

---

### Step 6: Grounded Recommendation, Human Decision & Closing (5:45 - 6:30)
- **Screen Action:** Navigate to `/recommendations` (or click Tab 5 in the Simulator). Show the synthesized recommendation card. Click the **"Approve Action"** button. Point to the green confirmation and the audit log.
- **Presenter Script:**
  > *"Finally, DecisionPilot AI synthesizes all findings into a concrete, prioritized recommendation: **'Apply a calibrated 5% discount on SmartDesk Mini, reallocate $2,500 ad spend from Meta to Google Search, and trigger a 150-unit supplier batch order.'**
  >
  > *In line with AI safety and governance, the AI never executes actions autonomously. The executive reviews the evidence, assumptions, and confidence score, then clicks **Approve**.*
  >
  > *The decision is instantly recorded in our immutable audit log with full traceability.*
  >
  > *In conclusion: **Traditional dashboards show you what happened. DecisionPilot AI tells you why it happened, what will happen next, and empowers you to decide with confidence.** Thank you!"*

---

## 💡 Presenter Tips for Competition Q&A

1. **If judges ask: "Did you use real or fake data?"**
   - *Answer:* "We generated an enterprise-grade synthetic dataset of 50,000 transactions across 50 SKUs over 24 months, strictly modeling real-world retail distributions, weekend/holiday seasonality, and economic price elasticities. All code runs live against this database."
2. **If judges ask: "How do you prevent LLM hallucinations?"**
   - *Answer:* "LLMs are strictly decoupled from computation. The LLM only classifies user intent. Numerical calculations and forecasts are computed deterministically by PostgreSQL/FastAPI and LightGBM models."
3. **If judges ask: "Can this run on SME budgets?"**
   - *Answer:* "Yes! DecisionPilot AI runs entirely on commodity CPU instances without requiring expensive cloud GPUs. Inference latency is sub-50ms."

