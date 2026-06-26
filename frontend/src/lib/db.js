import Dexie from "dexie";

const db = new Dexie("holler");

db.version(1).stores({
  captures: "id",
  meta: "key",
});

export default db;
