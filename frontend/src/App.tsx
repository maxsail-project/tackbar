import { useRoutes, type RouteObject } from 'react-router-dom'
import SessionViewerPage from './pages/SessionViewerPage'
import AdminPage from './pages/AdminPage'
import SessionsPage from './pages/SessionsPage'
import PersonalTackBarPage from './pages/PersonalTackBarPage'

export const appRoutes: RouteObject[] = [
  { path: '/me/:token', element: <PersonalTackBarPage /> },
  { path: '/s/:token', element: <SessionViewerPage /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '*', element: <SessionsPage /> },
]

export default function App() {
  return useRoutes(appRoutes)
}
