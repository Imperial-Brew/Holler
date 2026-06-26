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

export default db;
