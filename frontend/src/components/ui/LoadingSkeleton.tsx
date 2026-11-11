export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`dp-skeleton ${className}`} aria-hidden="true" />
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading data">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dp-surface p-4 space-y-3">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="dp-surface lg:col-span-2 p-5 space-y-4">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-60 w-full" />
        </div>
        <div className="dp-surface p-5 space-y-3">
          <SkeletonBlock className="h-5 w-36" />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-2" aria-busy="true" aria-label="Loading data">
      <SkeletonBlock className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
