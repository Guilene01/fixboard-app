import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { NotificationsProvider } from './context/NotificationsContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import MyPostsPage from './pages/MyPostsPage';
import NewPostPage from './pages/NewPostPage';
import ThreadPage from './pages/ThreadPage';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <NotificationsProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/my-posts" element={<MyPostsPage />} />
                  <Route path="/posts/new" element={<NewPostPage />} />
                  <Route path="/posts/:id" element={<ThreadPage />} />
                </Route>
              </Route>
            </Routes>
          </NotificationsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
