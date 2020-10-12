import { createRequire } from 'module'
const require = createRequire(import.meta.url)

require('dotenv').config()

import config from './config.js'
const EasyPost = require('@easypost/api')
const api = new EasyPost(process.env.EASYPOST_API_KEY)
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
const batchAmount = config.batchAmount

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
  process.stdout.write('Saving batch pdf... ')

  return savePdfToFile(doc, `./labels/labels-${currentBatch}.pdf`).then(() => {
    console.log('saved')
    doc = new PDFDocument({ autoFirstPage: false })
    currentBatch++
    console.log(chalk.yellow(`\n--- Batch ${currentBatch} ---`))
  })
}

function onComplete(index) {
  console.log(`Processing ${index} orders complete.`)
  savePdfToFile(doc)
}

function checkProgress(currentIndex, skipDelay) {
  if (currentIndex === rows.length - 1) {
    return onComplete(index)
  }

  return setTimeout(
    () => {
      if (
        !skipDelay &&
        currentIndex > 0 &&
        labelsGenerated % batchAmount === 0
      ) {
        return updateBatch().then(() => {
          currentIndex++
          return processRow(currentIndex)
        })
      } else {
        currentIndex++
        return processRow(currentIndex)
      }
    },
    skipDelay ? 0 : 5000
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

function onAddressError(order, errors) {
  console.log(
    chalk.red(
      '❓ Address verification failed, skipping ',
      order['Invoice number']
    )
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
      error: JSON.stringify(errors)
    }
  ])
}

async function processRow(index) {
  const row = rows[index]
  const order = filterOrder(row)

  if (order) {
    const orderNumber = order['Invoice number']
    console.log(chalk.green(`\n--- ${orderNumber} ---`))
    process.stdout.write(`🏠 Verifying delivery address for ${orderNumber}... `)
    const result = await verifyAddress(row)

    if (!result.verifications.delivery.success) {
      return onAddressError(order, result.verifications.delivery.errors)
    }

    console.log('✅')
    await processOrder(order, result.id)
    return checkProgress(index, false)
  }

  console.log(
    chalk.gray(
      `Skipping Non-US order (${row['Shipping address country']}) ${row['Invoice number']} placed by ${row['Customer name']} <${row['Customer email']}>.`
    )
  )
  return checkProgress(index, true)
}

async function processOrder(order, addressId) {
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

  return shipment
    .save()
    .then((shipment) => {
      console.log(
        `📦 Lowest rate for parcel weighing ${tempParcel.weight}oz using ${
          shipment.lowestRate().service
        } is ${shipment.lowestRate().rate} ${shipment.lowestRate().currency}`
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
      return addLabelToPdf(orderNumber, shipment.labelUrl).then(() => {
        labelsGenerated++
        return shipment
      })
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
  return download
    .image({ url: labelUrl, dest: `./labels/source/${orderNumber}.png` })
    .then(({ filename }) => {
      console.log(`⬇️  Label saved to ${filename}.\n`)
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
