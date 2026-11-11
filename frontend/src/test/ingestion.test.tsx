import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  currencySymbol,
  downloadErrorReport,
  getActiveCompanyId,
  importEnterpriseDataset,
  listMappingTemplates,
  money,
  moneyCompact,
  previewEnterpriseDataset,
  request,
  saveDatasetMapping,
  setActiveCompanyId,
  setActiveCurrency,
  uploadEnterpriseDataset,
  validateEnterpriseDataset,
  type ImportResult,
  type MappingSuggestionBundle,
  type QualityReport,
} from '../api'
import { PreferencesProvider } from '../preferences'
import { ToastProvider } from '../ui'
import { EnterpriseIngestionWizard } from '../components/ingestion/EnterpriseIngestionWizard'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    listMappingTemplates: vi.fn(),
    uploadEnterpriseDataset: vi.fn(),
    previewEnterpriseDataset: vi.fn(),
    saveDatasetMapping: vi.fn(),
    validateEnterpriseDataset: vi.fn(),
    importEnterpriseDataset: vi.fn(),
    downloadErrorReport: vi.fn(),
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  setActiveCompanyId('comp-default')
  setActiveCurrency('VND')
  localStorage.clear()
})

describe('Multi-tenant API client & multi-currency helpers', () => {
  it('injects X-Company-ID header and does not silently fall back to mocks for /v1 or structured errors', async () => {
    setActiveCompanyId('comp-acme')
    expect(getActiveCompanyId()).toBe('comp-acme')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'Company workspace has no active dataset yet.' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/dataset')).rejects.toThrow('Company workspace has no active dataset yet.')
    expect(fetchMock.mock.calls[0][1].headers.get('X-Company-ID')).toBe('comp-acme')

    await expect(request('/v1/companies')).rejects.toThrow('The service could not complete this request.')
  })

  it('formats VND, USD, and EUR accurately without VND bias', () => {
    localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
    setActiveCurrency('USD')
    expect(currencySymbol()).toBe('$')
    expect(money(1250)).toBe('$1,250')
    expect(money(1250.5)).toBe('$1,250.50')
    expect(moneyCompact(1500, 'USD')).toMatch(/^\$1\.5K$/)

    setActiveCurrency('EUR')
    expect(currencySymbol()).toBe('€')
    expect(money(99, 'EUR')).toBe('€99')
  }, 20_000)
})

describe('EnterpriseIngestionWizard 4-step workflow', () => {
  it('executes Upload -> Preview/Sheet -> AI Mapping + Custom Field/Template -> 5-Axis Quality + Error Download -> Confirmed Import', async () => {
    localStorage.setItem('dp-preferences', JSON.stringify({ language: 'en', currency: 'vnd' }))
    const bundle: MappingSuggestionBundle = {
      source_signature: 'sig-retail-v1',
      canonical_fields: {
        date: { label: 'Date', required: true, kind: 'date', description: 'Transaction date' },
        revenue: { label: 'Revenue', required: true, kind: 'currency', description: 'Revenue amount' },
        product: { label: 'Product', required: false, kind: 'string', description: 'SKU name' },
      },
      suggested_mapping: {
        order_dt: 'date',
        gross_sales: 'revenue',
        sku_title: 'product',
        branch_code: '__ignore__',
      },
      suggestions: [
        {
          source_column: 'order_dt',
          target_field: 'date',
          confidence: 0.96,
          reason: 'Header matches date aliases & ISO dates',
          inferred_type: 'date',
          non_empty_count: 10,
          empty_count: 0,
          unique_sample_count: 5,
          sample_values: ['2026-03-01'],
          top_alternatives: [],
        },
        {
          source_column: 'gross_sales',
          target_field: 'revenue',
          confidence: 0.92,
          reason: 'Currency symbol & numeric sales header',
          inferred_type: 'currency',
          non_empty_count: 10,
          empty_count: 0,
          unique_sample_count: 8,
          sample_values: ['$1,200.00'],
          top_alternatives: [],
        },
        {
          source_column: 'sku_title',
          target_field: 'product',
          confidence: 0.88,
          reason: 'Product identifier values',
          inferred_type: 'string',
          non_empty_count: 10,
          empty_count: 0,
          unique_sample_count: 3,
          sample_values: ['CloudCam Pro'],
          top_alternatives: [],
        },
        {
          source_column: 'branch_code',
          target_field: '__ignore__',
          confidence: 0.2,
          reason: 'No direct canonical match',
          inferred_type: 'string',
          non_empty_count: 10,
          empty_count: 0,
          unique_sample_count: 2,
          sample_values: ['B01'],
          top_alternatives: [],
        },
      ],
      matched_templates: [],
      capabilities_preview: { dashboard: true, forecast: true },
    }

    vi.mocked(listMappingTemplates).mockResolvedValue({
      company_id: 'comp-acme',
      items: [],
    })

    vi.mocked(uploadEnterpriseDataset).mockResolvedValue({
      dataset: {
        id: 'ds-1',
        dataset_id: 'ds-1',
        company_id: 'comp-acme',
        name: 'Retail Workbook',
        kind: 'uploaded',
        status: 'uploaded',
        storage_mode: 'partitioned',
        file_name: 'retail.xlsx',
        file_format: 'xlsx',
        file_size_bytes: 2048,
        selected_sheet: 'Summary',
        sheets: ['Summary', 'Orders'],
        columns: ['order_dt', 'gross_sales', 'sku_title', 'branch_code'],
        row_count: 10,
        valid_rows: 0,
        invalid_rows: 0,
        duplicate_rows: 0,
        mapping_confirmed: false,
        quality_confirmed: false,
        is_active: false,
        mapping: bundle.suggested_mapping,
        capabilities: { dashboard: true },
      },
      preview: {
        columns: ['order_dt', 'gross_sales', 'sku_title', 'branch_code'],
        rows: [{ order_dt: '2026-03-01', gross_sales: '$1,200.00', sku_title: 'CloudCam Pro', branch_code: 'B01' }],
        total_rows: 10,
        sheets: ['Summary', 'Orders'],
        selected_sheet: 'Summary',
        parse_warnings: [],
      },
      mapping_suggestions: bundle,
    })

    vi.mocked(previewEnterpriseDataset).mockResolvedValue({
      dataset_id: 'ds-1',
      company_id: 'comp-acme',
      file_name: 'retail.xlsx',
      file_format: 'xlsx',
      total_rows: 12,
      columns: ['order_dt', 'gross_sales', 'sku_title', 'branch_code'],
      rows: [{ order_dt: '2026-03-02', gross_sales: '$950.00', sku_title: 'CloudCam Pro', branch_code: 'B02' }],
      sheets: ['Summary', 'Orders'],
      selected_sheet: 'Orders',
      parse_warnings: [],
      current_mapping: bundle.suggested_mapping,
      mapping_suggestions: bundle,
    })

    vi.mocked(saveDatasetMapping).mockResolvedValue({
      dataset: {
        id: 'ds-1',
        dataset_id: 'ds-1',
        company_id: 'comp-acme',
        name: 'Retail Workbook',
        kind: 'uploaded',
        status: 'mapped',
        storage_mode: 'partitioned',
        file_format: 'xlsx',
        file_size_bytes: 2048,
        sheets: ['Summary', 'Orders'],
        columns: ['order_dt', 'gross_sales', 'sku_title', 'branch_code'],
        row_count: 12,
        valid_rows: 0,
        invalid_rows: 0,
        duplicate_rows: 0,
        currency: 'USD',
        mapping_confirmed: true,
        quality_confirmed: false,
        is_active: false,
        mapping: {
          order_dt: 'date',
          gross_sales: 'revenue',
          sku_title: 'product',
          branch_code: 'custom:store_branch',
        },
        capabilities: { dashboard: true, forecast: true },
      },
      mapping: {
        order_dt: 'date',
        gross_sales: 'revenue',
        sku_title: 'product',
        branch_code: 'custom:store_branch',
      },
      capabilities: { dashboard: true, forecast: true },
      saved_template: { id: 'tpl-1', name: 'ERP Orders v1', source_signature: 'sig-retail-v1' },
    })

    const qualityReport: QualityReport = {
      overall_score: 91.5,
      dimensions: {
        completeness: 98,
        validity: 92,
        consistency: 85,
        uniqueness: 90,
        accuracy: 92.5,
      },
      total_rows: 12,
      valid_rows: 10,
      invalid_rows: 2,
      missing_values: 1,
      duplicate_records: 1,
      detected_currency: 'USD',
      column_quality: [
        {
          column: 'order_dt',
          mapped_to: 'date',
          total_rows: 12,
          missing_values: 0,
          valid_values: 10,
          invalid_values: 2,
          unique_values: 10,
          completeness_pct: 100,
          validity_pct: 83.3,
          detected_formats: { iso: 10, bad: 2 },
          currencies: {},
        },
      ],
      warnings: ['2 rows contain invalid dates and will follow your selected cleaning policy.'],
      sample_errors: [
        {
          row_number: 7,
          severity: 'error',
          column: 'order_dt',
          target_field: 'date',
          issue_code: 'invalid_date',
          raw_value: 'not-a-date',
          message: 'Could not parse transaction date.',
        },
      ],
      cleaning_summary: {
        invalid_row_policy: 'skip_invalid',
        duplicate_policy: 'deduplicate',
        skipped_invalid_rows: 2,
        deduplicated_rows: 1,
        ready_to_import_rows: 9,
      },
      error_report_available: true,
    }

    vi.mocked(validateEnterpriseDataset).mockResolvedValue({
      dataset: {
        id: 'ds-1',
        dataset_id: 'ds-1',
        company_id: 'comp-acme',
        name: 'Retail Workbook',
        kind: 'uploaded',
        status: 'validated',
        storage_mode: 'partitioned',
        file_format: 'xlsx',
        file_size_bytes: 2048,
        sheets: ['Summary', 'Orders'],
        columns: ['order_dt', 'gross_sales', 'sku_title', 'branch_code'],
        row_count: 12,
        valid_rows: 10,
        invalid_rows: 2,
        duplicate_rows: 1,
        currency: 'USD',
        mapping_confirmed: true,
        quality_confirmed: true,
        is_active: false,
        mapping: {
          order_dt: 'date',
          gross_sales: 'revenue',
          sku_title: 'product',
          branch_code: 'custom:store_branch',
        },
        capabilities: { dashboard: true, forecast: true },
      },
      quality_report: qualityReport,
    })

    const importResult: ImportResult = {
      dataset: {
        id: 'ds-1',
        dataset_id: 'ds-1',
        company_id: 'comp-acme',
        name: 'Retail Workbook',
        kind: 'uploaded',
        status: 'imported',
        storage_mode: 'partitioned',
        file_format: 'xlsx',
        file_size_bytes: 2048,
        sheets: ['Summary', 'Orders'],
        columns: ['order_dt', 'gross_sales', 'sku_title', 'branch_code'],
        row_count: 12,
        valid_rows: 10,
        invalid_rows: 2,
        duplicate_rows: 1,
        currency: 'USD',
        mapping_confirmed: true,
        quality_confirmed: true,
        is_active: true,
        mapping: {
          order_dt: 'date',
          gross_sales: 'revenue',
          sku_title: 'product',
          branch_code: 'custom:store_branch',
        },
        capabilities: { dashboard: true, forecast: true },
      },
      quality_report: qualityReport,
      imported_counts: { sales_transactions: 9, products: 1 },
      model_ready: true,
    }
    vi.mocked(importEnterpriseDataset).mockResolvedValue(importResult)

    const onImported = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <PreferencesProvider>
          <ToastProvider>
            <EnterpriseIngestionWizard
              companyId="comp-acme"
              session={{ actor: 'acme-analyst', role: 'analyst', authentication: 'token', import_enabled: true }}
              onImported={onImported}
            />
          </ToastProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    )

    // Step 1: Select & Upload file
    const file = new File(['dummy'], 'retail.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(screen.getByLabelText('Enterprise dataset file'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /Upload & Preview File/i }))

    await screen.findByLabelText('Worksheet selector')
    expect(uploadEnterpriseDataset).toHaveBeenCalledWith(file, { datasetName: 'retail' })

    // Step 2: Switch sheet & proceed to AI Column Mapping
    fireEvent.change(screen.getByLabelText('Worksheet selector'), { target: { value: 'Orders' } })
    await waitFor(() =>
      expect(previewEnterpriseDataset).toHaveBeenCalledWith('ds-1', { sheet_name: 'Orders', limit: 25 })
    )
    fireEvent.click(screen.getByRole('button', { name: /Continue to AI Column Mapping/i }))

    // Step 3: Edit mapping (set custom field), select currency, toggle Save Template & Validate
    await screen.findByLabelText('Map column branch_code')
    fireEvent.change(screen.getByLabelText('Dataset Currency'), { target: { value: 'USD' } })
    fireEvent.change(screen.getByLabelText('Map column branch_code'), { target: { value: '__custom__' } })
    fireEvent.change(screen.getByLabelText('Custom field name for branch_code'), { target: { value: 'store_branch' } })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Template Name'), { target: { value: 'ERP Orders v1' } })

    fireEvent.click(screen.getByRole('button', { name: /Save Mapping & Run Quality Engine/i }))

    await screen.findByText(/91\.5%/)
    expect(saveDatasetMapping).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        confirmed: true,
        currency: 'USD',
        save_template: true,
        template_name: 'ERP Orders v1',
        custom_fields: ['store_branch'],
      })
    )
    expect(validateEnterpriseDataset).toHaveBeenCalled()

    // Step 4: Verify 5 quality axes, error report downloads, and mandatory explicit confirmation
    expect(screen.getByText('Completeness')).toBeTruthy()
    expect(screen.getByText('Validity')).toBeTruthy()
    expect(screen.getByText('Consistency')).toBeTruthy()
    expect(screen.getByText('Uniqueness')).toBeTruthy()
    expect(screen.getByText('Accuracy')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Download Error Report \(CSV\)/i }))
    await waitFor(() => expect(downloadErrorReport).toHaveBeenCalledWith('ds-1', 'csv'))
    const jsonBtn = screen.getByRole('button', { name: /Download Error Report \(JSON\)/i }) as HTMLButtonElement
    await waitFor(() => expect(jsonBtn.disabled).toBe(false))
    fireEvent.click(jsonBtn)
    await waitFor(() => expect(downloadErrorReport).toHaveBeenCalledWith('ds-1', 'json'))

    const importBtn = screen.getByRole('button', { name: /Confirm & Import Dataset/i }) as HTMLButtonElement
    expect(importBtn.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Duplicate Handling'), { target: { value: 'deduplicate' } })
    fireEvent.click(screen.getByRole('switch'))
    expect(importBtn.disabled).toBe(false)

    fireEvent.click(importBtn)
    await screen.findByText(/Import Complete — Active Dataset: Retail Workbook/i)
    expect(importEnterpriseDataset).toHaveBeenCalledWith('ds-1', {
      confirmed: true,
      sheet_name: 'Orders',
      invalid_row_policy: 'skip_invalid',
      duplicate_policy: 'deduplicate',
      currency: 'USD',
      activate: true,
    })
    expect(onImported).toHaveBeenCalledWith(importResult)
  }, 20_000)
})
