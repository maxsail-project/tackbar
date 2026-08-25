import { useRoutes, type RouteObject } from 'react-router-dom'
import SessionViewerPage from './pages/SessionViewerPage'
import AdminPage from './pages/AdminPage'
import SessionsPage from './pages/SessionsPage'

export const appRoutes: RouteObject[] = [
  { path: '/s/:token', element: <SessionViewerPage /> },
  { path: '/admin', element: <AdminPage /> },
  { path: '*', element: <SessionsPage /> },
]

export default function App() {
  return useRoutes(appRoutes)
}
