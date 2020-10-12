import { createRequire } from 'module'
const require = createRequire(import.meta.url)

require('dotenv').config()

import config from './config.js'
const EasyPost = require('@easypost/api')
const api = new EasyPost(process.env.EASYPOST_API_KEY)
const pressAnyKey = require('press-any-key')
const download = require('image-downloader')
const PDFDocument = require('pdfkit')
const parse = require('csv-parse')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const fs = require('fs')
const chalk = require('chalk')
import { transformAddress, savePdfToFile } from './utils/index.js'

const processedWriter = createCsvWriter({
  path: './output/processed.csv',
  //   append: true,
  header: [
    { id: 'order', title: 'ORDER NUMBER' },
    { id: 'quantity', title: 'QUANTITY' },
    { id: 'email', title: 'CUSTOMER EMAIL' },
    { id: 'trackingCode', title: 'TRACKING CODE' },
    { id: 'trackingUrl', title: 'URL' },
    { id: 'shippingService', title: 'SHIPPING SERVICE' },
    { id: 'shippingCost', title: 'SHIPPING COST' }
  ]
})

const unprocessedWriter = createCsvWriter({
  path: './output/unprocessed.csv',
  //   append: true,
  header: [
    { id: 'invoiceNumber', title: 'Invoice number' },
    { id: 'quantity', title: 'Quantity' },
    { id: 'customerName', title: 'Customer name' },
    { id: 'customerEmail', title: 'Customer email' },
    { id: 'orderStatus', title: 'Order status' },
    { id: 'shipToName', title: 'Ship to' },
    { id: 'street1', title: 'Shipping address' },
    { id: 'street2', title: 'Shipping address 2' },
    { id: 'city', title: 'Shipping address city' },
    { id: 'state', title: 'Shipping address province/state' },
    { id: 'zip', title: 'Shipping address postal code' },
    { id: 'country', title: 'Shipping address country' },
    { id: 'refundAmount', title: 'Refunds amount' },
    { id: 'error', title: 'Error' }
  ]
})

var currentIndex = 0
var rows = []
var doc = null

var currentBatch = 0
var labelsGenerated = 0
const batchAmount = 2
var writeStream = null

// take a csv of orders, generate a printable pdf of shipping labels
// and export a csv of email addresses, names and tracking numbers

async function parseCSV(file) {
  var rows = []
  const reader = fs
    .createReadStream(file)
    .pipe(
      parse({ columns: true, trim: true }).on('data', (data) => rows.push(data))
    )

  return new Promise((resolve, reject) => {
    reader.on('end', () => resolve(rows)), reader.on('error', reject)
  })
}

function updateBatch() {
  console.log('Saving batch pdf...')

  return savePdfToFile(doc, `./labels/labels-${currentBatch}.pdf`).then(() => {
    console.log('Saved')
    doc = new PDFDocument({ autoFirstPage: false })
    console.log('Created new doc')
    currentBatch++
  })
}

function onComplete(index) {
  console.log(`Processing ${index} orders complete.`)
  savePdfToFile(doc)
}

function checkProgress(currentIndex, skipDelay) {
  setTimeout(
    () => {
      if (currentIndex > 0 && labelsGenerated % batchAmount === 0) {
        updateBatch().then(() => {
          currentIndex++

          setTimeout(() => processRow(currentIndex), 3000)
        })
      } else {
        currentIndex++
        processRow(currentIndex)
      }
    },
    skipDelay ? 0 : 6000
  )
}

function filterOrder(row) {
  if (
    row['Shipping address country'] !== 'US' ||
    row['Order status'] !== 'Processed' ||
    row['Refunds amount'] !== '0.00'
  )
    return false

  return row
}

// return addressID
function verifyAddress(row) {
  const toAddress = new api.Address({
    verify: ['delivery'],
    ...transformAddress(row)
  })
  return toAddress
    .save()
    .then((result) => result)
    .catch(console.log)
}

async function processRow(index) {
  const row = rows[index]
  const order = filterOrder(row)
  var skipDelay = false
  if (order) {
    const orderNumber = order['Invoice number']
    console.log(orderNumber + ': verifying delivery address...')
    await verifyAddress(row).then((result) => {
      if (!result.verifications.delivery.success) {
        console.log(
          chalk.red(JSON.stringify(result.verifications.delivery.errors))
        )
        console.log(
          chalk.red('Address verification failed, skipping ', orderNumber)
        )
        unprocessedWriter.writeRecords([
          {
            invoiceNumber: order['Invoice number'],
            quantity: order['Quantity'],
            customerName: order['Customer name'],
            customerEmail: order['Customer email'],
            orderStatus: order['Order status'],
            shipToName: order['Ship to'],
            street1: order['Shipping address'],
            street2: order['Shipping address 2'],
            city: order['Shipping address city'],
            state: order['Shipping address province/state'],
            zip: order['Shipping address postal code'],
            country: order['Shipping address country'],
            refundAmount: order['Refunds amount'],
            error: JSON.stringify(result.verifications.delivery.errors)
          }
        ])
        skipDelay = true
      } else {
        console.log(orderNumber + ': success\n')
        processOrder(order, result.id)
      }
    })
  } else {
    console.log(
      `Skipping ${row['Shipping address country']} order ${row['Invoice number']} placed by ${row['Customer name']} <${row['Customer email']}> with order status: ${row['Order status']}.`
    )
    skipDelay = true
  }
  if (index === rows.length - 1) {
    return onComplete(index)
  }
  checkProgress(index, skipDelay)
}

function processOrder(order, addressId) {
  // calculate correct shipping rate
  var baseItem = config.parcel
  const orderQuantity = parseInt(order['Quantity'])

  const tempParcel = {
    ...baseItem,
    height: baseItem.height * orderQuantity,
    weight: baseItem.weight * orderQuantity
  }

  const parcel = new api.Parcel(tempParcel)

  // set up addresses
  const fromAddress = new api.Address(config.fromAddress)
  const customerEmail = order['Customer email']
  const orderNumber = order['Invoice number']

  const shipment = new api.Shipment({
    to_address: addressId,
    from_address: fromAddress,
    parcel: parcel,
    invoice_number: orderNumber,
    options: {
      special_rates_eligibility: 'USPS.MEDIAMAIL'
    }
  })

  shipment
    .save()
    .then((shipment) => {
      console.log('Parcel weight:', tempParcel.weight)
      console.log(
        `Lowest rate using ${shipment.lowestRate().service} is ${
          shipment.lowestRate().rate
        } ${shipment.lowestRate().currency}`
      )
      return shipment.buy(shipment.lowestRate())
    })
    .then((result) => {
      return {
        orderNumber: orderNumber,
        quantity: orderQuantity,
        customerEmail: customerEmail,
        tracking: {
          code: result.tracker.tracking_code,
          url: result.tracker.public_url
        },
        service: {
          type: result.selected_rate.service,
          rate: result.selected_rate.rate
        },
        labelUrl: result.postage_label.label_url
      }
    })
    .then((shipment) => {
      labelsGenerated++
      addLabelToPdf(orderNumber, shipment.labelUrl)
      return shipment
    })
    .then((shipment) => {
      processedWriter.writeRecords([
        {
          order: shipment.orderNumber,
          quantity: shipment.quantity,
          email: shipment.customerEmail,
          trackingCode: shipment.tracking.code,
          trackingUrl: shipment.tracking.url,
          shippingService: shipment.service.type,
          shippingCost: shipment.service.rate
        }
      ])
    })
    .catch((error) => console.log(error))
}

function addLabelToPdf(orderNumber, labelUrl) {
  download
    .image({ url: labelUrl, dest: `./labels/source/${orderNumber}.png` })
    .then(({ filename }) => {
      console.log('Label saved to', filename)
      doc.addPage({ size: [4 * 72, 6 * 72], margin: 0 }).image(filename, {
        fit: [4 * 72, 6 * 72],
        align: 'center',
        valign: 'center'
      })
    })
    .catch((error) => console.log(error))
}

async function beginProcessing() {
  rows = await parseCSV('./orders.csv')
  doc = new PDFDocument({ autoFirstPage: false })
  processRow(currentIndex)
}

beginProcessing()
