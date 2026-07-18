import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Layout } from '@/components/layout/Layout';
import { AssessmentProvider } from '@/features/assessment';
import { AuthProvider, RequireAuth } from '@/features/auth';
import { Assessment } from '@/pages/Assessment';
import { AssessmentProfile } from '@/pages/AssessmentProfile';
import { Home } from '@/pages/Home';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <AssessmentProvider>
            <Layout>
              <Routes>
                <Route element={<Home />} path="/" />
                <Route
                  element={
                    <RequireAuth>
                      <Navigate replace to="/" />
                    </RequireAuth>
                  }
                  path="/dashboard"
                />
                <Route
                  element={
                    <RequireAuth>
                      <AssessmentProfile />
                    </RequireAuth>
                  }
                  path="/assessment/profile"
                />
                <Route
                  element={
                    <RequireAuth>
                      <Assessment />
                    </RequireAuth>
                  }
                  path="/assessment"
                />
                <Route element={<Home />} path="*" />
              </Routes>
            </Layout>
          </AssessmentProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
