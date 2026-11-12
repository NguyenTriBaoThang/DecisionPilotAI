# DecisionPilot AI: domain language

Plain words used in the demo, slides and product copy. A glossary only; no implementation details.

## Business terms

**Decision loop**
The four steps a shop owner goes through: *Ask, Understand, Predict, Decide*. The product's tagline.

**Warning** (technical: anomaly)
A day or period where a number is far from what the past suggests, e.g. ad spend 84% above normal. Say "warning sign", not "outlier".

**Try first** (technical: scenario, what-if)
Running a proposed change on paper before doing it, e.g. "cut Facebook budget 15%". Say "try it before you do it".

**Recommendation**
A suggested action with its expected effect, the assumptions behind it and the risk. A recommendation is never carried out automatically.

**Decision**
A named person's *accept* or *reject* of a recommendation or a tried scenario. Accepting records the decision only; it does not change anything in the business.

**Decision log** (technical: audit trail)
The permanent list of decisions: who decided, when, and on what evidence.

**Small test with a comparison group** (technical: controlled trial)
Applying a change to part of the business and comparing with the rest. The product recommends this instead of a blind change.

## Number words

**Ad payback** (technical: ROAS)
Sales brought in per 1 ₫ of advertising. "0.76×" means 1 ₫ of Facebook ads returned 0.76 ₫ of sales.

**Likely range** (technical: 90% prediction interval)
The band the forecast is expected to stay inside. The product shows how often it really did on past data.

**Average miss** (technical: WAPE)
How far forecasts are off on average, as a share of actual sales. 24% means about a quarter.

**Price sensitivity** (technical: elasticity)
How much demand moves when the price moves. −1.1 means a 10% price cut lifts units by about 11%.

## Data and honesty

**Practice data** (technical: synthetic data)
The built-in demo dataset. It is generated, not from a real shop, and every demo says so.

**Illustrative example**
A made-up person or situation used to explain the product (the shop owner "Lan"). The numbers shown are real outputs on the practice data, never presented as a real customer's results.

**Estimate vs. fact**
A *fact* is computed from recorded data (revenue, ad spend). An *estimate* is a forecast or a tried scenario; it is conditional and may be wrong. The product labels which is which.

## Screens (since 12/11)

**Today** (VI: Hôm nay)
The morning page: one summary sentence, key numbers with change vs. last period, a warning, a suggestion and the next-30-days estimate.

**Ask AI** (VI: Hỏi AI)
Ask in plain words; the answer shows one big number, a chart, the table behind it, the period and the data sources.

**Try first** (VI: Thử trước)
Pick price, advertising or restock, drag a slider, read the before/after table, then *Choose* or *Skip*.

**Decisions** (VI: Quyết định)
Suggestions waiting for a choice (priority, reason, expected impact, risk) and the decision log.

**Advanced** (VI: Nâng cao)
The specialist modules below, kept out of the owner's main path.

## Enterprise modules (added 11/11)

**Workspace / tenant** (technical: `company_id`, multi-tenant)
One company's private data space. Data, models and decisions of one tenant are never visible to another.

**Data import** (technical: ingestion pipeline)
Bringing a file or a connected source into the product: upload, map columns, check quality, then approve before it reaches the numbers.

**Human check** (technical: HITL, human-in-the-loop)
A person reviews and corrects what the machine read from an invoice, photo or PDF before it counts. Nothing read by AI enters the reports without this approval.

**Ask your documents** (technical: RAG copilot, text-to-SQL)
Asking questions over uploaded documents and the database. Answers cite their source; unsafe queries are blocked.

**Where a number came from** (technical: data lineage)
The trail from a figure on screen back to the file, step and model that produced it.

**Business map** (technical: digital twin)
A visual model of stores, warehouses and channels used to try a change and see where it ripples.

**Why the AI said this** (technical: XAI, explainability)
The factors behind a recommendation and how strongly each one pushed it.

**Tamper-evident log** (technical: hash chain)
Each decision record is linked to the one before it, so an edited or deleted record is detectable.
