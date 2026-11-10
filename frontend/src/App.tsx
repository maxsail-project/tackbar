import { useRoutes, type RouteObject } from 'react-router-dom'
import SessionViewerPage from './pages/SessionViewerPage'
import AdminPage from './pages/AdminPage'
import SessionsPage from './pages/SessionsPage'
import PersonalTackBarPage from './pages/PersonalTackBarPage'
import ConsentDecisionPage from './pages/ConsentDecisionPage'
import ConsentConditionsPage from './pages/ConsentConditionsPage'
import HistoricalConsentConditionsPage from './pages/HistoricalConsentConditionsPage'

export const appRoutes: RouteObject[] = [
  { path: '/consent/conditions', element: <ConsentConditionsPage /> },
  { path: '/consent/conditions/v0.7.21', element: <ConsentConditionsPage /> },
  { path: '/consent/conditions/v0.6.5', element: <HistoricalConsentConditionsPage /> },
  { path: '/consent/:token', element: <ConsentDecisionPage /> },
  { path: '/me/:token', element: <PersonalTackBarPage /> },
  { path: '/s/:token', element: <SessionViewerPage accessKind="original" /> },
  { path: '/q/:token', element: <SessionViewerPage accessKind="temporary" /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '*', element: <SessionsPage /> },
]

export default function App() {
  return useRoutes(appRoutes)
}
