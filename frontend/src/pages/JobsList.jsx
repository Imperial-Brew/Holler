import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { createJob, sync } from "../lib/sync";

export default function JobsList() {
  const [newJobTitle, setNewJobTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Re-sync on navigation so another device's changes show up; the Dexie
  // cache below still renders immediately (and offline).
  useEffect(() => {
    if (navigator.onLine) {
      sync();
    }
  }, []);

  const rawJobs = useLiveQuery(() => db.jobs.toArray(), []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);

  // Display status comes from the milestone task (same derivation the server
  // uses); the jobs.status column is only a fallback until tasks sync.
  const milestoneStatus = {};
  for (const t of tasks ?? []) {
    if (t.is_milestone && t.job_id && !t.deleted) {
      milestoneStatus[t.job_id] = t.status;
    }
  }

  const jobs = (rawJobs ?? [])
    .filter((j) => !j.deleted)
    .map((j) => ({ ...j, status: milestoneStatus[j.id] ?? j.status }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const loading = rawJobs === undefined;

  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!newJobTitle.trim()) return;
    setSubmitting(true);
    try {
      const job = await createJob({ title: newJobTitle });
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading jobs...</div>;

  return (
    <div className="jobs-list">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Jobs</h1>
        <Link to="/">Board</Link>
      </div>

      <form onSubmit={handleCreateJob} style={{ 
        marginBottom: "2rem", 
        padding: "1rem", 
        background: "var(--bg-muted)", 
        borderRadius: "8px" 
      }}>
        <h3>Create New Job</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            placeholder="Job Title (e.g. Dog run conversion)"
            value={newJobTitle}
            onChange={(e) => setNewJobTitle(e.target.value)}
            disabled={submitting}
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button type="submit" disabled={submitting || !newJobTitle.trim()}>
            {submitting ? "Creating..." : "Create Job"}
          </button>
        </div>
      </form>

      {jobs.length === 0 ? (
        <p>No jobs found.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {jobs.map(job => (
            <li key={job.id} style={{ 
              marginBottom: "1rem", 
              padding: "1rem", 
              border: "1px solid var(--border)",
              borderRadius: "4px"
            }}>
              <Link to={`/jobs/${job.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "1.2rem" }}>{job.title}</strong>
                  <span style={{
                    padding: "0.2rem 0.6rem",
                    borderRadius: "12px",
                    fontSize: "0.8em",
                    background: job.status === "done" ? "#4caf50" : "#2196f3",
                    color: "white"
                  }}>
                    {job.status}
                  </span>
                </div>
                <div style={{ fontSize: "0.8em", color: "gray", marginTop: "0.5rem" }}>
                  Created: {new Date(job.created_at).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: "2rem" }}>
        <Link to="/">← Back to Board</Link>
      </div>
    </div>
  );
}
