import {BrowserRouter, Routes, Route, Link} from 'react-router-dom';
import SolarTelemetryDashboard from './components/SolarTelemetryDashboard';
import GenerationVsExpectationChart from './components/GenerationVsExpectationChart';

function App() {
  return (
    <BrowserRouter>
      {/* Optional: A simple navigation menu that stays on every page */}
      <nav className="p-4 bg-gray-800 text-white flex gap-4">
        <Link to="/" className="hover:text-blue-300">Timeline</Link>
        <Link to="/generation-expectation" className="hover:text-blue-300">Performance</Link>
      </nav>

      {/* The Routes determine which component to show based on the URL */}
      <Routes>
        {/* If the URL is just "/", show the main dashboard */}
        <Route path="/" element={<SolarTelemetryDashboard/>} />
        
        {/* If the URL is "/generation-expectation", show the other one */}
        <Route path="/generation-expectation" element={<GenerationVsExpectationChart/>} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;  // <--- THIS LINE IS CRITICAL