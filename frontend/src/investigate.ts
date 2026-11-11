/** Maps an alert metric to a question the Ask workspace already answers (see tests/benchmark_cases.json). */
export function investigateQuestion(metric: string): string {
  if (metric.startsWith('facebook') || metric.startsWith('marketing')) return 'Which marketing channel had the lowest ROAS?'
  if (metric === 'revenue') return 'Why did revenue decrease this month?'
  if (metric === 'margin') return 'Why did gross profit decrease this month?'
  return 'Show anomalies this month.'
}

export const investigateHref = (metric: string) => '/ask?q=' + encodeURIComponent(investigateQuestion(metric))
