import { expect,it,vi } from 'vitest'
import { fireEvent,screen } from '@testing-library/react'
import { CasePage } from '../investigation/CasePage'
import { renderPage } from './redesignHelpers'
vi.mock('../investigation/api',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../investigation/api')>()
  return {...actual,useCase:()=>({data:{id:'c1',title:'Doanh thu giảm',kind:'revenue_drop',status:'refused',impact_vnd:1,
    summary:{headline:'Chưa đủ bằng chứng để kết luận',causes:[],sufficiency:{level:'refused',explained_share:.3,checks:[],missing:['Bổ sung giao dịch']}},
    run_state:'done',options:[]}}),useTrace:()=>({events:[{seq:1,agent:'inventory',type:'finding',payload:{status:'eliminated',text:'Tồn kho đủ'},created_at:''},
    {seq:2,agent:'verifier',type:'rebuttal',payload:{reason:'Nguyên nhân chồng lấn',text:'Cần kiểm tra lại'},created_at:''}],runState:'done'}),
    useRun:()=>({mutate:vi.fn()}),useDecide:()=>({mutate:vi.fn()})}
})
it('marks eliminated inventory, highlights rebuttal and filters chat',()=>{
  renderPage(<CasePage canEdit={false}/>,{route:'/cases/c1',path:'/cases/:caseId'})
  expect(screen.getByLabelText(/Tồn kho: eliminated/)).toBeTruthy()
  expect(screen.getByText('Chưa đủ bằng chứng để kết luận')).toBeTruthy()
  expect(screen.getByText('Bổ sung giao dịch')).toBeTruthy()
  expect(screen.queryByText('Chọn')).toBeNull()
  fireEvent.click(screen.getByLabelText(/Tồn kho: eliminated/))
  expect(screen.queryByText('Cần kiểm tra lại')).toBeNull()
})
