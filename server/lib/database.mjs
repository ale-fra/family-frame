import { DatabaseSync } from "node:sqlite";

/**
 * Opens settings.sqlite with the options every store relies on. The server opens it once and passes the
 * connection to the settings, schedule and token stores; the token command line opens its own.
 * - WAL: readers do not block the writer (e.g. the token command line while the server runs).
 * - busy_timeout: wait instead of failing when another process holds the write lock.
 * - foreign_keys: per connection in SQLite; needed for ON DELETE CASCADE (routine exceptions).
 */
export function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000; PRAGMA foreign_keys = ON;");
  return db;
}
