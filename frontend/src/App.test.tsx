import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router-dom'
import { appRoutes } from './App'

describe('application routing', () => {
  it('routes the canonical conditions path before the consent token path', () => {
    const matches = matchRoutes(appRoutes, '/consent/conditions')

    expect(matches?.at(-1)?.route.path).toBe('/consent/conditions')
    expect(matches?.at(-1)?.params.token).toBeUndefined()
  })

  it('routes /consent/:token to the participation decision page', () => {
    const matches = matchRoutes(appRoutes, '/consent/request-capability')

    expect(matches?.at(-1)?.route.path).toBe('/consent/:token')
    expect(matches?.at(-1)?.params.token).toBe('request-capability')
  })

  it('routes /s/:token to the capability Viewer route', () => {
    const matches = matchRoutes(appRoutes, '/s/private-capability')

    expect(matches).not.toBeNull()
    expect(matches?.at(-1)?.route.path).toBe('/s/:token')
    expect(matches?.at(-1)?.params.token).toBe('private-capability')
  })

  it('routes /admin independently from shared Sessions', () => {
    const matches = matchRoutes(appRoutes, '/admin')

    expect(matches?.at(-1)?.route.path).toBe('/admin')
  })

  it('keeps the Personal TackBar capability route unchanged', () => {
    const matches = matchRoutes(appRoutes, '/me/personal-capability')

    expect(matches?.at(-1)?.route.path).toBe('/me/:token')
    expect(matches?.at(-1)?.params.token).toBe('personal-capability')
  })

  it('does not preserve the old public Session route', () => {
    const matches = matchRoutes(appRoutes, '/sessions/internal-session-id')

    expect(matches?.at(-1)?.route.path).toBe('*')
  })
})
