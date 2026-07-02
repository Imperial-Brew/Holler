import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { sync } from "./lib/sync";
import Login from "./components/Login";
import { isLoggedIn, logout } from "./holler_auth_client";
import Board from "./pages/Board";
import JobsList from "./pages/JobsList";
import JobDetail from "./pages/JobDetail";
import Tools from "./pages/Tools";
import Materials from "./pages/Materials";
import ShoppingList from "./pages/ShoppingList";
import Locations from "./pages/Locations";

export default function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [authenticated, setAuthenticated] = useState(isLoggedIn());

  useEffect(() => {
    const handleUnauthorized = () => setAuthenticated(false);
    window.addEventListener("holler:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("holler:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (navigator.onLine && authenticated) {
      sync();
    }
  }, [authenticated]);

  const handleSync = async () => {
    try {
      await sync();
    } catch (e) {
      console.error("Sync failed", e);
    }
  };

  if (!authenticated) {
    return <Login onLoginSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <h1 style={{ margin: 0 }}><Link to="/" style={{ textDecoration: "none", color: "inherit" }}>Holler</Link></h1>
            <nav style={{ display: "flex", gap: "1rem" }}>
              <Link to="/">Board</Link>
              <Link to="/jobs">Jobs</Link>
              <Link to="/locations">Locations</Link>
              <Link to="/tools">Tools</Link>
              <Link to="/materials">Materials</Link>
              <Link to="/shopping">Shopping</Link>
            </nav>
          </div>
          <button onClick={() => { logout(); setAuthenticated(false); }}>Logout</button>
        </header>

        <Routes>
          <Route path="/" element={<Board online={online} onSync={handleSync} />} />
          <Route path="/jobs" element={<JobsList />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/shopping" element={<ShoppingList />} />
          <Route path="/locations" element={<Locations />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
