require('dotenv').config()

const config = require('./config')
const EasyPost = require('@easypost/api')
const api = new EasyPost(process.env.EASYPOST_API_KEY)
const download = require('image-downloader')
const PDFDocument = require('pdfkit')
const fs = require('fs')

const doc = new PDFDocument({ autoFirstPage: false })

const invoiceNumber = 'EB1001'

// set addresses
const fromAddress = new api.Address(config.fromAddress)

const toAddress = new api.Address({
  name: 'Dr. Steve Brule',
  street1: '179 N Harbor Dr',
  city: 'Redondo Beach',
  state: 'CA',
  zip: '90277',
  country: 'US',
  phone: '310-808-5243'
})

// set parcel
const parcel = new api.Parcel({
  length: 12.5,
  width: 9.5,
  height: 0.5,
  weight: 10.0
})

const shipment = new api.Shipment({
  to_address: toAddress,
  from_address: fromAddress,
  parcel: parcel,
  options: {
    special_rates_eligibility: 'USPS.MEDIAMAIL'
  }
})

shipment
  .save()
  .then(
    (shipment) => shipment.buy(shipment.lowestRate())
    // const mediaMailRate = data.rates.find(
    //   (rate) => rate.service === 'MediaMail'
    // )
    // console.log(mediaMailRate)
    // return mediaMailRate.id
  )
  .then((result) => {
    console.log(result)
    return result.postage_label.label_url
  })
  .then((labelUrl) =>
    download.image({ url: labelUrl, dest: `./labels/${invoiceNumber}.png` })
  )
  .then(({ filename }) => {
    console.log('Saved to', filename) // saved to /path/to/dest/photo.jpg

    doc.pipe(fs.createWriteStream('./labels/all-labels.pdf'))
    doc.addPage({ size: [4 * 72, 6 * 72], margin: 0 }).image(filename, {
      fit: [4 * 72, 6 * 72],
      align: 'center',
      valign: 'center'
    })
    doc.addPage({ size: [4 * 72, 6 * 72], margin: 0 }).image(filename, {
      fit: [4 * 72, 6 * 72],
      align: 'center',
      valign: 'center'
    })

    doc.end()
  })
  .catch((error) => console.log(error))
