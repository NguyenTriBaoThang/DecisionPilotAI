import { expect,it,vi } from 'vitest'
import { fireEvent,screen } from '@testing-library/react'
import * as api from '../api'
import { TimeMachineBar } from '../investigation/TimeMachineBar'
import { renderPage } from './redesignHelpers'
let current='2026-09-30'
vi.mock('../api',async(importOriginal)=>({...await importOriginal<typeof import('../api')>(),request:vi.fn()}))
vi.mock('../investigation/api',async(importOriginal)=>({...await importOriginal<typeof import('../investigation/api')>(),
  useAdvance:()=>({mutateAsync:async()=>{current='2026-10-07'},isPending:false}),
  useReset:()=>({mutateAsync:async()=>{current='2026-09-30'},isPending:false})}))
it('advancing invalidates clock query and shows the new date',async()=>{
  current='2026-09-30'
  vi.mocked(api.request).mockImplementation(async()=>({base_end:'2026-09-30',current_end:current}) as never)
  renderPage(<TimeMachineBar canEdit />)
  expect(await screen.findByText(/30\/09\/2026/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Tua 7 ngày'}))
  expect(await screen.findByText(/07\/10\/2026/)).toBeTruthy()
})
