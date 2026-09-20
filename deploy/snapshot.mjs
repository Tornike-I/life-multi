import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  throw new Error("usage: snapshot.mjs <database> <target>");
}

// VACUUM INTO rather than a file copy, so the snapshot also holds whatever the
// running server has left in the write-ahead log.
const db = new DatabaseSync(source, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
} finally {
  db.close();
}
