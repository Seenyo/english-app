import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Layout } from '@/components/layout/Layout';
import { AssessmentProvider } from '@/features/assessment';
import { AuthProvider, RequireAuth } from '@/features/auth';
import { LearningProvider } from '@/features/learning';
import { Assessment } from '@/pages/Assessment';
import { AssessmentProfile } from '@/pages/AssessmentProfile';
import { Home } from '@/pages/Home';
import { Persona } from '@/pages/Persona';
import { Reports } from '@/pages/Reports';
import { ReportDetail } from '@/pages/ReportDetail';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <AssessmentProvider>
            <LearningProvider>
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
                  <Route
                    element={
                      <RequireAuth>
                        <Persona />
                      </RequireAuth>
                    }
                    path="/persona"
                  />
                  <Route
                    element={
                      <RequireAuth>
                        <Reports />
                      </RequireAuth>
                    }
                    path="/reports"
                  />
                  <Route
                    element={
                      <RequireAuth>
                        <ReportDetail />
                      </RequireAuth>
                    }
                    path="/reports/:reportId"
                  />
                  <Route element={<Home />} path="*" />
                </Routes>
              </Layout>
            </LearningProvider>
          </AssessmentProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
