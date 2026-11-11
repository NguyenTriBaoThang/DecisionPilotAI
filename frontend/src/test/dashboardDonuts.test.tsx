import { beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PreferencesProvider } from '../preferences'
import { AllocationDonutCard } from '../components/charts/AllocationDonutCard'
import {
  buildMarketingSpendSegments,
  buildRegionSegments,
  buildSalesChannelSegments,
  buildTopProductSegments,
  computeDonutSegments,
} from '../components/charts/dashboardDonuts'

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

const labels = {
  otherProducts: 'Other Products',
  revenue: 'Revenue',
  grossProfit: 'Gross Profit',
  unitsSold: 'Units Sold',
  adSpend: 'Ad Spend',
  roas: 'ROAS',
  attributedRevenue: 'Attributed Revenue',
  orders: 'Orders',
  share: 'Share',
}

describe('Dashboard donut data builders', () => {
  it('reconciles Top 5 products + Other Products to exact total summary revenue and 100% shares', () => {
    const products = [
      { name: 'SmartDesk Mini', revenue: 300, gross_profit: 100, units: 30 },
      { name: 'FocusCam Pro', revenue: 250, gross_profit: 80, units: 25 },
      { name: 'Focus Series 33', revenue: 200, gross_profit: 60, units: 20 },
      { name: 'AirPure S', revenue: 150, gross_profit: 50, units: 15 },
      { name: 'CarePlus Series 11', revenue: 100, gross_profit: 40, units: 10 },
      { name: 'Air Series 26', revenue: 90, gross_profit: 30, units: 9 },
    ]
    const summary = { revenue: 1500, gross_profit: 500, units: 160 }

    const { items, hasOther } = buildTopProductSegments(products, summary, labels)
    expect(hasOther).toBe(true)
    expect(items).toHaveLength(6)
    expect(items[5].name).toBe('Other Products')
    expect(items[5].value).toBe(500) // 1500 - (300+250+200+150+100)

    const { chartData, visibleTotal } = computeDonutSegments(items)
    expect(visibleTotal).toBe(1500)
    const shareSum = chartData.reduce((s, row) => s + row.share, 0)
    expect(shareSum).toBeCloseTo(1, 6)
  })

  it('omits Other Products when 5 or fewer products cover all filtered revenue', () => {
    const products = [
      { name: 'SmartDesk Mini', revenue: 600, gross_profit: 200, units: 12 },
      { name: 'AirPure S', revenue: 400, gross_profit: 140, units: 8 },
    ]
    const summary = { revenue: 1000, gross_profit: 340, units: 20 }

    const { items, hasOther } = buildTopProductSegments(products, summary, labels)
    expect(hasOther).toBe(false)
    expect(items).toHaveLength(2)
  })

  it('sizes marketing slices strictly by Ad Spend while attaching ROAS as supplemental metric', () => {
    const marketing = [
      { name: 'Email', spend: 100, roas: 12.5, attributed_revenue: 1250, orders: 40 },
      { name: 'Facebook Ads', spend: 500, roas: 0.8, attributed_revenue: 400, orders: 20 },
      { name: 'Google Ads', spend: 300, roas: 3.5, attributed_revenue: 1050, orders: 80 },
      { name: 'TikTok Ads', spend: 100, roas: 4.0, attributed_revenue: 400, orders: 50 },
    ]

    const segments = buildMarketingSpendSegments(marketing, labels)
    expect(segments[0].name).toBe('Facebook Ads')
    expect(segments[0].value).toBe(500)
    expect(segments[0].badge).toMatch(/0[.,]8/)

    const { chartData, visibleTotal } = computeDonutSegments(segments)
    expect(visibleTotal).toBe(1000)
    expect(chartData.find((s) => s.name === 'Facebook Ads')?.share).toBeCloseTo(0.5, 6)
    expect(chartData.find((s) => s.name === 'Email')?.share).toBeCloseTo(0.1, 6)
  })

  it('supports switching Sales Channel segments between Revenue and Orders', () => {
    const salesChannels = [
      { name: 'Online', revenue: 600, gross_profit: 240, orders: 30 },
      { name: 'Retail', revenue: 300, gross_profit: 120, orders: 50 },
      { name: 'B2B', revenue: 100, gross_profit: 40, orders: 20 },
    ]

    const revSegments = buildSalesChannelSegments(salesChannels, 'revenue', labels)
    expect(revSegments.map((s) => s.name)).toEqual(['Online', 'Retail', 'B2B'])
    expect(computeDonutSegments(revSegments).visibleTotal).toBe(1000)

    const orderSegments = buildSalesChannelSegments(salesChannels, 'orders', labels)
    expect(orderSegments.map((s) => s.name)).toEqual(['Retail', 'Online', 'B2B'])
    expect(computeDonutSegments(orderSegments).visibleTotal).toBe(100)
  })

  it('computes Region shares summing to 100%', () => {
    const regions = [
      { name: 'Hanoi', revenue: 400, orders: 20, gross_profit: 150 },
      { name: 'Da Nang', revenue: 350, orders: 18, gross_profit: 130 },
      { name: 'Can Tho', revenue: 250, orders: 12, gross_profit: 90 },
    ]
    const segments = buildRegionSegments(regions, labels)
    const { chartData } = computeDonutSegments(segments)
    expect(chartData.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 6)
  })
})

describe('AllocationDonutCard interactions', () => {
  it('supports toggling legend visibility, recalculates shares, and opens clicked segment details', () => {
    localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'compact' }))
    const items = buildMarketingSpendSegments(
      [
        { name: 'Facebook Ads', spend: 500_000_000, roas: 0.76, attributed_revenue: 380_000_000, orders: 75 },
        { name: 'Google Ads', spend: 300_000_000, roas: 3.89, attributed_revenue: 1_167_000_000, orders: 248 },
        { name: 'TikTok Ads', spend: 200_000_000, roas: 4.44, attributed_revenue: 888_000_000, orders: 138 },
      ],
      labels
    )

    render(
      <PreferencesProvider>
        <AllocationDonutCard
          title="Marketing Channel Distribution"
          detail="Ad spend allocation"
          items={items}
          formatValue={(v) => `₫${Math.round(v / 1_000_000)}M`}
          centerLabel="Total Ad Spend"
          emptyText="No data"
        />
      </PreferencesProvider>
    )

    // Initially all 3 visible: total = 1000M, Facebook = 50.0%
    expect(screen.getByText('₫1000M')).toBeTruthy()
    expect(screen.getByText('50.0%')).toBeTruthy()

    // Toggle off TikTok Ads (200M): remaining = 800M, Facebook = 62.5%
    fireEvent.click(screen.getByRole('button', { name: 'Toggle TikTok Ads' }))
    expect(screen.getByText('₫800M')).toBeTruthy()
    expect(screen.getByText('62.5%')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show all' })).toBeTruthy()

    // Toggle off Google Ads -> only Facebook Ads remains; toggle button becomes disabled to keep >=1 slice
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Google Ads' }))
    expect(screen.getByText('100.0%')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle Facebook Ads' }).hasAttribute('disabled')).toBe(true)

    // Restore all slices via Show all
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByText('₫1000M')).toBeTruthy()

    // Click Google Ads legend button to open segment inspector detail panel
    fireEvent.click(screen.getByRole('button', { name: /^Google Ads/ }))
    expect(screen.getByText('Attributed Revenue')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close detail' })).toBeTruthy()
  })
})
