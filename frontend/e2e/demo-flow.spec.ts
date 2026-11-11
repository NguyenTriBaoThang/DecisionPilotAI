import { test, expect, type Page } from '@playwright/test'

// The 2-minute demo story: warning -> ask -> try the recommendation first -> accept -> decision log.
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

test('alert -> Ask -> recommendation -> simulator -> one decision settles card and log', async ({ page }) => {
  await page.goto('/')
  await signInIfNeeded(page)

  // 1. The dashboard warning opens Ask with the question already sent.
  await page.getByRole('link', { name: 'Investigate causes with AI Copilot' }).click()
  await expect(page).toHaveURL(/\/ask$/)
  await expect(page.getByText('Which marketing channel had the lowest ROAS?').first()).toBeVisible()
  await expect(page.getByText(/Facebook Ads is lowest at/)).toBeVisible({ timeout: 30_000 })

  // 2. The recommendation opens the simulator with Facebook Ads and -15% already run.
  await page.goto('/recommendations')
  await expect(page.getByText('Review Facebook Ads allocation')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('STATUS: PENDING').first()).toBeVisible()
  await page.getByRole('link', { name: 'Try first in simulator' }).click()
  await expect(page.getByText('Recommended Reallocation: -15% budget')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('-15% Budget', { exact: true })).toBeVisible()

  // 3. One decision updates the scenario and the recommendation card.
  await page.getByRole('button', { name: 'AI Recommendations', exact: true }).click()
  const decision = page.waitForResponse(r => r.url().endsWith('/scenarios/feedback') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Accept scenario', exact: true }).click()
  const response = await decision
  expect(response.ok()).toBeTruthy()
  expect(response.request().postDataJSON().recommendation_id).toBe('marketing:facebook')
  await expect(page.getByText(/Decision recorded: accepted/)).toBeVisible()

  await page.goto('/recommendations')
  await expect(page.getByText('STATUS: ACCEPTED').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'recommendation_feedback', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'scenario_feedback', exact: true })).toBeVisible()
})
