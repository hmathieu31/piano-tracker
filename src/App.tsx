import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Repertoire from './pages/Library';
import Stats from './pages/Stats';
import Achievements from './pages/Achievements';
import Sessions from './pages/History';
import Settings from './pages/Settings';
import Coach from './pages/Coach';

function App() {
  return (
    <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="repertoire" element={<Repertoire />} />
          <Route path="sessions"   element={<Sessions />} />
          <Route path="stats"      element={<Stats />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="settings"   element={<Settings />} />
          <Route path="coach"      element={<Coach />} />
          <Route path="exercises"  element={<Navigate to="/coach" replace />} />
          {/* Legacy redirects */}
          <Route path="library"  element={<Navigate to="/repertoire" replace />} />
          <Route path="history"  element={<Navigate to="/sessions" replace />} />
          <Route path="goals"    element={<Navigate to="/stats" replace />} />
          <Route path="charts"   element={<Navigate to="/stats" replace />} />
          <Route path="heatmap"  element={<Navigate to="/stats" replace />} />
          <Route path="insights" element={<Navigate to="/stats" replace />} />
        </Route>
      </Routes>
  );
}

export default App;
