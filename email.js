import { createRequire } from 'module'
const require = createRequire(import.meta.url)

require('dotenv').config()
const fs = require('fs')
const chalk = require('chalk')
const parse = require('csv-parse')
const mailgun = require('mailgun-js')({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN
})
import config from './config.js'

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

  function sendMail(order) {
    var data = {
      from: 'EAT BITTER <hello@eatbitter.co>',
      to: order.email,
      subject: 'Shipping Update',
      text: 'Testing some Mailgun awesomness!',
      template: 'eb_shipping_update', //Instead of 'html'
      'v:trackingCode': order.trackingCode,
      'v:trackingUrl': order.trackingUrl
    }
    return new Promise((resolve, reject) =>
      mailgun.messages().send(data, function (error, body) {
        if (error) reject(error)
        setTimeout(() => resolve(body), 3000)
      })
    )
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
    const row = rows[index]
    // do stuff
    let orderNumber = row['ORDER NUMBER']
    let quantity = row['QUANTITY']
    let email = row['CUSTOMER EMAIL']
    let trackingCode = row['TRACKING CODE']
    let trackingUrl = row['URL']
    const order = { orderNumber, quantity, email, trackingCode, trackingUrl }
    return sendMail(order).then(console.log)
  }

  async function beginProcessing() {
    rows = await parseCSV('./output/processed.csv')
    await processRow(currentRow)

    updateRow()
  }

  return beginProcessing()
}

const emailer = Emailer()
