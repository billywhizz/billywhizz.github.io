import init, { compressGzip, decompressGzip } from "./wasm_gzip.js"

function fileName (path) {
  return path.slice(path.lastIndexOf('/') + 1)
}

function formatSize (value) {
  if (value > (1024 * 1024)) return `${Math.floor(value / (1024 * 1024))}M`
  if (value > 1024) return `${Math.floor(value / 1024)}K`
  return Math.floor(value)
}

async function main () {
  init()
  function displayWal (wal) {
    const { pageSize, checkpointSequence, counter, mxFrame, nPage, backfill, backfillAttempt, stats } = wal
    const dbSize = nPage * pageSize
    document.getElementById('walInfo').innerHTML = `
<table class="walInfo">
<tr>
<td class="header">pageSize</td><td align="right">${pageSize}</td>
</tr>
<tr>
<td class="header">checkpointSequence</td><td align="right">${checkpointSequence}</td>
</tr>
<tr>
<td class="header">txn counter</td><td align="right">${counter}</td>
</tr>
<tr>
<td class="header">frames</td><td align="right">${mxFrame}</td>
</tr>
<tr>
<td class="header">wal size</td><td align="right">${mxFrame * pageSize}</td>
</tr>
<tr>
<td class="header">db pages</td><td align="right">${nPage}</td>
</tr>
<tr>
<td class="header">db size</td><td align="right">${formatSize(dbSize)}</td>
</tr>
<tr>
<td class="header">backfill</td><td align="right">${backfill}</td>
</tr>
<tr>
<td class="header">backfillAttempt</td><td align="right">${backfillAttempt}</td>
</tr>
<tr>
<td class="header">recv</td><td align="right">${stats.recv}</td>
</tr>
</table>
    `
  }

  function showError (message) {
    const status = document.getElementById('statusError')
    status.innerText = message
    status.style.display = 'block'
  }

  class Database {
    constructor () {
      this.worker = new Worker('worker.js')
      this.queue = []
      this.worker.onmessage = e => {
        if (e.data.errorMessage) {
          showError(e.data.errorMessage)
          return
        }
        this.queue.shift()(e.data)
      }
      this.worker.onerror = err => {
        console.error(err.stack)
      }
    }
    open (fileName) {
      const p = new Promise(resolve => this.queue.push(resolve))
      this.worker.postMessage({ open: fileName })
      this.fileName = fileName
      return p
    }
    exec (sql) {
      const p = new Promise(resolve => this.queue.push(resolve))
      this.worker.postMessage({ sql, db: this.fileName })
      return p
    }
    checkpoint (name = 'main', wal) {
      const p = new Promise(resolve => this.queue.push(resolve))
      this.worker.postMessage({ checkpoint: true, db: this.fileName, name, wal })
      return p
    }
    serialize (name = 'main') {
      const p = new Promise(resolve => this.queue.push(resolve))
      this.worker.postMessage({ name, serialize: true, db: this.fileName })
      return p
    }
    status () {
      const p = new Promise(resolve => this.queue.push(resolve))
      this.worker.postMessage({ status: true, db: this.fileName })
      return p
    }
  }

  let dbName = 'blank.db'
  const url = new URL(window.location.href)
  if (url.hash) {
    dbName = url.hash.slice(1)
  }
  const db = new Database()
  await db.open(dbName)

  const editor = window.ace.edit('editor')
  editor.setTheme('ace/theme/monokai')
  editor.session.setMode('ace/mode/sql')
  editor.setValue("pragma table_list")
  editor.setOptions({
    fontFamily: 'monospace',
    fontSize: '10pt',
    tabSize: 2,
    useSoftTabs: true
  })
  window.editor = editor

  const fileSelector = document.getElementById('file-selector')
  fileSelector.addEventListener('change', (event) => {
    const fileList = event.target.files
    const reader = new FileReader()
    reader.addEventListener('load', async (event) => {
      let buf = event.target.result
      if (file.name.indexOf('.gz') > -1) {
        const decompressed = decompressGzip(new Uint8Array(buf))
        buf = decompressed.buffer
      }
      const result = await db.checkpoint('main', buf)
      const { rc, logSize, framesCheckpointed } = result
      console.log(`checkpoint ${rc} logSize ${logSize} frames ${framesCheckpointed}`)
    })
    const file = fileList[0]
    reader.readAsArrayBuffer(file)
    fileSelector.value = null
  })

  const status = document.getElementById('statusTime')
  async function runQuery () {
    document.getElementById('statusError').style.display = 'none'
    const results = document.getElementById('results')
    results.innerText = ''
    const sql = editor.getSelectedText() || editor.getValue()
    const { rows, time } = await db.exec(sql)
    results.innerText = JSON.stringify(rows, null, '  ')
    status.innerText = `${rows.length} rows in ${time} ms`
  }
  document.body.addEventListener('keydown', async event => {
    if (event.key === 'e' && event.ctrlKey) {
      event.preventDefault()
      await runQuery()
      return
    }
    if (event.key === 'h' && event.ctrlKey) {
      event.preventDefault()
      const { logSize, framesCheckpointed, checkpoint } = await db.checkpoint()
      displayWal(checkpoint.wal)
      console.log(`checkpoint logSize ${logSize} frames ${framesCheckpointed}`)
      const compressed = compressGzip(new Uint8Array(checkpoint.wal.delta))
      console.log(`before ${checkpoint.wal.delta.byteLength} after ${compressed.length}`)
      return
    }
    if (event.key === 's' && event.ctrlKey) {
      event.preventDefault()
      const result = await db.serialize()
      const link = document.createElement('a')
      const blob = new Blob([result.db], { type: 'application.octet-stream' } )
      const objectURL = URL.createObjectURL(blob)
      link.href = objectURL
      link.href = URL.createObjectURL(blob)
      link.download = fileName(dbName)
      link.click()
      return
    }
    if (event.key === 'i' && event.ctrlKey) {
      event.preventDefault()
      const result = await db.status()
      console.log(JSON.stringify(result))
      return
    }
    if (event.key === 'j' && event.ctrlKey) {
      event.preventDefault()
      const { checkpoint } = await db.checkpoint()
      const compressed = compressGzip(new Uint8Array(checkpoint.wal.delta))
      const link = document.createElement('a')
      const blob = new Blob([compressed], { type: 'application.octet-stream' } )
      const objectURL = URL.createObjectURL(blob)
      link.href = objectURL
      link.href = URL.createObjectURL(blob)
      link.download = `${fileName(dbName)}-wal.gz`
      link.click()
      return
    }
  })
  runQuery()
  document.getElementById('editor').style.display = 'block'
  delete editor.commands.commandKeyBinding['ctrl-e']
  delete editor.commands.commandKeyBinding['ctrl-i']
  delete editor.commands.commandKeyBinding['ctrl-j']
  delete editor.commands.commandKeyBinding['ctrl-h']
  delete editor.commands.commandKeyBinding['ctrl-s']
  document.getElementsByTagName("html")[0].style.visibility = 'visible'
}
window.onload = () => main().catch(err => console.error(err.stack))

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log('This page was restored from the bfcache.')
  } else {
    console.log('This page was loaded normally.')
  }
})

window.addEventListener('pagehide', (event) => {
  console.log('page is being hidden')
})