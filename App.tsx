import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import TermsGate from './components/TermsGate'
import { RequireRole, RequireWorkerOnboarding } from './components/Guards'
import Home from './pages/Home'
const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const Legal = lazy(() => import('./pages/Legal'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const NewRequest = lazy(() => import('./pages/NewRequest'))
const MyRequests = lazy(() => import('./pages/MyRequests'))
const Feed = lazy(() => import('./pages/Feed'))
const Claims = lazy(() => import('./pages/Claims'))
const WorkerProfile = lazy(() => import('./pages/WorkerProfile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Chat = lazy(() => import('./pages/Chat'))
const Admin = lazy(() => import('./pages/Admin'))

export default function App() {
  return (
    <Layout>
      <TermsGate>
      <Suspense fallback={<p className="py-8 text-center text-sm text-gray-600">Loading...</p>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/legal/:id" element={<Legal />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/onboarding" element={<RequireWorkerOnboarding><Onboarding /></RequireWorkerOnboarding>} />
        <Route path="/post" element={<RequireRole role="client"><NewRequest /></RequireRole>} />
        <Route path="/my-requests" element={<RequireRole role="client"><MyRequests /></RequireRole>} />
        <Route path="/feed" element={<RequireRole role="worker"><Feed /></RequireRole>} />
        <Route path="/claims" element={<RequireRole role="worker"><Claims /></RequireRole>} />
        <Route path="/worker/:id" element={<WorkerProfile />} />
        <Route path="/notifications" element={<RequireRole role="client"><Notifications /></RequireRole>} />
        <Route path="/chat/:threadId" element={<Chat />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<p className="text-sm text-gray-700">Page not found.</p>} />
      </Routes>
      </Suspense>
      </TermsGate>
    </Layout>
  )
}
