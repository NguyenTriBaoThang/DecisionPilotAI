import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('dp-preferences')) {
      localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
    }
  })
})

test('sign in, save preferences, review a scenario, and verify its audit event', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Workspace sign in' })).toBeVisible()
  await page.getByLabel('Access token', { exact: true }).fill('e2e-admin-token-for-isolated-tests-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Crisp Light/ }).click()
  await page.getByLabel('Currency Display Mode').selectOption('compact')
  await page.getByRole('button', { name: 'Save Preferences' }).click()
  await expect(page.getByRole('button', { name: 'Preferences Saved' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Currency Display Mode')).toHaveValue('compact')
  await page.goto('/scenarios')
  await page.getByRole('button', { name: 'AI Recommendations', exact: true }).click()
  const accept = page.getByRole('button', { name: 'Accept scenario', exact: true })
  await expect(accept).toBeEnabled({ timeout: 60_000 })
  const decision = page.waitForResponse(response => response.url().endsWith('/scenarios/feedback') && response.request().method() === 'POST')
  await accept.click()
  const response = await decision
  expect(response.ok()).toBeTruthy()
  await expect(page.getByText(/Decision recorded: accepted/)).toBeVisible()
  await page.goto('/recommendations')
  await expect(page.getByRole('cell', { name: 'browser-admin', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'scenario_feedback', exact: true }).first()).toBeVisible()
  await page.goto('/data-sources')
  await expect(page.getByLabel('Business snapshot file')).toBeVisible()
  await expect(page.getByText('dp-1.1', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('data-sources-light.png'), fullPage: true })
})

test('imports a different snapshot through the browser and invalidates the old model', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Access token', { exact: true }).fill('e2e-admin-token-for-isolated-tests-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Data Sources', exact: true }).click()
  const headers = { Authorization: 'Bearer e2e-admin-token-for-isolated-tests-only' }
  const original = await (await page.request.get('/api/dataset', { headers })).json()
  const bundle = await page.request.get('http://127.0.0.1:8765/e2e/snapshot', { headers })
  expect(bundle.ok()).toBeTruthy()
  await page.getByLabel('Business snapshot file').setInputFiles({ name: 'business.zip', mimeType: 'application/zip', buffer: await bundle.body() })
  await page.getByLabel('Security Import Token (X-Import-Token)').fill('e2e-import-only')
  await expect(page.getByRole('button', { name: 'Replace snapshot', exact: true })).toBeDisabled()
  await page.getByRole('checkbox').check()
  const replacement = page.waitForResponse(response => response.url().includes('/api/import?') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Replace snapshot', exact: true }).click()
  const result = await replacement
  expect(new URL(result.url()).searchParams.get('expected_dataset_id')).toBe(original.dataset_id)
  expect(result.ok()).toBeTruthy()
  const imported = await result.json()
  expect(imported.dataset_id).not.toBe(original.dataset_id)
  await expect(page.getByText('TRAINING REQUIRED', { exact: true })).toBeVisible()
  await expect(page.getByText('No matching trained artifact', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Snapshot imported successfully')
  const health = await (await page.request.get('/api/health', { headers })).json()
  expect(health.model_ready).toBe(false)
})

test('creates an isolated company workspace, runs 4-step enterprise CSV ingestion, and isolates tenant analytics', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Access token', { exact: true }).fill('e2e-admin-token-for-isolated-tests-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Data Sources', exact: true })).toBeVisible()

  // 1. Provision a brand-new isolated Company Workspace via Topbar Workspace Switcher
  await page.getByRole('button', { name: 'Company Workspace' }).click()
  await page.getByPlaceholder('e.g. Acme Retail Ltd.').fill('GlobalMart Retail Corp')
  const createCompanyRes = page.waitForResponse(
    (res) => res.url().includes('/api/v1/companies') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  expect((await createCompanyRes).ok()).toBeTruthy()

  // New company should display an honest Empty Company Workspace state (zero legacy leak)
  await expect(page.getByRole('heading', { name: 'Empty Company Workspace' })).toBeVisible()
  await page.getByRole('link', { name: 'Upload Your Business Data', exact: true }).click()

  // 2. Step 1: Upload USD multi-row CSV containing valid rows, 1 malformed row, and 1 duplicate row
  const lines = ['order_date,sku_name,category,qty,gross_revenue,cogs,region_name,sales_channel']
  for (let i = 0; i < 40; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0')
    const month = i < 28 ? '01' : '02'
    const sku = i % 2 === 0 ? 'Horizon Webcam' : 'Orbit Keyboard'
    const cat = i % 2 === 0 ? 'Cameras' : 'Peripherals'
    const region = i % 2 === 0 ? 'West' : 'East'
    const channel = i % 2 === 0 ? 'Online' : 'B2B'
    lines.push(`2026-${month}-${day},${sku},${cat},2,"$250.00","$120.00",${region},${channel}`)
  }
  // Exact duplicate of row 1 + one intentionally malformed row
  lines.push('2026-01-01,Horizon Webcam,Cameras,2,"$250.00","$120.00",West,Online')
  lines.push('not-a-valid-date,Horizon Webcam,Cameras,2,"$250.00","$120.00",West,Online')

  await page.getByLabel('Enterprise dataset file').setInputFiles({
    name: 'globalmart-sales.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(lines.join('\n'), 'utf-8'),
  })
  const uploadRes = page.waitForResponse(
    (res) => res.url().includes('/api/v1/datasets/upload') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: /Upload & Preview File/i }).click()
  expect((await uploadRes).ok()).toBeTruthy()

  // 3. Step 2: Preview -> Proceed to AI Column Mapping
  await expect(page.getByText('42 rows')).toBeVisible()
  await page.getByRole('button', { name: /Continue to AI Column Mapping/i }).click()

  // 4. Step 3: Set currency USD, save mapping template, run 5-axis validation
  await page.getByLabel('Dataset Currency').selectOption('USD')
  await page.getByRole('switch', { name: /Save Mapping Template/i }).click()
  await page.getByLabel('Template Name').fill('GlobalMart POS CSV')
  const validateRes = page.waitForResponse(
    (res) => res.url().includes('/validate') && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: /Save Mapping & Run Quality Engine/i }).click()
  expect((await validateRes).ok()).toBeTruthy()

  // 5. Step 4: Verify 5-axis quality report & explicit confirmation requirement before import
  await expect(page.getByText('Completeness', { exact: true })).toBeVisible()
  await expect(page.getByText('Validity', { exact: true })).toBeVisible()
  await expect(page.getByText('Consistency', { exact: true })).toBeVisible()
  await expect(page.getByText('Uniqueness', { exact: true })).toBeVisible()
  await expect(page.getByText('Accuracy', { exact: true })).toBeVisible()
  await expect(page.getByText('Flagged Row Diagnostics')).toBeVisible()

  const confirmBtn = page.getByRole('button', { name: /Confirm & Import Dataset/i })
  await expect(confirmBtn).toBeDisabled()
  await page.getByLabel('Duplicate Handling').selectOption('deduplicate')
  await page.getByRole('switch', { name: /I confirm these quality checks/i }).click()
  await expect(confirmBtn).toBeEnabled()

  const importRes = page.waitForResponse(
    (res) => res.url().includes('/import') && res.request().method() === 'POST'
  )
  await confirmBtn.click()
  expect((await importRes).ok()).toBeTruthy()
  await expect(page.getByText(/Import Complete — Active Dataset:/i)).toBeVisible()

  // 6. Verify isolated Executive Dashboard uses GlobalMart's USD dataset (zero legacy leak)
  await page.getByRole('link', { name: 'Executive Dashboard', exact: true }).click()
  await expect(page.getByLabel('Product')).toContainText('Horizon Webcam')
  await expect(page.getByText(/\$/).first()).toBeVisible()

  // 7. Switch back to Default Workspace and confirm GlobalMart SKU did not leak
  await page.getByRole('button', { name: 'Company Workspace' }).click()
  await page.getByRole('button', { name: /Default Workspace/i }).click()
  await expect(page.getByLabel('Product')).toContainText('SmartDesk Mini')
})
