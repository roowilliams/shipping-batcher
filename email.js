import { createRequire } from 'module'
const require = createRequire(import.meta.url)

require('dotenv').config()
const fs = require('fs')
const chalk = require('chalk')
const parse = require('csv-parse')
import config from './config.js'
// const api = new EasyPost(process.env.EASYPOST_API_KEY)

const Emailer = () => {
  var rows = []
  var currentRow = 0

  async function parseCSV(file) {
    var rows = []
    const reader = fs
      .createReadStream(file)
      .pipe(
        parse({ columns: true, trim: true }).on('data', (data) =>
          rows.push(data)
        )
      )

    return new Promise((resolve, reject) => {
      reader.on('end', () => resolve(rows)), reader.on('error', reject)
    })
  }

  function onComplete() {
    console.log('Process complete.')
  }

  async function updateRow() {
    currentRow++
    await processRow(currentRow)

    if (currentRow === rows.length - 1) return onComplete()
    return updateRow()
  }
  async function processRow(index) {
    return new Promise((resolve, reject) => {
      const row = rows[index]
      // do stuff
      let orderNumber = row['ORDER NUMBER']
      let quantity = row['QUANTITY']
      let email = row['CUSTOMER EMAIL']
      let trackingCode = row['TRACKING CODE']
      let trackingUrl = row['URL']

      setTimeout(() => resolve(console.log(row)), 2000)
    })
  }

  async function beginProcessing() {
    rows = await parseCSV('./output/processed.csv')
    await processRow(currentRow)

    updateRow()
  }

  return beginProcessing()
}

const emailer = Emailer()
