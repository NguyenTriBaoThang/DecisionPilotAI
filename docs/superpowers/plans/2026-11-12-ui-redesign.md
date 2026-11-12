# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 11-item, text-heavy UI with a 4-tab colourful UI for non-technical shop owners: Hôm nay, Hỏi AI, Thử trước, Quyết định, plus Dữ liệu and Nâng cao.

**Architecture:** The new pages live in `frontend/src/redesign/`. Shared visual primitives go in `ui.tsx` and pure decision logic in `logic.ts`; the logic is unit-tested. Pages call existing backend endpoints through the existing `request()` from `api.ts`. Teammates' enterprise components stay untouched and are re-mounted under `/advanced/*` or reached through the Nâng cao hub. Each page task wires its own route in `main.tsx`. Navigation is switched last.

**Tech Stack:** React 19, Tailwind 4, @tanstack/react-query, react-router, Vitest + Testing Library, Playwright. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-ui-redesign-design.md`. Visual reference: `docs/superpowers/specs/2026-11-12-ui-redesign-mockups/*.html`. Executors read both.

## Global Constraints

- No backend/API/model changes. UI layer only.
- No new npm packages. Font loads via a Google Fonts `<link>` in `frontend/index.html` with a `system-ui` fallback.
- Every visible string goes through `t()` / `useT()` (`frontend/src/preferences.tsx`). Add each new key to `translations` with both `vi` and `en`. `vi` stays the default language.
- Every number shown comes from an API response. A number that is not from the API is labelled "minh hoạ"/"illustrative".
- Never show the word "lỗ"/"loss" for ROAS. ROAS labels: `< 1` → "Thu về chưa đủ vốn"/"Not paying back yet", `1 ≤ x < 2` → "Bình thường"/"Normal", `≥ 2` → "Tốt"/"Good".
- The forecast card shows only `Forecast.total` with "ước tính"/"estimate". Never sum the daily bands.
- Area colours: Hôm nay blue `#1d4ed8`, Hỏi AI violet `#7c3aed`, Thử trước orange `#ea580c`, Quyết định green `#059669`. Up/down is always green `#15803d` / red `#e11d48`.
- Light theme only. Force `data-theme="light"` and hide the dark toggle.
- Font is Plus Jakarta Sans (weights 500/700/800). Corner radius is 18px for cards and full for pills/buttons.
- Illustrations are the Fluent Emoji 3D PNGs vendored in `frontend/public/illustrations/`. Never hot-link a CDN at runtime.
- Keep these routes alive for deep links: `/anomalies`, `/forecast`, `/recommendations`, `/recommendations/:recId`, `/audit`, `/knowledge-map`, `/data-sources`, `/settings`, `/docs`.

## Review Focus

1. **Empty workspace (no dataset, new tenant):** every new page renders a friendly empty state with a link to Dữ liệu. Nothing should crash. Covered in Task 2 (`TodayPage` empty test).
2. **One API failing on Hôm nay** (e.g. `/forecast` slow or 500): the other cards still render, and the failed card shows a short error line. Covered in Task 2.
3. **Old deep links still work:** `/scenarios?tab=marketing&channel=Facebook%20Ads&autorun=1&rec=marketing:facebook` (still produced by `RecommendationsCenter`) must auto-run the marketing scenario. Covered in Task 3 (`parseTryFirstParams` test).
4. **Recommendation whose type has no simulator mapping** (e.g. `sales:decline`): no "Thử trước" button, no broken link. Covered in Task 1 (`tryFirstHref` test).
5. **Viewer role (`canEdit=false`):** the Chọn làm / Bỏ qua buttons are disabled with a tooltip, never sent. Covered in Task 3 and Task 5.

---

### Task 1: Foundation (tokens, illustrations, primitives, pure logic)

**Files:**
- Create: `frontend/public/illustrations/*.png` (list below)
- Create: `frontend/src/redesign/illustrations.ts`
- Create: `frontend/src/redesign/ui.tsx`
- Create: `frontend/src/redesign/logic.ts`
- Modify: `frontend/index.html` (font link), `frontend/src/styles.css` (tokens + `font-family`), `frontend/src/preferences.tsx` (new keys)
- Test: `frontend/src/test/redesignLogic.test.ts`, `frontend/src/test/redesignUi.test.tsx`

**Interfaces:**
- Produces:
  - `type IllusName = 'sun'|'chat'|'slider'|'clipboard'|'filebox'|'testtube'|'airplane'|'pilot'|'robot'|'moneybag'|'chartup'|'cart'|'megaphone'|'warning'|'bulb'|'crystal'|'package'|'check'|'pushpin'`
  - `illus(name: IllusName): string` returns `/illustrations/<name>.png`
  - `type Tone = 'today'|'ask'|'try'|'decide'|'neutral'`
  - `PageHero(props: { tone: Tone; title: string; subtitle?: string; illus?: IllusName; children?: ReactNode })`
  - `StatCard(props: { illus: IllusName; label: string; value: string; badge?: { text: string; kind: 'good'|'normal'|'bad' }; variant?: 'solid'|'green'|'violet'|'rose'|'blue' })`
  - `NoteCard(props: { color: 'yellow'|'green'|'blue'; illus: IllusName; title: string; body: string; action?: { label: string; to: string }; pin?: boolean })`
  - `Pill`, `ActionButton(props: { tone: Tone|'muted'; onClick?; to?; disabled?; title?; children })`, `EmptyState(props: { title: string; body?: string; action?: { label: string; to: string } })`
  - `roasLabel(roas: number | null): { kind: 'bad'|'normal'|'good'; key: string } | null` (key is a translation key)
  - `briefingSentence(kpi: KPI, alerts: Alert[], t: (s: string) => string): string`
  - `decisionBucket(decision: string | undefined): 'chosen'|'skipped'|'pending'`
  - `scenarioForQuestion(text: string): 'marketing'|'price'|'inventory'|null`
  - `tryFirstHref(rec: { id: string }, options: Options): string | null`
  - `highlightFromChart(answer: string, chart: QueryResult['chart']): { name: string; value: number; y: string } | null`

- [ ] **Step 1: Vendor illustrations.** Download from `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/<Folder>/3D/<file>_3d.png` into `frontend/public/illustrations/<name>.png`. Folder map: sun=`Sun with face`, chat=`Speech balloon`, slider=`Level slider`, clipboard=`Clipboard`, filebox=`Card file box`, testtube=`Test tube`, airplane=`Airplane`, pilot=`Pilot/Default` (file `pilot_3d_default.png`), robot=`Robot`, moneybag=`Money bag`, chartup=`Chart increasing`, cart=`Shopping cart`, megaphone=`Megaphone`, warning=`Warning`, bulb=`Light bulb`, crystal=`Crystal ball`, package=`Package`, check=`Check mark button`, pushpin=`Pushpin`. Add `frontend/public/illustrations/LICENSE.txt` with "Fluent Emoji © Microsoft, MIT License".
  Verify: `ls frontend/public/illustrations/*.png | wc -l` → `19`.

- [ ] **Step 2: Write failing logic tests** in `redesignLogic.test.ts`:

```ts
expect(roasLabel(0.76)?.kind).toBe('bad'); expect(roasLabel(1)?.kind).toBe('normal')
expect(roasLabel(2.76)?.kind).toBe('good'); expect(roasLabel(null)).toBeNull()
expect(decisionBucket('accepted')).toBe('chosen'); expect(decisionBucket('rejected')).toBe('skipped')
expect(decisionBucket('pending')).toBe('pending'); expect(decisionBucket(undefined)).toBe('pending')
expect(scenarioForQuestion('Which marketing channel had the lowest ROAS?')).toBe('marketing')
expect(scenarioForQuestion('Quảng cáo nào đang lỗ?')).toBe('marketing')
expect(scenarioForQuestion('Có nên giảm giá SmartDesk?')).toBe('price')
expect(scenarioForQuestion('Hàng nào sắp hết?')).toBe('inventory')
expect(scenarioForQuestion('Doanh thu tháng này?')).toBeNull()
const opts = { products:[{product_id:'P001',product_name:'SmartDesk Mini',category:'x',is_physical:true}], marketing_channels:['Facebook Ads','Google Ads'], regions:[], categories:[], channels:[] }
expect(tryFirstHref({id:'marketing:facebook'}, opts)).toBe('/scenarios?type=marketing&channel=Facebook%20Ads&change=-0.15&rec=marketing%3Afacebook')
expect(tryFirstHref({id:'inventory:P001'}, opts)).toBe('/scenarios?type=inventory&product=P001&rec=inventory%3AP001')
expect(tryFirstHref({id:'sales:decline'}, opts)).toBeNull()
const chart = { type:'bar', x:'name', y:'roas', rows:[{name:'Google Ads',roas:3.89},{name:'Facebook Ads',roas:0.76}] }
expect(highlightFromChart('Facebook Ads is lowest at 0.76×.', chart)).toEqual({ name:'Facebook Ads', value:0.76, y:'roas' })
expect(highlightFromChart('No chart', null)).toBeNull()
// briefing: revenue change -0.306 + a critical facebook_spend alert
const s = briefingSentence({summary:{revenue:3.38e9}, changes:{revenue:-0.306}} as any, [{metric:'facebook_spend',severity:'critical',deviation:0.84} as any], x=>x)
expect(s).toContain('30.6'); expect(s).toMatch(/down|giảm/i)
```

- [ ] **Step 3: Run and verify it fails.** Run `npm --prefix frontend test -- redesignLogic`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `logic.ts`.**
  - `scenarioForQuestion`: case-insensitive keyword lists. marketing = `marketing|ads|roas|quảng cáo|kênh`; price = `price|discount|giá|giảm giá`; inventory = `stock|inventory|tồn|hết hàng|nhập hàng`. Check in that order.
  - `tryFirstHref`: split id on `:`.
    - `marketing:<slug>`: pick the first `marketing_channels` entry whose lowercase starts with `<slug>`.
    - `price:<id>` / `inventory:<id>`: require `<id>` to be in `options.products`.
    - Marketing adds `change=-0.15`. Encode with `URLSearchParams`, key order `type, channel|product, change, rec`.
  - `briefingSentence`: one sentence. Revenue direction and % from `changes.revenue` (1 decimal, `Math.abs`). If any alert has severity `critical`, append its translated metric phrase. Keys: `'Revenue is {dir} {pct}% vs last period.'` and `' Watch: {metric}.'` (use the existing `t` + string replace).
  - `highlightFromChart`: the row whose `chart.x` value appears earliest in `answer`, otherwise `rows[0]`. Return `null` when `chart` is null or empty.

- [ ] **Step 5: Run and verify it passes.** Run `npm --prefix frontend test -- redesignLogic`. Expected: PASS.

- [ ] **Step 6: Write the primitives test** in `redesignUi.test.tsx`: render `<PageHero tone="ask" title="Hỏi AI" illus="robot" />` and assert the heading "Hỏi AI" plus an `img` with `src` `/illustrations/robot.png` and `alt=""`. Render `<StatCard … badge={{text:'Tốt',kind:'good'}} />` and assert the text "Tốt".
  Then implement `illustrations.ts` and `ui.tsx` following `home-v3-vivid.html` / `other-screens.html`.
  - Hero gradient per tone:
    - today: `#1d3a8a→#4a2a8f→#8a2a6a`
    - ask: `#4c1d95→#7c3aed→#db2777`
    - try: `#9a3412→#ea580c→#f59e0b`
    - decide: `#065f46→#059669→#0ea5e9`
  - Decorative images get `alt=""` and `aria-hidden`.
  Add the Google Fonts link and the `--dp-*` tokens. Set `body { font-family: "Plus Jakarta Sans", system-ui, sans-serif }`. Force light theme in `main.tsx` (`document.documentElement.dataset.theme = 'light'`).
  Run `npm --prefix frontend test -- redesign`. Expected: PASS.

- [ ] **Step 7: Commit.** `git add frontend/public/illustrations frontend/src/redesign frontend/src/test/redesign* frontend/index.html frontend/src/styles.css frontend/src/preferences.tsx frontend/src/main.tsx && git commit -m "feat(ui): redesign foundation: tokens, illustrations, primitives, decision logic"`

---

### Task 2: Hôm nay page (`/`)

**Files:**
- Create: `frontend/src/redesign/TodayPage.tsx`
- Modify: `frontend/src/main.tsx` (route `/` → `TodayPage`; keep the `Dashboard` import only if it is used elsewhere)
- Test: `frontend/src/test/todayPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 primitives, `roasLabel`, `briefingSentence`, `tryFirstHref`, `investigateHref` (`frontend/src/investigate.ts`), `moneyCompact`, `percent`, `integer`, `decimal` (`api.ts`).
- Produces: `TodayPage(props: { dataset?: Dataset; options?: Options })`.

Data is fetched in parallel, one `useQuery` per card so each card fails on its own:
- `GET /kpi/summary`
- `GET /anomalies?limit=6`
- `GET /recommendations`
- `POST /forecast {target:'revenue', horizon:30}`

- [ ] **Step 1: Write the failing test.** Mock `request`:
  - kpi → `summary{revenue:3381128200, margin:0.3957, orders:1537, roas:2.7558}`, `changes{revenue:-0.306}`, `range:['2026-09-01','2026-09-30']`
  - anomalies → one `facebook_spend` critical row, `deviation:0.84`
  - recommendations → `[{id:'marketing:facebook', title:'Review Facebook Ads allocation', decision:'pending', …}]`
  - forecast → `{total: 3.4e9, …}`, or a rejected promise in the second test

  Assert:
  - 4 stat labels are visible ("Doanh thu", "Lãi gộp", "Đơn hàng", "Quảng cáo thu về"), plus the badge "Tốt"
  - a link with `href` = `investigateHref('facebook_spend')`
  - a link with `href` from `tryFirstHref`
  - the text "ước tính"
  - the text matching `/giảm 30[,.]6/`
  - no element contains the text "lỗ"

  Second test: forecast rejects, the other 3 cards still render, and the forecast note shows "Chưa tải được dự báo". Third test: `dataset` undefined → `EmptyState` with a link to `/data-sources`.
- [ ] **Step 2: Run and verify it fails.** Run `npm --prefix frontend test -- todayPage`. Expected: FAIL.
- [ ] **Step 3: Implement `TodayPage`** following `home-v3-vivid.html`.
  - Hero contents:
    - pill "Dữ liệu cập nhật <dateLabel(range[1])>"
    - "Chào bạn," with the gradient second line from the briefing
    - pilot illustration
    - bubble text "Mình chỉ dùng số liệu thật của shop, không bịa số."
  - Stat cards:
    - revenue `moneyCompact` (solid blue)
    - margin `percent` (green)
    - orders `integer` (violet)
    - ROAS `decimal + '×'` with the `roasLabel` badge (rose)
  - Notes:
    - yellow: first critical/high alert, action "Xem vì sao" → `investigateHref(metric)`
    - green: first pending recommendation with a non-null `tryFirstHref`, action "Thử trước"
    - blue: forecast `moneyCompact(total)` + "ước tính", action "Xem dự báo" → `/forecast`

  Skip a note when there is no data for it.
- [ ] **Step 4: Run and verify it passes.** Run `npm --prefix frontend test -- todayPage`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(ui): Hôm nay briefing page"` (after `git add` of the new files)

---

### Task 3: Thử trước page (`/scenarios`)

**Files:**
- Create: `frontend/src/redesign/TryFirstPage.tsx`
- Modify: `frontend/src/main.tsx` (`/scenarios` → `TryFirstPage`; add `/advanced/simulator-3d` → the existing lazy `ScenarioSimulator3D`)
- Modify: `frontend/src/redesign/logic.ts` (add `parseTryFirstParams`)
- Test: `frontend/src/test/tryFirstPage.test.tsx`, extend `redesignLogic.test.ts`

**Interfaces:**
- Produces:
  - `parseTryFirstParams(sp: URLSearchParams): { type: 'marketing'|'price'|'inventory'; channel?: string; product?: string; change?: number; rec?: string; autorun: boolean }`
  - `TryFirstPage(props: { dataset?: Dataset; options: Options; canEdit: boolean })`
- Consumes: `POST /simulate` (schemas in `backend/app/schemas.py:44-80`), `POST /scenarios/feedback {simulation_id, dataset_id, decision, recommendation_id?}`.

Request and slider per type (the request sends one change per run):

| Type | Request | Slider |
|---|---|---|
| marketing | `{type:'marketing',horizon:30,objective:'profit',parameters:{channel, changes:[change]}}` | −50%…+100%, step 5, default −15% |
| price | `{type:'price',…,parameters:{product, discounts:[d]}}` | 0…30%, step 1, default 10% |
| inventory | `{type:'inventory',horizon:30,objective:'stockout',parameters:{product, order_quantities:[q]}}` | 0…300, step 10, default 40 |

Results are read from the alternative whose `name !== baseline.name` (fallback: `recommended`). Show 3 numbers:
- `revenue_delta` (money, signed colour)
- `profit_delta` (money, signed colour)
- a type-specific third number:
  - marketing: `alt.spend - baseline.spend`
  - price: `alt.fulfilled - baseline.fulfilled` units
  - inventory: `first_stockout_day`; `null` → "Không hết hàng"

- [ ] **Step 1: Write the failing tests.**
  - `parseTryFirstParams`: `?type=marketing&channel=Facebook%20Ads&change=-0.15&rec=marketing%3Afacebook` gives `type:'marketing'`, `change:-0.15`, `rec:'marketing:facebook'`, `autorun:true`. The legacy `?tab=marketing&channel=Facebook%20Ads&autorun=1&rec=x` gives the same `type` and `autorun:true`. No params gives `type:'marketing'`, `autorun:false`.
  - Page test, with `request` mocked to return the marketing sample (baseline/alternative from the plan's verification run, `simulation_id:'s1'`), rendered with `MemoryRouter initialEntries={['/scenarios?type=marketing&channel=Facebook%20Ads&change=-0.15&rec=marketing%3Afacebook']}`:
    - `request` called with `'/simulate'` and `parameters.changes` equal to `[-0.15]`
    - the 3 result cards render
    - clicking "Chọn làm" calls `request('/scenarios/feedback', {simulation_id:'s1', decision:'accepted', recommendation_id:'marketing:facebook', …})` and shows "Đã ghi: Chọn làm"
  - With `canEdit={false}`: both decision buttons are disabled.
- [ ] **Step 2: Run and verify it fails.** Run `npm --prefix frontend test -- tryFirst`. Expected: FAIL.
- [ ] **Step 3: Implement** following the orange block of `other-screens.html`:
  - 3 type cards
  - a product `<select>` (from `options.products`) or channel `<select>` (from `options.marketing_channels`), defaulting to the URL value or the first option
  - a native `<input type="range">` that runs the simulation on `pointerup`/`keyup`/`change`, not on every move
  - a yellow note: "Đây là ước tính dựa trên dữ liệu cũ, không chắc chắn. Nên thử nhỏ một tuần trước."
  - buttons "Chọn làm" / "Bỏ qua", plus a link "Mở bản 3D" → `/advanced/simulator-3d`
- [ ] **Step 4: Run and verify it passes.** Run `npm --prefix frontend test -- tryFirst redesignLogic`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): Thử trước simplified simulator with decision recording"`

---

### Task 4: Hỏi AI page (`/ask`)

**Files:**
- Create: `frontend/src/redesign/AskPage.tsx`
- Modify: `frontend/src/main.tsx` (`/ask` → `AskPage`; add `/advanced/copilot` → the existing `Ask` wrapper/`CopilotWorkspace`)
- Test: `frontend/src/test/askPage.test.tsx`

**Interfaces:**
- Consumes: `POST /query {question}` → `QueryResult`; `highlightFromChart`, `scenarioForQuestion` (Task 1).
- Produces: `AskPage(props: { canEdit: boolean })`. The conversation is kept in component state only.

- [ ] **Step 1: Write the failing test.** With `request` mocked to return the `/query` sample (answer "All campaigns recorded roas of 2.76× … Facebook Ads is lowest at 0.76×.", a bar chart with Facebook/Google rows, `trace.sources:['marketing_campaigns','sales_transactions']`), render at `/ask?q=Which%20marketing%20channel%20had%20the%20lowest%20ROAS%3F`. Assert:
  - the question bubble is shown
  - `request` was called once with `'/query'`
  - the big highlight "0,76×" (or the `en` "0.76×") is visible
  - "marketing_campaigns" appears in the source line
  - a link "Thử trước" points to `/scenarios?type=marketing`

  Also: clicking the chip "Doanh thu tháng này?" sends that question.
- [ ] **Step 2: Run and verify it fails.** Run `npm --prefix frontend test -- askPage`. Expected: FAIL.
- [ ] **Step 3: Implement** following the violet block:
  - 4 chips (moneybag "Doanh thu tháng này?", package "Món nào bán chạy?", megaphone "Quảng cáo nào đang lỗ?", crystal "Tháng sau bán bao nhiêu?"). This chip is the one allowed use of "lỗ", because it is the user's question text and not a label on a number.
  - pilot answer bubble with the highlight (`decimal` + `×` when `y==='roas'`, `percent` for margin/conversion, `moneyCompact` otherwise)
  - small Recharts `BarChart` when `chart` exists
  - input box with a pink send button
  - `?q=` auto-send once, then remove the param (same pattern as `CopilotWorkspace.tsx:375-385`)
- [ ] **Step 4: Run and verify it passes.** Run `npm --prefix frontend test -- askPage`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): Hỏi AI page on structured /query; RAG copilot moved to Advanced"`

---

### Task 5: Quyết định page (`/decisions`)

**Files:**
- Create: `frontend/src/redesign/DecisionsPage.tsx`
- Modify: `frontend/src/main.tsx` (add `/decisions`)
- Test: `frontend/src/test/decisionsPage.test.tsx`

**Interfaces:**
- Consumes: `GET /recommendations` → `{rows: Recommendation[]}`; `GET /audit?kind=decisions` → `{rows: Audit[]}`; `POST /recommendations/feedback {recommendation_id, decision, dataset_id}`; `decisionBucket`, `tryFirstHref`.
- Produces: `DecisionsPage(props: { dataset?: Dataset; options?: Options; canEdit: boolean })`.

- [ ] **Step 1: Write the failing test.** Mock:
  - recommendations: `marketing:facebook` pending, `sales:decline` pending, `inventory:P001` accepted
  - audit: two rows, `payload.decision` `accepted` (kind `scenario_feedback`) and `rejected` (kind `recommendation_feedback`)

  Assert:
  - the counters read Đã chọn làm = 1, Đã bỏ qua = 1, Đang chờ = 2
  - the pending "Review Facebook Ads allocation" row has a "Thử trước" link
  - `sales:decline` has no "Thử trước" link
  - clicking "Bỏ qua" on it calls `/recommendations/feedback` with `decision:'rejected'`
  - every audit row shows its actor/date and a status pill
- [ ] **Step 2: Run and verify it fails.** Run `npm --prefix frontend test -- decisionsPage`. Expected: FAIL.
- [ ] **Step 3: Implement** following the green block. The illustration per row comes from the id prefix: `marketing`→megaphone, `price`→moneybag, `inventory`→package, otherwise bulb. Pending rows go first. Audit rows show `payload.actor ?? 'local-workspace'`, `dateLabel(occurred_at.slice(0,10))`, `subject`. Invalidate both queries after feedback.
- [ ] **Step 4: Run and verify it passes.** Run `npm --prefix frontend test -- decisionsPage`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): Quyết định page merging recommendations and decision log"`

---

### Task 6: Navigation, Nâng cao hub, Dữ liệu restyle, e2e

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` (`navGroups`)
- Modify: `frontend/src/components/layout/Topbar.tsx` (hide the dark toggle; add a "Cài đặt" link to `/settings`)
- Create: `frontend/src/redesign/AdvancedPage.tsx`
- Modify: `frontend/src/main.tsx` (`/advanced`; wrap `DataSourcesPage` with `PageHero tone="neutral" illus="filebox"`)
- Modify: `frontend/e2e/demo-flow.spec.ts`, `frontend/e2e/workspace.spec.ts` (nav labels and the new pages)
- Test: `frontend/src/test/navigation.test.tsx`

**Interfaces:**
- Produces the new `navGroups`. Every `title` is a translation key:

```ts
[{ label: 'MAIN', items: [
   { to: '/', title: 'Today', illus: 'sun', end: true },
   { to: '/ask', title: 'Ask AI', illus: 'chat' },
   { to: '/scenarios', title: 'Try first', illus: 'slider' },
   { to: '/decisions', title: 'Decisions', illus: 'clipboard' } ] },
 { label: 'OTHER', items: [
   { to: '/data-sources', title: 'Data', illus: 'filebox' },
   { to: '/advanced', title: 'Advanced', illus: 'testtube' } ] }]
```

  VI translations: Today=Hôm nay, Ask AI=Hỏi AI, Try first=Thử trước, Decisions=Quyết định, Data=Dữ liệu, Advanced=Nâng cao, MAIN=CHÍNH, OTHER=KHÁC.

- [ ] **Step 1: Write the failing test.** Render `Sidebar`. Assert exactly 6 nav links with the VI names above, in that order, and that none of "Anomaly Center", "Enterprise Knowledge Map", "Audit & Governance" is present.
- [ ] **Step 2: Run and verify it fails.** Run `npm --prefix frontend test -- navigation`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Sidebar: dark navy gradient `#14306b→#1b2c5c`, illustration icons, airplane logo.
  - `AdvancedPage`: a colourful card grid with an illustration, a one-line description and a link. Links:
    - Copilot tài liệu `/advanced/copilot`
    - Bản 3D & digital twin `/advanced/simulator-3d`
    - Truy nguồn số liệu `/knowledge-map`
    - Giải thích AI & khuyến nghị nâng cao `/recommendations`
    - Nhật ký kiểm toán `/audit`
    - Chi tiết cảnh báo `/anomalies`
    - Dự báo chi tiết `/forecast`
    - Tài liệu kỹ thuật `/docs`
- [ ] **Step 4: Update e2e.**
  - `demo-flow.spec.ts` (language `en`): go to `/`, then click the link "Investigate" (the yellow note) and expect `/ask`, the question text, and `/Facebook Ads is lowest at/`. Go to `/decisions`, then expect "Review Facebook Ads allocation" and click its "Try first" link. Expect a result card. Click "Choose", wait for the `POST /scenarios/feedback` response, assert `recommendation_id === 'marketing:facebook'`, and expect "Recorded: Choose". Go to `/decisions` and expect the Chosen counter ≥ 1 and the cell/text `scenario_feedback`.
  - `workspace.spec.ts`: replace nav names ("Executive Dashboard"→"Today", "Ask Business Data"/"Ask AI Copilot"→"Ask AI", "Enterprise Knowledge Map"→ via `/advanced` card "Data lineage", "Settings" → Topbar link "Settings").
- [ ] **Step 5: Run everything.**
  - `npm --prefix frontend test`: all pass, including the existing `preferences` (VI default).
  - `npm --prefix frontend run build`: exit 0.
  - `docker compose up -d --build && sh scripts/demo_reset.sh`, then `npx --prefix frontend playwright test e2e/demo-flow.spec.ts`: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(ui): 4-tab navigation, Advanced hub, Data restyle; update e2e"`

---

## Final verification (after Task 6)

- Open `http://localhost:8090` at 1440×900 and at 390×844. Screenshot `/`, `/ask`, `/scenarios`, `/decisions`, `/advanced` in VI and EN into `report/screenshots/redesign/`. Check against the mockups: no horizontal scroll at 390px, no text "lỗ" on a number label, every image visible.
- Add one line to `report/07_sai_lech_va_rui_ro.md` §F: `/v1/recommendations` returns 500 on Postgres (Decimal not JSON serializable, `governance/service.py:2072`).
