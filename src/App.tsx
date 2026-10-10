import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Today from './pages/Today';
import Songs from './pages/Songs';
import History from './pages/History';
import Settings from './pages/Settings';

function App() {
  return (
    <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="songs"    element={<Songs />} />
          <Route path="history"  element={<History />} />
          <Route path="settings" element={<Settings />} />
          {/* Old pages */}
          <Route path="repertoire" element={<Navigate to="/songs" replace />} />
          <Route path="library"    element={<Navigate to="/songs" replace />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
  );
}

export default App;
