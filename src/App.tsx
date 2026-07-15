import { BrowserRouter, Route, Routes } from 'react-router';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Layout } from '@/components/layout/Layout';
import { AuthProvider, RequireAuth, UserMenu } from '@/features/auth';
import { Dashboard } from '@/pages/Dashboard';
import { Home } from '@/pages/Home';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <Layout headerRight={<UserMenu />}>
            <Routes>
              <Route element={<Home />} path="/" />
              <Route
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
                path="/dashboard"
              />
              <Route element={<Home />} path="*" />
            </Routes>
          </Layout>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
