import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/DashboardModern'
import EditorPage from './pages/EditorPageWorkspace'
import ViewPage from './pages/ViewPage'
import AuthPage from './pages/AuthPage'
import { getAuthToken } from './lib/api'

function ProtectedRoute({ children }) {
  return getAuthToken() ? children : <Navigate to="/auth" replace />
}

export default function App() {
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
