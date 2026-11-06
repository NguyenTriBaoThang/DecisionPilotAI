import { it, expect, vi, afterEach } from 'vitest'
import { request, uploadSnapshot } from '../api'

afterEach(() => vi.unstubAllGlobals())
it('attaches workspace authorization and propagates structured validation failures', async () => {
  sessionStorage.setItem('dp-access-token', 'workspace-token')
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'Invalid business scope' }] }) })
  vi.stubGlobal('fetch', fetch)
  await expect(request('/forecast', {})).rejects.toThrow('Invalid business scope')
  const [, options] = fetch.mock.calls[0]
  expect(options.headers.get('Authorization')).toBe('Bearer workspace-token')
})
it('rejects unsupported, empty and oversized uploads before making a request', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(uploadSnapshot(new File(['x'], 'bad.csv'), 'empty', 'key')).rejects.toThrow('.zip or .xlsx')
  await expect(uploadSnapshot(new File([], 'empty.zip'), 'empty', 'key')).rejects.toThrow('empty')
  const oversized = new File(['x'], 'large.zip')
  Object.defineProperty(oversized, 'size', { value: 40*1024*1024+1 })
  await expect(uploadSnapshot(oversized, 'empty', 'key')).rejects.toThrow('40 MiB')
  expect(fetch).not.toHaveBeenCalled()
})
