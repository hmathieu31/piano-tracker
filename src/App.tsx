import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Library from './pages/Library';
import Stats from './pages/Stats';
import Achievements from './pages/Achievements';
import History from './pages/History';
import Settings from './pages/Settings';

function App() {
  return (
    <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="library" element={<Library />} />
          <Route path="stats" element={<Stats />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          {/* Redirects from old routes */}
          <Route path="goals"    element={<Navigate to="/stats" replace />} />
          <Route path="charts"   element={<Navigate to="/stats" replace />} />
          <Route path="heatmap"  element={<Navigate to="/stats" replace />} />
          <Route path="insights" element={<Navigate to="/stats" replace />} />
        </Route>
      </Routes>
  );
}

export default App;
