import { test, expect, type Page } from '@playwright/test'

// The 2-minute demo story on the redesigned UI: warning -> ask -> try the suggestion first -> choose -> decision log.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
  })
})

// Isolated e2e servers require a token; a local demo workspace does not.
async function signInIfNeeded(page: Page) {
  const heading = page.getByRole('heading', { name: 'Workspace sign in' })
  if (await heading.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.getByLabel('Access token', { exact: true }).fill('e2e-admin-token-for-isolated-tests-only')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
}

test('Today warning -> Ask -> Decisions -> Try first -> Choose settles the log', async ({ page }) => {
  await page.goto('/')
  await signInIfNeeded(page)

  // 1. The yellow warning note on Today opens Ask with the question already sent.
  await page.getByRole('link', { name: 'See why', exact: true }).click()
  await expect(page).toHaveURL(/\/ask/)
  await expect(page.getByText('Which marketing channel had the lowest ROAS?').first()).toBeVisible()
  await expect(page.getByText(/Facebook Ads is lowest at/)).toBeVisible({ timeout: 30_000 })

  // 2. The pending suggestion on Decisions opens Try first with Facebook Ads and -15% already run.
  // Load Decisions directly (not via Today) so it must fetch its own options for the Try-first link.
  await page.goto('/decisions')
  const row = page.getByTestId('rec-marketing:facebook')
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('link', { name: 'Try first', exact: true }).click()
  await expect(page.getByText('Budget change: -15%')).toBeVisible()
  const choose = page.getByRole('button', { name: 'Choose', exact: true })
  await expect(choose).toBeEnabled({ timeout: 60_000 })

  // 3. One decision is recorded against the recommendation and shows in the log.
  const decision = page.waitForResponse(r => r.url().endsWith('/scenarios/feedback') && r.request().method() === 'POST')
  await choose.click()
  const response = await decision
  expect(response.ok()).toBeTruthy()
  expect(response.request().postDataJSON().recommendation_id).toBe('marketing:facebook')
  await expect(page.getByText(/Recorded: Choose/)).toBeVisible()

  await page.getByRole('link', { name: 'See decisions', exact: true }).click()
  await expect(page.getByTestId(/^log-/).filter({ hasText: 'Review Facebook Ads allocation' })).toContainText('Suggestion', { timeout: 30_000 })
  await expect(page.getByTestId('rec-marketing:facebook')).toHaveCount(0)
})
