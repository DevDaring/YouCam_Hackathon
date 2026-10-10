import { MotionConfig } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider, RequireAuth } from './lib/auth'
import { RegionProvider } from './lib/region'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import Placeholder from './pages/Placeholder'

const Start = lazy(() => import('./pages/Start'))
const Login = lazy(() => import('./pages/Login'))

function PageFallback() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12" aria-busy="true">
      <div className="mx-auto h-9 w-2/3 animate-pulse rounded-xl bg-line/60" />
      <div className="mt-8 h-72 animate-pulse rounded-3xl bg-line/40" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route
          path="login"
          element={
            <Suspense fallback={<PageFallback />}>
              <Login />
            </Suspense>
          }
        />
        {/* Family room is public: voters never sign in (spec K2). */}
        <Route path="room/:token" element={<Placeholder page="room" milestone="M4" />} />
        <Route
          path="start"
          element={
            <RequireAuth>
              <Suspense fallback={<PageFallback />}>
                <Start />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route path="studio" element={<RequireAuth><Placeholder page="studio" milestone="M2" /></RequireAuth>} />
        <Route path="pack/:lookId" element={<RequireAuth><Placeholder page="pack" milestone="M6" /></RequireAuth>} />
        <Route path="store" element={<RequireAuth><Placeholder page="store" milestone="M7" /></RequireAuth>} />
        <Route path="demo" element={<RequireAuth><Placeholder page="demo" milestone="M6" /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <RegionProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </RegionProvider>
    </MotionConfig>
  )
}
