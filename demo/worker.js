onmessage = e => {
  const start = Date.now()
  const rows = db.exec(e.data)
  console.log(Date.now() - start)
  postMessage(rows)
}

let db

async function init () {
  importScripts('dist/sqlite3.js')
  await sqlite3.load(file => `dist/sqlite3.wasm`)
  db = new sqlite3.open('clock.db')
  db.exec = sql => {
    const stmt = db.prepare(sql)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.get())
    }
    return rows
  }
  db.exec('PRAGMA synchronous = off')
  db.exec('PRAGMA temp_store = memory')
  db.exec('PRAGMA wal_autocheckpoint=0')
  db.exec('PRAGMA locking_mode = exclusive')
  db.exec('PRAGMA busy_timeout = 100')
  db.exec('PRAGMA read_uncommitted = true')
}

init().catch(err => console.error(err.stack))
