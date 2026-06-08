import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './components/Profile.jsx';
import VoiceTools from './pages/VoiceTools.jsx';
import DomainChecker from './pages/DomainChecker.jsx';
import TodoCalendar from './pages/TodoCalendar.jsx';
import ImageForensics from './pages/ImageForensics.jsx';
import VideoCheck from './pages/VideoCheck.jsx';
import ImageEditor from './pages/ImageEditor.jsx';
import TeamPage from './pages/TeamPage.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="h-full grid place-items-center text-gray-400">جارٍ التحميل…</div>;
  }
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="voice" element={<VoiceTools />} />
        <Route path="domains" element={<DomainChecker />} />
        <Route path="images" element={<ImageForensics />} />
        <Route path="image-editor" element={<ImageEditor />} />
        <Route path="video-check" element={<VideoCheck />} />
        <Route path="tasks" element={<TodoCalendar />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
