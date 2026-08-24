import { useRoutes, type RouteObject } from 'react-router-dom'
import SessionViewerPage from './pages/SessionViewerPage'

export const appRoutes: RouteObject[] = [
  { path: '/s/:token', element: <SessionViewerPage /> },
  { path: '*', element: <SessionViewerPage /> },
]

export default function App() {
  return useRoutes(appRoutes)
}
