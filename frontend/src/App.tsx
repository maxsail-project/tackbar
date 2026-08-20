import { Route, Routes } from 'react-router-dom'
import SessionViewerPage from './pages/SessionViewerPage'
import SessionsPage from './pages/SessionsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/sessions" element={<SessionsPage />} />
      <Route path="/sessions/:sessionId" element={<SessionViewerPage />} />
    </Routes>
  )
}

