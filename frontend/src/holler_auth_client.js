// holler_auth_client.js - token auth for Holler's React PWA.
//
// Caches a long-lived JWT so you log in ~once a month per device. Plays nice
// with offline-first: the token lives locally and rides on every API call;
// your protected views still read from Dexie when you're offline, and sync
// against the backend when you're back online.

const API = (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.startsWith("/"))
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.DEV ? (import.meta.env.VITE_API_URL || "") : "/api");
const TOKEN_KEY = "holler.token";

// --- Token storage ---------------------------------------------------------
// localStorage is the simplest store that survives reloads and offline use.
// If you'd rather keep the token in Dexie to match the rest of Holler, swap
// just these three helpers for a Dexie table read/write - nothing else changes.
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function logout() {
  setToken(null);
}
export function isLoggedIn() {
  return !!getToken();
}

// --- Login -----------------------------------------------------------------
// FastAPI's OAuth2PasswordRequestForm expects form-encoded fields, not JSON.
export async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Login failed");
  const data = await res.json();
  setToken(data.access_token);
  return data.access_token;
}

// --- Authenticated fetch ---------------------------------------------------
// Drop-in replacement for fetch(): attaches the Bearer token and, on a 401,
// clears the dead token and fires an event your app can catch to show login.
export async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    window.dispatchEvent(new CustomEvent("holler:unauthorized"));
  }
  return res;
}

// --- Usage sketch ----------------------------------------------------------
//
//   import { login, authFetch, isLoggedIn } from "./holler_auth_client";
//
//   // somewhere in a login form:
//   await login(username, password);
//
//   // anywhere you'd call your API:
//   const res = await authFetch("/tasks");
//   const tasks = await res.json();
//
//   // top-level: listen once for forced logout (token expired / revoked)
//   window.addEventListener("holler:unauthorized", () => {
//     // route to your login screen
//   });
//
// When you later move to an IdP, this file's only change is `login()` ->
// "redirect the browser to the IdP" instead of posting credentials. getToken,
// authFetch, and every component using them stay exactly the same.
