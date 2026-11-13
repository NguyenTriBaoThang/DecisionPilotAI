import { expect,it,vi } from 'vitest'
import { screen } from '@testing-library/react'
import * as api from '../api'
import { BriefPage } from '../investigation/BriefPage'
import { renderPage } from './redesignHelpers'
vi.mock('../api',async(importOriginal)=>({...await importOriginal<typeof import('../api')>(),request:vi.fn()}))
it('shows highest impact first, refusal, and scorecard',async()=>{
  vi.mocked(api.request).mockResolvedValue({clock:{base_end:'2026-09-30',current_end:'2026-09-30'},scorecard:{scored:3,correct:2,lessons:[]},cases:[
    {id:'small',kind:'revenue_drop',status:'refused',title:'Vụ nhỏ',impact_vnd:1e8,summary:null,run_state:'done'},
    {id:'large',kind:'revenue_drop',status:'new',title:'Vụ lớn',impact_vnd:2e9,summary:null,run_state:'idle'}]} as never)
  renderPage(<BriefPage />)
  expect(await screen.findByText('AI đúng 2/3 vụ')).toBeTruthy()
  expect(screen.getByRole('link',{name:/Xem AI điều tra/}).getAttribute('href')).toBe('/cases/large')
  expect(screen.getByText(/Vụ nhỏ/)).toBeTruthy()
})
