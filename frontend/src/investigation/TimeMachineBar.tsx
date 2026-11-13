import { useQuery,useQueryClient } from '@tanstack/react-query'
import { request } from '../api'
import { useAdvance,useReset,type Clock } from './api'
export function TimeMachineBar({canEdit}:{canEdit:boolean}){const client=useQueryClient();const {data}=useQuery({queryKey:['investigation','clock'],queryFn:()=>request<Clock>('/v1/investigation/clock')});const advance=useAdvance();const reset=useReset()
  const date=data?.current_end?data.current_end.split('-').reverse().join('/'):'…'
  const doAdvance=async(days:1|7)=>{await advance.mutateAsync(days);await client.invalidateQueries()}
  const doReset=async()=>{await reset.mutateAsync();await client.invalidateQueries()}
  return <div className="flex flex-wrap items-center gap-2 text-xs"><strong>Hôm nay trong demo: {date}</strong>{canEdit&&<><button onClick={()=>void doAdvance(1)} disabled={advance.isPending}>Tua 1 ngày</button><button onClick={()=>void doAdvance(7)} disabled={advance.isPending}>Tua 7 ngày</button><button onClick={()=>void doReset()} disabled={reset.isPending}>Đặt lại</button></>}</div>
}
