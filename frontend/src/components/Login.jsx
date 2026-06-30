import { useState } from "react";
import { login } from "../holler_auth_client";

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
    <div style={{
      maxWidth: "320px",
      margin: "100px auto",
      padding: "2rem",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      textAlign: "center",
      backgroundColor: "var(--bg-card, #fff)",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
    }}>
      <h2 style={{ marginBottom: "1.5rem" }}>Holler Login</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)" }}
        />
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: "0.75rem", 
            borderRadius: "4px", 
            border: "none", 
            backgroundColor: "var(--primary, #007bff)", 
            color: "white",
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}
    </div>
  );
}
