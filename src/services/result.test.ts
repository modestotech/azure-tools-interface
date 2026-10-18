import { ForbiddenError, HttpError, NotFoundError } from '@/lib/http'
import { resultFromError, settle } from './result'

describe('ResourceResult', () => {
  it('wraps data, and treats null as empty', async () => {
    await expect(settle(Promise.resolve({ a: 1 }))).resolves.toEqual({
      status: 'ok',
      data: { a: 1 },
    })
    await expect(settle(Promise.resolve(null))).resolves.toEqual({ status: 'empty' })
  })

  it('classifies HTTP errors per resource', async () => {
    const forbidden = new ForbiddenError('graph', '/x', 'denied')
    await expect(settle(Promise.reject(forbidden))).resolves.toEqual({
      status: 'forbidden',
      error: forbidden,
    })
    expect(resultFromError(new NotFoundError('arm', '/x', 'gone'))).toEqual({ status: 'empty' })
    const network = new HttpError('network', 'arm', 'offline')
    expect(resultFromError(network)).toEqual({ status: 'error', error: network })
  })

  it('rethrows anything that is not an HttpError', async () => {
    const bug = new TypeError('bug')
    await expect(settle(Promise.reject(bug))).rejects.toBe(bug)
  })
})
