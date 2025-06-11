import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import GlossaryPage from "./pages/GlossaryPage";
import ProfilePage from "./pages/ProfilePage";
import GamePage from "./pages/GamePage";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="glossary" element={<GlossaryPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="game/:roomId" element={<GamePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
