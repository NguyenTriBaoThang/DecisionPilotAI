import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, CircleHelp, Database, Inbox } from 'lucide-react'
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { compact, decimal, label, percent, shortDate, type Row } from './api'

export const cn = (...values: ClassValue[]) => twMerge(clsx(values))

// shadcn-style primitives live with the application and use local design tokens.
export function Button({className,...props}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('button',className)} {...props}/>
}
export function Card({children,className}: {children:ReactNode;className?:string}) {
  return <section className={cn('card',className)}>{children}</section>
}
export function Heading({eyebrow,title,subtitle,aside}: {eyebrow:string;title:string;subtitle:string;aside?:ReactNode}) {
  return <div className="page-heading"><div><div className="eyebrow"><i/>{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{aside}</div>
}
export function SectionTitle({title,detail,aside}: {title:string;detail?:string;aside?:ReactNode}) {
  return <div className="section-heading"><div><h2>{title}</h2>{detail&&<p>{detail}</p>}</div>{aside}</div>
}
export function Select({label: title,value,onChange,options}: {
  label:string;value:string;onChange:(value:string)=>void;options:(string | [string,string])[]
}) {
  return <label className="field"><span>{title}</span><select value={value} onChange={(e)=>onChange(e.target.value)}>
    {options.map((v)=>Array.isArray(v)?<option value={v[0]} key={v[0]}>{v[1]}</option>:<option key={v}>{v}</option>)}
  </select></label>
}
export function Pill({children,tone='muted'}: {children:ReactNode;tone?:string}) {
  return <span className={cn('pill','pill-'+tone)}>{children}</span>
}
export function Loading() {
  return <div className="load-layout" role="status" aria-label="Loading data"><div/><div/><div/></div>
}
export function ErrorState({error,retry}: {error:Error | null;retry?:()=>void}) {
  if (!error) return null
  return <div className="error" role="alert"><AlertCircle size={19}/><span>{error.message}</span>{retry&&<Button onClick={retry}>Retry</Button>}</div>
}
export function Empty({text}: {text:string}) {
  return <div className="empty"><Inbox size={24}/><p>{text}</p></div>
}
export function Source({children}: {children:ReactNode}) {
  return <div className="source"><Database size={14}/>{children}</div>
}
export function Stat({title,value,change,icon,formula}: {title:string;value:string;change?:number|null;icon:ReactNode;formula?:string}) {
  return <Card className="stat"><div className="stat-top"><span className="stat-icon">{icon}</span>
    {formula&&<span className="formula" tabIndex={0} aria-label={formula}><CircleHelp size={16}/><span role="tooltip">{formula}</span></span>}</div>
    <div className="stat-label">{title}</div><div className="stat-number">{value}</div>
    {change!=null&&<div className="stat-footer"><Pill tone={change<0?'critical':'success'}>{change<0?<ArrowDownRight size={13}/>:<ArrowUpRight size={13}/>} {change<0?"−":change>0?"+":""}{percent(Math.abs(change))}</Pill><span>vs previous period</span></div>}
  </Card>
}
const palette = ['var(--accent)','var(--teal)','var(--amber)']
type Series = {key:string;name:string;color?:string;kind?:'line'|'area'|'bar';dashed?:boolean}
export function Chart({data,x,series,height=270,date=false,band,format}: {
  data:Row[];x:string;series:Series[];height?:number;date?:boolean;band?:boolean;format?:(value:number)=>string
}) {
  if (!data.length) return <Empty text="No values match this selection."/>
  const numeric = (value:unknown) => typeof value==='number' ? (format?format(value):decimal(value)) : '—'
  const plotData = band ? data.map(row=>({...row,band:typeof row.lower==='number'&&typeof row.upper==='number'?[row.lower,row.upper]:null})) : data
  return <div className="chart" style={{height}}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={plotData} margin={{top:12,right:12,left:0,bottom:4}}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false}/>
        <XAxis dataKey={x} axisLine={false} tickLine={false} tickMargin={10} minTickGap={22}
          tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={(value)=>date?shortDate(String(value)):String(value).slice(0,17)}/>
        <YAxis axisLine={false} tickLine={false} width={58} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={compact}/>
        <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:12,color:'var(--text)'}}
          formatter={(value,name)=>[numeric(value),String(name)]}/>
        {band&&<Area type="monotone" dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={.13} tooltipType="none" isAnimationActive={false}/>}
        {series.map((s,i)=>{
          const color = s.color || palette[i%palette.length]
          if (s.kind==='bar') return <Bar key={s.key} dataKey={s.key} name={s.name} fill={color} radius={[4,4,0,0]} maxBarSize={48} isAnimationActive={false}/>
          if (s.kind==='area') return <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color} strokeWidth={2.5} fill={color} fillOpacity={.08} isAnimationActive={false}/>
          return <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color} strokeWidth={2.5}
            strokeDasharray={s.dashed?'5 4':undefined} dot={false} connectNulls={false} isAnimationActive={false}/>
        })}
      </ComposedChart>
    </ResponsiveContainer></div>
}
export function Table({rows,columns}: {rows:Row[];columns:{key:string;title?:string;format?:(v:number)=>string}[]}) {
  if (!rows.length) return <Empty text="No records found."/>
  return <div className="table-wrap"><table><thead><tr>{columns.map((col)=><th key={col.key} scope="col">{col.title||label(col.key)}</th>)}</tr></thead>
    <tbody>{rows.map((row,i)=><tr key={i}>{columns.map((col)=><td key={col.key}>{
      typeof row[col.key]==='number' ? (col.format||decimal)(row[col.key] as number) : row[col.key]==null?'—':String(row[col.key])
    }</td>)}</tr>)}</tbody></table></div>
}
