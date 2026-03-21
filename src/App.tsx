import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Goals from './pages/Goals';
import Charts from './pages/Charts';
import Heatmap from './pages/Heatmap';
import Insights from './pages/Insights';
import Achievements from './pages/Achievements';
import History from './pages/History';
import Settings from './pages/Settings';

function App() {
  return (
    <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="goals" element={<Goals />} />
          <Route path="charts" element={<Charts />} />
          <Route path="heatmap" element={<Heatmap />} />
          <Route path="insights" element={<Insights />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
  );
}

export default App;
