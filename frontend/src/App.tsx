import { useRoutes, type RouteObject } from 'react-router-dom'
import SessionViewerPage from './pages/SessionViewerPage'
import AdminPage from './pages/AdminPage'
import SessionsPage from './pages/SessionsPage'
import PersonalTackBarPage from './pages/PersonalTackBarPage'
import ConsentDecisionPage from './pages/ConsentDecisionPage'
import ConsentConditionsPage from './pages/ConsentConditionsPage'

export const appRoutes: RouteObject[] = [
  { path: '/consent/conditions', element: <ConsentConditionsPage /> },
  { path: '/consent/:token', element: <ConsentDecisionPage /> },
  { path: '/me/:token', element: <PersonalTackBarPage /> },
  { path: '/s/:token', element: <SessionViewerPage /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '*', element: <SessionsPage /> },
]

export default function App() {
  return useRoutes(appRoutes)
}
