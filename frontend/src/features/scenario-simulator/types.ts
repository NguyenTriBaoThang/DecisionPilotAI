import type { Options, Row, Scenario } from '../../api'

export type SimulatorTab = 'overview' | 'pricing' | 'marketing' | 'inventory' | 'recommendations'
export type InteractionMode = 'overview' | 'focus' | 'comparison'

export interface TabConfig {
  id: SimulatorTab
  title: string
  subtitle: string
  iconName: string
  glowColor: string
}

export interface PricingState {
  productId: string
  discountPct: number
  elasticity: number | null
  objective: 'profit' | 'revenue' | 'balanced'
  horizon: 7 | 30
}

export interface MarketingState {
  channel: string
  budgetChangePct: number
  responseExponent: number
  objective: 'profit' | 'revenue' | 'balanced'
  horizon: 7 | 30
}

export interface InventoryState {
  productId: string
  reorderQuantity: number
  incomingStock: number
  arrivalDay: number
  safetyStock: number | null
  objective: 'stockout' | 'profit' | 'balanced'
  horizon: 7 | 30
}

