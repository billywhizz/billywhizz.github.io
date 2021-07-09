const config = {
  //deaths: 'time_series_covid19_deaths_global.csv',
  //cases: 'time_series_covid19_confirmed_global.csv'
  deaths: 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv',
  cases: 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv'
}

const data = {}
const begin = new Date('01/01/2020')
const stats = setupStats()

function daysBetween (start, end) {
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24))
}

function drawMap ({ cases, day }) {
  const opts = [{
    type: 'choropleth',
    locationmode: 'country names',
    locations: cases.map(c => c.region),
    z: cases.map(c => c.rate),
    text: cases.map(c => `${c.region} ${c.ma7} / ${c.ma14}`),
    colorscale: [
      ['0.0', 'green'],
      ['0.5', 'yellow'],
      ['1.0', 'red']
    ]
  }]
  const map = document.getElementById('map')
  const lat = map.layout ? map.layout.geo.center.lat : 45.16
  const lon = map.layout ? map.layout.geo.center.lon : 9.19
  const layout = {
    font: {
      family: 'monospace',
      size: 10
    },
    title: `7 Day / 14 Day MA For ${day}`,
    paper_bgcolor: '#f0f0f0',
    geo: {
      bgcolor: '#f0f0f0',
      showframe: false,
      showocean: true,
      oceancolor: '#d5f7f7',
      showlakes: true,
      lakecolor: '#d5f7f7',
      center: { lat, lon },
      projection: {
        type: 'winkel tripel',
        scale: map.layout ? map.layout.geo.projection.scale : 1
      }
    }
  }
  Plotly.newPlot('map', opts, layout, { showLink: false })
  let currentLocation = ''
  document.getElementById('map').on('plotly_click', function (data) {
    currentLocation = `row${data.points[0].location}`
  })
  document.getElementById('map').on('plotly_doubleclick', function (data) {
    location.hash = currentLocation
  })
}

function parseLine (line) {
  let inField = false
  const fields = []
  let off = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ',') {
      if (inField) continue
      fields.push(line.slice(off, i))
      off = i + 1
      continue
    }
    if (line[i] === '"') {
      if (inField) {
        inField = false
        continue
      }
      inField = true
    }
  }
  fields.push(line.slice(off))
  return fields
}

async function load (url) {
  const res = await fetch(url)
  const text = await res.text()
  const lines = text.split('\n').map(line => line.trim()).filter(line => line)
  const records = []
  const headers = parseLine(lines.shift())
  for (const line of lines) {
    const record = {}
    const fields = parseLine(line)
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].match(/\d{1,2}\/\d{1,2}\/\d{1,2}/)) {
        record[headers[i]] = parseInt(fields[i], 10)
        continue
      }
      if (headers[i] === 'Province/State') {
        record.province = fields[i].replace(/"/g, '')
        continue
      }
      if (headers[i] === 'Country/Region') {
        record.region = fields[i].replace(/"/g, '')
      }
    }
    records.push(record)
  }
  return records
}

function processData (cases) {
  const regions = {}
  for (const row of cases) {
    const { region, province } = row
    delete row.region
    delete row.province
    const dates = Object.keys(row)
    let result
    if (province) {
      if (['united kingdom', 'france', 'netherlands', 'denmark'].find(c => (c === region.toLowerCase()))) {
        result = regions[province] = { region: province, data: {} }
      } else {
        result = regions[region]
        if (!result) result = regions[region] = { region, data: {} }
      }
    } else {
      result = regions[region] = { region, data: {} }
    }
    for (const date of dates) {
      if (result.data[date]) {
        result.data[date] += row[date]
      } else {
        result.data[date] = row[date]
      }
    }
  }
  for (const key of Object.keys(regions)) {
    const region = regions[key]
    region.data = Object.keys(region.data).map(k => {
      const date = new Date(k)
      return { date, value: region.data[k] }
    }).sort((a, b) => {
      if (a.date < b.date) return -1
      if (a.date > b.date) return 1
      return 0
    })
    region.start = region.data[0].date
    region.data = region.data.map(v => v.value)
    const days = daysBetween(begin, region.start)
    const ma7 = []
    const ma14 = []
    for (let j = 0; j < days; j++) region.data.unshift(0)
    const data = []
    for (let j = 0; j < region.data.length; j++) {
      if (j > 0) {
        data[j] = Math.max(region.data[j] - region.data[j - 1], 0)
      } else {
        data[j] = Math.max(region.data[j], 0)
      }
      if (j > 7) {
        ma7[j] = stats.average(data.slice(j - 7, j))
      } else {
        ma7[j] = 0
      }
      if (j > 14) {
        ma14[j] = stats.average(data.slice(j - 14, j))
      } else {
        ma14[j] = 0
      }
    }
    region.data = data
    region.max = stats.max(data)
    region.ma7 = ma7
    region.ma14 = ma14
    if (ma14[ma14.length - 1] === 0 && ma14[ma14.length - 15] === 0) {
      region.rate = 0
    } else if (ma14[ma14.length - 1] === 0) {
      region.rate = 1
    } else if (ma14[ma14.length - 15] === 0) {
      region.rate = -1
    } else {
      region.rate = (ma14[ma14.length - 1] - ma14[ma14.length - 15]) / ma14[ma14.length - 15]
    }
  }
  cases = Object.keys(regions).map(k => regions[k])
  cases.sort((a, b) => {
    if (a.region > b.region) return 1
    if (a.region < b.region) return -1
    return 0
  })
  return cases
}

function getRates (cases, to = 1) {
  const result = { cases: [] }
  for (const region of cases) {
    const { ma7, ma14 } = region
    const rate = (ma7[to - 1] / ma14[to - 1]) || 0
    console.log(`${region.region}: ${ma7[to - 1]} / ${ma14[to - 1]} = ${rate}`)
    result.cases.push({ region: region.region, rate, ma7: ma7[to - 1], ma14: ma14[to - 1] })
  }
  result.day = (new Date(begin.getTime() + (to * 1000 * 60 * 60 * 24))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return result
}

function getGeo () {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(pos => {
      const { coords } = pos
      resolve(coords)
    }, reject, {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    })
  })
}

async function onLoad () {
  let cases = await load(config.cases)
  cases = processData(cases)
  let n = cases[0].data.length
  let paused = false
  let timer
  pause.onclick = () => {
    paused = true
  }
  resume.onclick = () => {
    paused = false
    if (!timer) {
      timer = setInterval(() => {
        if (paused) return
        n++
        drawMap(getRates(cases, n))
      }, 900)
    }
  }
  forward.onclick = () => {
    n++
    drawMap(getRates(cases, n))
  }
  back.onclick = () => {
    n--
    drawMap(getRates(cases, n))
  }
  drawMap(getRates(cases, n))
}
