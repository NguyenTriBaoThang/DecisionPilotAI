import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NoteCard, PageHero, StatCard } from '../redesign/ui'

describe('redesign primitives', () => {
  it('PageHero shows the title and a decorative illustration', () => {
    const { container } = render(<PageHero tone="ask" title="Hỏi AI" illus="robot" />)
    expect(screen.getByRole('heading', { name: 'Hỏi AI' })).toBeTruthy()
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/illustrations/robot.png')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('StatCard shows value and badge', () => {
    render(<StatCard illus="megaphone" label="Quảng cáo thu về" value="2,76×" badge={{ text: 'Tốt', kind: 'good' }} variant="rose" />)
    expect(screen.getByText('2,76×')).toBeTruthy()
    expect(screen.getByText('Tốt')).toBeTruthy()
  })

  it('NoteCard renders its action as a link', () => {
    render(
      <MemoryRouter>
        <NoteCard color="yellow" illus="warning" title="Cảnh báo" body="Chi cao" action={{ label: 'Xem vì sao', to: '/ask?q=x' }} />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'Xem vì sao' }).getAttribute('href')).toBe('/ask?q=x')
  })
})

import { TechDetails } from '../redesign/ui'

describe('TechDetails', () => {
  it('keeps technical content collapsed until opened', () => {
    const { container } = render(<TechDetails summary="Xem chi tiết kỹ thuật"><p>MAE table</p></TechDetails>)
    const details = container.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByText('Xem chi tiết kỹ thuật')).toBeTruthy()
  })
})
