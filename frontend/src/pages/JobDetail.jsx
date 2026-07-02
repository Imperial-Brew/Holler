import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../lib/db";
import { authFetch } from "../holler_auth_client";
import { setTaskStatus, createJobTask, receiveMaterial, reconcileJobMaterials } from "../lib/sync";

export default function JobDetail() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [dependsOnIds, setDependsOnIds] = useState([]);
  const [requiredToolIds, setRequiredToolIds] = useState([]);
  const [addingTask, setAddingTask] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState({});
  const [leftoverQtys, setLeftoverQtys] = useState({});
  const [reconciling, setReconciling] = useState(false);

  const allTools = useLiveQuery(() => db.tools.orderBy("name").toArray(), [], []);

  const fetchJob = () => {
    authFetch(`/jobs/${id}`)
      .then(res => {
        if (!res.ok) throw new Error("Job not found");
        return res.json();
      })
      .then(data => {
        setJob(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchJob();
  }, [id]);

  const handleMarkDone = async (taskId) => {
    setSubmitting(taskId);
    try {
      await setTaskStatus(taskId, "done");
      fetchJob();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(null);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      const updatedJob = await createJobTask(id, { 
        title: newTaskTitle,
        depends_on_ids: dependsOnIds,
        required_tool_ids: requiredToolIds
      });
      setJob(updatedJob);
      setNewTaskTitle("");
      setDependsOnIds([]);
      setRequiredToolIds([]);
    } catch (err) {
      alert(err.message);
    } finally {
      setAddingTask(false);
    }
  };

  const toggleDependency = (taskId) => {
    setDependsOnIds(prev => 
      prev.includes(taskId) ? prev.filter(tid => tid !== taskId) : [...prev, taskId]
    );
  };

  const toggleTool = (toolId) => {
    setRequiredToolIds(prev => 
      prev.includes(toolId) ? prev.filter(tid => tid !== toolId) : [...prev, toolId]
    );
  };

  const handleReceive = async (materialId) => {
    const qty = parseFloat(receiveQtys[materialId]);
    if (isNaN(qty) || qty <= 0) return;
    
    try {
      await receiveMaterial(materialId, { qty });
      setReceiveQtys(prev => ({ ...prev, [materialId]: "" }));
      fetchJob();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReconcile = async (e) => {
    e.preventDefault();
    if (!job || job.reconciled) return;
    
    const materials = job.materials.map(m => ({
      material_id: m.material_id,
      leftover_qty: parseFloat(leftoverQtys[m.material_id] || 0)
    }));

    setReconciling(true);
    try {
      const updatedJob = await reconcileJobMaterials(id, { materials });
      setJob(updatedJob);
    } catch (err) {
      alert(err.message);
    } finally {
      setReconciling(false);
    }
  };

  if (loading) return <div>Loading job details...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error} <br/> <Link to="/jobs">Back to Jobs</Link></div>;
  if (!job) return null;

  return (
    <div className="job-detail">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{job.title}</h1>
        <span style={{
          padding: "0.2rem 0.6rem",
          borderRadius: "12px",
          background: job.status === "done" ? "#4caf50" : "#2196f3",
          color: "white"
        }}>
          {job.status}
        </span>
      </div>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Tasks</h2>
        
        <div style={{ 
          marginBottom: "1.5rem", 
          padding: "1rem", 
          background: "var(--bg-muted)", 
          borderRadius: "8px" 
        }}>
          <h4>Add New Task</h4>
          <form onSubmit={handleAddTask}>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input
                type="text"
                placeholder="Task Title (e.g. Clear carport)"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                disabled={addingTask}
                style={{ flex: 1, padding: "0.5rem" }}
              />
              <button type="submit" disabled={addingTask || !newTaskTitle.trim()}>
                {addingTask ? "Adding..." : "Add"}
              </button>
            </div>
            
            {job.tasks.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "gray", display: "block", marginBottom: "0.25rem" }}>
                  Depends on:
                </span>
                <div style={{ 
                  maxHeight: "100px", 
                  overflowY: "auto", 
                  border: "1px solid var(--border)", 
                  padding: "0.5rem", 
                  borderRadius: "4px", 
                  background: "white" 
                }}>
                  {job.tasks.map(t => (
                    <label key={t.id} style={{ display: "flex", alignItems: "center", marginBottom: "0.25rem", cursor: "pointer", fontSize: "0.85rem" }}>
                      <input
                        type="checkbox"
                        checked={dependsOnIds.includes(t.id)}
                        onChange={() => toggleDependency(t.id)}
                        disabled={addingTask}
                      />
                      <span style={{ marginLeft: "0.4rem" }}>{t.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {allTools?.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", color: "gray", display: "block", marginBottom: "0.25rem" }}>
                  Required Tools:
                </span>
                <div style={{ 
                  maxHeight: "100px", 
                  overflowY: "auto", 
                  border: "1px solid var(--border)", 
                  padding: "0.5rem", 
                  borderRadius: "4px", 
                  background: "white" 
                }}>
                  {allTools.map(tl => (
                    <label key={tl.id} style={{ display: "flex", alignItems: "center", marginBottom: "0.25rem", cursor: "pointer", fontSize: "0.85rem" }}>
                      <input
                        type="checkbox"
                        checked={requiredToolIds.includes(tl.id)}
                        onChange={() => toggleTool(tl.id)}
                        disabled={addingTask}
                      />
                      <span style={{ marginLeft: "0.4rem" }}>{tl.name} ({tl.status})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        {job.tasks.length === 0 ? <p>No tasks in this job.</p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {job.tasks.map(task => (
              <li key={task.id} style={{
                padding: "0.75rem",
                border: "1px solid var(--border)",
                marginBottom: "0.5rem",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: task.status === "done" ? "rgba(0,0,0,0.05)" : "transparent",
                opacity: task.status === "done" ? 0.7 : 1
              }}>
                <div>
                  <strong>{task.title}</strong>
                  <span style={{ 
                    marginLeft: "0.5rem", 
                    fontSize: "0.8em", 
                    color: task.board_state === "ready" ? "#4caf50" : (task.board_state === "blocked" ? "#ff9800" : "gray")
                  }}>
                    ({task.board_state})
                  </span>
                </div>
                {task.status !== "done" && (
                  <button 
                    disabled={task.board_state !== "ready" || submitting === task.id}
                    onClick={() => handleMarkDone(task.id)}
                  >
                    {submitting === task.id ? "..." : "Mark Done"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Tools</h2>
        {job.tools.length === 0 ? <p>No tools required.</p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {job.tools.map(tool => (
              <li key={tool.id} style={{ marginBottom: "0.25rem" }}>
                🔧 {tool.name} — <span style={{ color: tool.status === "available" ? "#4caf50" : "#f44336" }}>{tool.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Materials</h2>
        {job.materials.length === 0 ? <p>No materials required.</p> : (
          <>
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th>Material</th>
                  <th>Needed</th>
                  <th>On Hand</th>
                  <th>Shortfall</th>
                  <th>Receive Stock</th>
                </tr>
              </thead>
              <tbody>
                {job.materials.map(m => (
                  <tr key={m.material_id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.5rem 0" }}>{m.name}</td>
                    <td>{m.needed} {m.unit}</td>
                    <td>{m.on_hand} {m.unit}</td>
                    <td style={{ color: m.shortfall > 0 ? "#f44336" : "inherit", fontWeight: m.shortfall > 0 ? "bold" : "normal" }}>
                      {m.shortfall > 0 ? `${m.shortfall} ${m.unit}` : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <input
                          type="number"
                          placeholder="qty"
                          style={{ width: "60px", padding: "0.25rem" }}
                          value={receiveQtys[m.material_id] || ""}
                          onChange={(e) => setReceiveQtys(prev => ({ ...prev, [m.material_id]: e.target.value }))}
                        />
                        <button 
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                          onClick={() => handleReceive(m.material_id)}
                          disabled={!receiveQtys[m.material_id]}
                        >
                          Receive
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {job.status === "done" && (
              <div style={{ 
                padding: "1.5rem", 
                background: "var(--bg-muted)", 
                borderRadius: "8px",
                border: "2px solid var(--border)"
              }}>
                <h3>Job Reconciliation</h3>
                {job.reconciled ? (
                  <div style={{ color: "#4caf50", fontWeight: "bold" }}>
                    ✓ Materials reconciled for this job. Consumption has been logged.
                  </div>
                ) : (
                  <form onSubmit={handleReconcile}>
                    <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "1rem" }}>
                      Work is complete. Enter the amount of leftover material currently on hand 
                      to calculate final consumption (Required − Leftover).
                    </p>
                    <table style={{ width: "100%", marginBottom: "1rem" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Material</th>
                          <th style={{ textAlign: "left" }}>Leftover Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.materials.map(m => (
                          <tr key={m.material_id}>
                            <td>{m.name} ({m.unit})</td>
                            <td>
                              <input
                                type="number"
                                step="any"
                                placeholder="Enter leftover amount..."
                                style={{ padding: "0.4rem", width: "100%" }}
                                value={leftoverQtys[m.material_id] || ""}
                                onChange={(e) => setLeftoverQtys(prev => ({ ...prev, [m.material_id]: e.target.value }))}
                                disabled={reconciling}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button type="submit" disabled={reconciling} style={{ width: "100%", padding: "0.75rem" }}>
                      {reconciling ? "Reconciling..." : "Complete Reconciliation"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div style={{ marginTop: "2rem" }}>
        <Link to="/jobs">← Back to Jobs</Link>
      </div>
    </div>
  );
}
