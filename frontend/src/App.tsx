
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { PublicLayout } from './components/PublicLayout';
import HomePage from './pages/home/HomePage';
import AdminPanel from './pages/client/AdminPanel';
import OwnerPanel from './pages/owner/OwnerPanel';
import OwnerAnalyticsPage from './pages/owner/OwnerAnalyticsPage';
import ProfilePage from './pages/profile/ProfilePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import { ThemeProvider } from './config/ThemeConfig';
import { AuthProvider } from './config/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import StorefrontPage from './pages/storefront/StorefrontPage';
import './index.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/owner" element={<OwnerPanel />} />
              <Route path="/owner/analytics" element={<OwnerAnalyticsPage />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
          </Route>

          {/* Storefront público sin navbar — cada template gestiona su propio header */}
          <Route path="/:shopSlug" element={<StorefrontPage />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
