import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '../api'
import './KnowledgeGraph.css'
type Fact = {title: string; values: Record<string, unknown>; period?: string; table: string; source_id: string}
type Node = { facts?: Fact[]; dataset_id?: string; dataset_kind?: string; id: string; label: string; kind: string; detail: string; table?: string }
type Graph = { dataset_id: string; nodes: Node[]; edges: {source: string; target: string}[] }
export type GraphSource = {id: string; title: string; excerpt: string; retrieval?: string; via?: string; relations?: string[]}
const kindLabels: Record<string,string> = {evidence:'Căn cứ',product:'Sản phẩm',category:'Danh mục',region:'Khu vực',channel:'Kênh bán',segment:'Khách hàng',marketing:'Quảng cáo'}
const palette: Record<string,string> = {evidence:'#9876c8', product:'#409acb', category:'#e58a69', region:'#49ad8a', channel:'#d9ae51', segment:'#d77ea9', marketing:'#8383d3'}
export function KnowledgeGraph({sources=[]}: {sources?: GraphSource[]}) {
 const query=useQuery({queryKey:['knowledge-graph'],queryFn:()=>request<Graph>('/knowledge/graph')})
 const [selected,select]=useState(''), [search,setSearch]=useState(''), [trace,setTrace]=useState(false), [zoom,setZoom]=useState(1)
 const [kind,setKind]=useState('all'), [pan,setPan]=useState({x:0,y:0})
 const graph=query.data
 const positions=useMemo(()=>{
  const nodes=graph?.nodes??[], edges=graph?.edges??[]
  const points=nodes.map((n,i)=>({id:n.id,x:500+320*Math.sqrt((i+1)/nodes.length)*Math.cos(i*2.399),y:330+250*Math.sqrt((i+1)/nodes.length)*Math.sin(i*2.399)}))
  const index=new Map(points.map((p,i)=>[p.id,i]))
  // Group connected records before relaxing positions; isolated evidence stays on the perimeter.
  const adjacency=new Map(nodes.map(n=>[n.id,[] as string[]]))
  edges.forEach(e=>{adjacency.get(e.source)?.push(e.target);adjacency.get(e.target)?.push(e.source)})
  const assigned=new Map<string,number>(), components:string[][]=[]
  for(const n of nodes){if(assigned.has(n.id))continue;const group:string[]=[],queue=[n.id];assigned.set(n.id,components.length);while(queue.length){const id=queue.pop()!;group.push(id);for(const next of adjacency.get(id)??[])if(!assigned.has(next)){assigned.set(next,components.length);queue.push(next)}}components.push(group)}
  const large=components.filter(c=>c.length>3).sort((a,b)=>b.length-a.length)
  const centers=new Map<string,{x:number;y:number}>()
  large.forEach((group,g)=>{const angle=g/large.length*Math.PI*2;const center={x:500+260*Math.cos(angle),y:330+195*Math.sin(angle)};group.forEach((id,i)=>{centers.set(id,center);const p=points[index.get(id)!];p.x=center.x+45*Math.cos(i*2.399);p.y=center.y+45*Math.sin(i*2.399)})})
  const isolated=points.filter(p=>!centers.has(p.id));isolated.forEach((p,i)=>{p.x=500+435*Math.cos(i/isolated.length*Math.PI*2);p.y=330+285*Math.sin(i/isolated.length*Math.PI*2)})
  for(let step=0;step<220;step++){
   const forces=points.map(p=>{const c=centers.get(p.id);return {x:c?(c.x-p.x)*.006:0,y:c?(c.y-p.y)*.006:0}})
   for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++){
    const dx=points[i].x-points[j].x,dy=points[i].y-points[j].y,d=Math.max(8,Math.hypot(dx,dy)),f=500/(d*d)
    forces[i].x+=dx/d*f;forces[i].y+=dy/d*f;forces[j].x-=dx/d*f;forces[j].y-=dy/d*f
   }
   for(const edge of edges){const a=index.get(edge.source),b=index.get(edge.target);if(a===undefined||b===undefined)continue;const dx=points[b].x-points[a].x,dy=points[b].y-points[a].y,d=Math.max(1,Math.hypot(dx,dy)),f=(d-42)*.025;forces[a].x+=dx/d*f;forces[a].y+=dy/d*f;forces[b].x-=dx/d*f;forces[b].y-=dy/d*f}
   points.forEach((p,i)=>{p.x=Math.max(35,Math.min(965,p.x+forces[i].x+(500-p.x)*.001));p.y=Math.max(35,Math.min(625,p.y+forces[i].y+(330-p.y)*.001))})
  }
  return new Map(points.map(p=>[p.id,p]))
 },[graph])
 const focus=graph?.nodes.find(n=>n.id===selected)
 const related=new Set([selected,...(graph?.edges.filter(e=>e.source===selected||e.target===selected).flatMap(e=>[e.source,e.target])??[])])
 const matches=graph?.nodes.filter(n=>n.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))&&(kind==='all'||n.kind===kind))??[]
 const matchIds=new Set(matches.map(n=>n.id))
 return <section className="kg-panel kg-redesign"><header className="kg-header"><div><span className="kg-eyebrow">KHÁM PHÁ DỮ LIỆU</span><h2>Khám phá mạng tri thức</h2><p>{graph?`${graph.nodes.length} nút · ${graph.edges.length} quan hệ`:'Đang tải dữ liệu…'} · Chọn một nút để xem căn cứ</p></div><span className="kg-live">● Kết nối trực tiếp dữ liệu</span></header>
 <div className="kg-tabs"><button aria-pressed={!trace} onClick={()=>setTrace(false)}>Toàn cảnh tri thức</button><button aria-pressed={trace} onClick={()=>setTrace(true)}>Đường truy xuất Graph RAG ({sources.length})</button></div>
 {query.error&&<p role="alert" className="kg-message">Không tải được đồ thị. <button onClick={()=>void query.refetch()}>Thử lại</button></p>}
 {!trace?<><div className="kg-new-tools"><input aria-label="Tìm nút" placeholder="Tìm sản phẩm, danh mục, căn cứ…" value={search} onChange={e=>setSearch(e.target.value)}/><span>{matches.length} / {graph?.nodes.length ?? 0} nút phù hợp</span><button aria-label="Thu nhỏ" onClick={()=>setZoom(Math.max(.5,zoom-.2))}>−</button><button onClick={()=>{setZoom(1);select('');setSearch('');setKind('all');setPan({x:0,y:0})}}>Đặt lại</button><button aria-label="Phóng to" onClick={()=>setZoom(Math.min(2,zoom+.2))}>+</button></div>
 <div className="kg-filters"><button aria-pressed={kind==='all'} onClick={()=>setKind('all')}>Tất cả</button>{Object.entries(kindLabels).map(([key,label])=><button key={key} aria-pressed={kind===key} onClick={()=>setKind(key)}><i style={{background:palette[key]}}/>{label}<small>{graph?.nodes.filter(n=>n.kind===key).length ?? 0}</small></button>)}</div>
 <div className="kg-studio"><aside className="kg-directory"><div className="kg-directory-title">THỰC THỂ & CĂN CỨ <small>{matches.length}</small></div><div className="kg-directory-list">{matches.map(n=><button key={n.id} aria-pressed={selected===n.id} onClick={()=>select(n.id)}><i style={{background:palette[n.kind]}}/><span>{n.label}<small>{kindLabels[n.kind]} · {n.facts?.length ?? 0} nhóm thông tin</small></span><b>›</b></button>)}{!matches.length&&!query.isLoading&&<p>Không tìm thấy nút phù hợp.</p>}</div></aside>
 <div className="kg-overview"><svg onPointerDown={e=>{if(e.target===e.currentTarget){e.currentTarget.setPointerCapture(e.pointerId)}}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const ratio=1000/e.currentTarget.getBoundingClientRect().width;setPan(p=>({x:p.x+e.movementX*ratio,y:p.y+e.movementY*ratio}))}}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} viewBox="0 0 1000 660" role="img" aria-label="Mạng tri thức đầy đủ"><g transform={`translate(${500+pan.x} ${330+pan.y}) scale(${zoom}) translate(-500 -330)`}>{graph?.edges.map((e,i)=>{const a=positions.get(e.source),b=positions.get(e.target);return a&&b?<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected&&(e.source===selected||e.target===selected)?'#557d9b':'#bac6d4'} strokeOpacity={selected&&!related.has(e.source)?.12:.6} strokeWidth="1"/>:null})}{graph?.nodes.map(n=>{const p=positions.get(n.id)!;const active=(!selected||related.has(n.id))&&matchIds.has(n.id);return <g key={n.id} className="kg-svg-node" role="button" tabIndex={0} aria-label={`Xem ${n.label}`} onClick={()=>select(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(n.id)}}} opacity={active?1:.15}><title>{n.label}</title><circle cx={p.x} cy={p.y} r={selected===n.id?11:n.kind==='evidence'?4:7} fill={palette[n.kind]??'#718096'} stroke="white" strokeWidth="1.5"/>{(selected===n.id||n.kind==='category'||((search||kind!=='all')&&active))&&<text x={p.x+10} y={p.y+4} className="kg-svg-label" fontSize="11">{n.label}</text>}</g>})}</g></svg>
<div className="kg-map-note"><span>● Thực thể</span><span>● Căn cứ</span><span>— Quan hệ dữ liệu</span><small>Kéo nền để di chuyển · Chọn nút để xem nguồn</small></div></div>
 {focus?<aside className="kg-floating"><button aria-label="Đóng chi tiết" onClick={()=>select('')}>×</button><small>CHI TIẾT NÚT</small><span className="kg-badge">{kindLabels[focus.kind]}</span><h3>{focus.label}</h3><p>{related.size-1} nút liên quan · {focus.facts?.length ?? 0} nhóm thông tin</p><p className="kg-origin">{focus.dataset_kind === 'synthetic' ? 'Dữ liệu giả lập của dự án' : 'Dữ liệu từ bộ đang hoạt động'}</p>{focus.facts?.length ? focus.facts.map(fact => <section className="kg-fact" key={fact.source_id}><h4>{fact.title}</h4><small>{fact.period}</small><dl>{Object.entries(fact.values).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value == null ? 'Chưa có dữ liệu' : typeof value === 'number' ? new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 4}).format(value) : String(value)}</dd></div>)}</dl><small>Bảng: {fact.table}</small><code>Nguồn: {fact.source_id}</code></section>) : <p>{focus.detail}</p>}<small>Phiên bản dữ liệu: {focus.dataset_id}</small></aside>:<aside className="kg-floating kg-welcome"><span className="kg-eyebrow">TỪ DỮ LIỆU ĐẾN CĂN CỨ</span><div className="kg-welcome-icon">◎</div><h3>Mỗi kết nối đều có nguồn</h3><p>Chọn một nút trên bản đồ hoặc trong danh sách để đọc số liệu và bảng nguồn.</p><ol><li><b>01</b> Lọc nhóm dữ liệu cần tìm</li><li><b>02</b> Chọn thực thể để xem kết nối</li><li><b>03</b> Đối chiếu căn cứ và kỳ dữ liệu</li></ol></aside>}</div>
</>:<div className="kg-trace"><p>Câu hỏi → tìm căn cứ → mở rộng theo quan hệ → câu trả lời có nguồn</p>{!sources.length?<p>Đặt câu hỏi bên dưới để xem đường truy xuất thực tế.</p>:<div className="kg-trace-grid">{sources.map(s=><article key={s.id}><small>{s.retrieval==='graph'?`Qua ${s.via} · ${s.relations?.join(', ')}`:'Tìm theo từ khóa'}</small><h3>[{s.id}] {s.title}</h3><details><summary>Xem căn cứ</summary><p>{s.excerpt}</p></details></article>)}</div>}</div>}</section>
}
