import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
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
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/doc/:token" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="/view/:token" element={<ViewPage />} />
        <Route path="*" element={<Navigate to={getAuthToken() ? '/' : '/auth'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
