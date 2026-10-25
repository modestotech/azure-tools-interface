/**
 * Real ARM and Graph error bodies, anonymized from `samples-raw/` (request IDs replaced). Both are
 * the answer to a GET with a made-up bearer token, so they hold no tenant or account data.
 */

export const ARM_401_INVALID_TOKEN = {
  error: { code: 'InvalidAuthenticationToken', message: 'The access token is invalid.' },
}

export const GRAPH_401_INVALID_TOKEN = {
  error: {
    code: 'InvalidAuthenticationToken',
    message: "Protocol 'Bearer' failed to validate because The token could not be read.",
    innerError: {
      date: '2026-10-25T20:16:53',
      'request-id': '00000000-0000-0000-0000-000000000901',
      'client-request-id': '00000000-0000-0000-0000-000000000901',
    },
  },
}
