import { BrowserRouter, Routes, Route } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Home } from './routes/Home'
import { Dashboard } from './routes/Dashboard'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Home />} />
            </Routes>
          </Layout>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
