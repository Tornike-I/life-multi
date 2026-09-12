import {
  accountExists,
  DATABASE_PATH,
  listAccounts,
  openDatabase,
  queueAdminAction,
} from "./db.ts";

const USAGE = "Usage: npm run admin -- list | free <accountId>";
const [command, argument] = process.argv.slice(2);
const db = openDatabase();

switch (command) {
  case "list":
    console.table(listAccounts(db));
    break;
  case "free": {
    const id = Number(argument);
    if (!Number.isInteger(id) || !accountExists(db, id)) {
      console.error(`No account with id ${argument}. ${USAGE}`);
      process.exitCode = 1;
      break;
    }
    queueAdminAction(db, "free", id);
    console.log(
      `Queued freeing the mat of account ${id} in ${DATABASE_PATH}; the server applies it within a few seconds.`,
    );
    break;
  }
  default:
    console.error(USAGE);
    process.exitCode = 1;
}

db.close();
