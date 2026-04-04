import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/DashboardModern'
import EditorPage from './pages/EditorPageWorkspace'
import ViewPage from './pages/ViewPage'
import AuthPage from './pages/AuthPage'
import { getAuthToken } from './lib/api'

function ProtectedRoute({ children }) {
  const location = useLocation()
  return getAuthToken()
    ? children
    : <Navigate to="/auth" replace state={{ redirectTo: `${location.pathname}${location.search}${location.hash}` }} />
}

export default function App() {
  useEffect(() => {
    document.title = 'LiveDraft'
    document.querySelectorAll('link[rel*="icon"]').forEach((node) => node.remove())
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/doc/:token" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="/view/:token" element={<ViewPage />} />
        <Route path="*" element={<Navigate to={getAuthToken() ? '/app' : '/'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
