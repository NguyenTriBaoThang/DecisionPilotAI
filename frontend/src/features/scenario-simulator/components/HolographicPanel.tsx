import type { ReactNode } from 'react'
import type { InteractionMode, SimulatorTab } from '../types'

interface HolographicPanelProps {
  id: SimulatorTab
  title: string
  subtitle: string
  icon: ReactNode
  activeTab: SimulatorTab
  mode: InteractionMode
  positionStyle?: string
  onClickTab: (id: SimulatorTab) => void
  children: ReactNode
}

export function HolographicPanel({
  id,
  title,
  subtitle,
  icon,
  activeTab,
  mode,
  positionStyle = '',
  onClickTab,
  children,
}: HolographicPanelProps) {
  const isActive = activeTab === id
  const isFocusMode = mode === 'focus'
  const isOverviewMode = mode === 'overview'

  // Dynamic Class Names for 3D Floating & Focus States
  let transformClasses = 'transition-all duration-500 ease-out '

  if (isFocusMode) {
    if (isActive) {
      // Focused in front
      transformClasses +=
        'relative z-30 scale-100 opacity-100 translate-y-0 shadow-2xl border-cyan-400/50 shadow-cyan-500/20 bg-[#0e162c]/95'
    } else {
      // Inactive in focus mode: dimmed & scaled down
      transformClasses +=
        'hidden lg:block relative z-10 scale-90 opacity-35 hover:opacity-75 blur-[0.5px] hover:blur-none border-indigo-500/10 bg-[#070b17]/60'
    }
  } else if (isOverviewMode) {
    // Overview Mode: all panels float around the sphere with slight 3D perspective
    transformClasses += isActive
      ? 'relative z-20 scale-100 opacity-100 border-indigo-400 bg-[#0e162c]/90 shadow-xl shadow-indigo-500/15'
      : 'relative z-10 scale-95 opacity-85 hover:opacity-100 hover:scale-[0.98] border-indigo-500/20 bg-[#0c1224]/75 shadow-lg'
  } else {
    // Comparison mode
    transformClasses += isActive
      ? 'relative z-20 scale-100 opacity-100 border-cyan-400 bg-[#0e162c]/90'
      : 'relative z-10 scale-95 opacity-70 border-indigo-500/20 bg-[#0c1224]/70'
  }

  return (
    <div
      onClick={() => onClickTab(id)}
      className={`rounded-2xl border backdrop-blur-xl p-5 cursor-pointer overflow-hidden group select-none ${transformClasses} ${positionStyle}`}
      style={{
        boxShadow: isActive
          ? '0 0 30px -5px rgba(34, 211, 238, 0.25), inset 0 0 15px -3px rgba(99, 102, 241, 0.2)'
          : undefined,
      }}
    >
      {/* Top Holographic Header Bar */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-indigo-500/15">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl transition-colors ${
              isActive
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm shadow-cyan-400/30'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:text-cyan-300'
            }`}
          >
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white tracking-tight group-hover:text-cyan-300 transition-colors">
                {title}
              </h3>
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400 animate-ping" />
              )}
            </div>
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isActive
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/60'
            }`}
          >
            {isActive ? 'ACTIVE' : 'SELECT'}
          </span>
        </div>
      </div>

      {/* Main Panel Content Area */}
      <div className="space-y-3">{children}</div>
    </div>
  )
}

