import Dexie from "dexie";

const db = new Dexie("holler");

db.version(1).stores({
  captures: "id",
  meta: "key",
});

db.version(2).stores({
  captures: "id",
  tasks: "id",
  meta: "key",
});

db.version(3).stores({
  captures: "id",
  tasks: "id",
  locations: "id",
  location_types: "id",
  meta: "key",
});

db.version(4).stores({
  captures: "id",
  tasks: "id, status, location",
  locations: "id",
  location_types: "id",
  goals: "id, parentId",
  taskGoals: "[taskId+goalId], *goalId",
  taskDependencies: "[taskId+dependsOnTaskId]",
  meta: "key",
});

export default db;
