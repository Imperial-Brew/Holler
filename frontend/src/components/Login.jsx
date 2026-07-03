import { useState } from "react";
import { login } from "../holler_auth_client";
import ToolsMark from "./ToolsMark";

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      onLoginSuccess();
    } catch (err) {
      setError("Login failed. Check username and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--sp-4)" }}>
      <div className="card" style={{ width: "100%", maxWidth: "340px", textAlign: "center", padding: "var(--sp-6)" }}>
        <div style={{ color: "var(--primary)", marginBottom: "var(--sp-3)", display: "flex", justifyContent: "center" }}>
          <ToolsMark size="46" />
        </div>
        <h1 style={{ marginBottom: "var(--sp-1)" }}>Holler</h1>
        <p className="muted" style={{ marginBottom: "var(--sp-5)" }}>Sign in to your workshop</p>
        <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--sp-3)" }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn--primary" disabled={loading}>
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>
        {error && <p style={{ color: "var(--danger)", marginTop: "var(--sp-4)" }}>{error}</p>}
      </div>
    </div>
  );
}
