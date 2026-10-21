import { isHttpError, type HttpError } from '@/lib/http'

/**
 * Outcome of loading one resource. Views show each resource's state on its own: a forbidden Graph
 * call must not block the APIM view (CLAUDE.md › Conventions).
 */
export type ResourceResult<T> =
  | { readonly status: 'ok'; readonly data: T }
  /** The resource doesn't exist, which is a normal answer (e.g. no policy at that scope). */
  | { readonly status: 'empty' }
  /** The signed-in user lacks permission. Show it, keep going. */
  | { readonly status: 'forbidden'; readonly error: HttpError }
  | { readonly status: 'error'; readonly error: HttpError }

/** Maps a thrown error to a result. Anything that isn't an HttpError is a bug and is rethrown. */
export function resultFromError(error: unknown): ResourceResult<never> {
  if (!isHttpError(error)) throw error
  switch (error.kind) {
    case 'not-found':
      return { status: 'empty' }
    case 'forbidden':
      return { status: 'forbidden', error }
    default:
      return { status: 'error', error }
  }
}

/**
 * Runs a load and turns HttpErrors into a ResourceResult. `null` (from `getJsonOrNull`) is empty.
 * Takes a function, so an error thrown while building the request (e.g. `encodePathSegment`
 * refusing an ID) becomes this resource's result too.
 */
export async function settle<T>(load: () => Promise<T | null>): Promise<ResourceResult<T>> {
  try {
    const data = await load()
    return data === null ? { status: 'empty' } : { status: 'ok', data }
  } catch (error) {
    return resultFromError(error)
  }
}
