import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router-dom'
import { appRoutes } from './App'

describe('shared capability routing', () => {
  it('routes /s/:token to the capability Viewer route', () => {
    const matches = matchRoutes(appRoutes, '/s/private-capability')

    expect(matches).not.toBeNull()
    expect(matches?.at(-1)?.route.path).toBe('/s/:token')
    expect(matches?.at(-1)?.params.token).toBe('private-capability')
  })

  it('does not preserve the old public Session route', () => {
    const matches = matchRoutes(appRoutes, '/sessions/internal-session-id')

    expect(matches?.at(-1)?.route.path).toBe('*')
  })
})
