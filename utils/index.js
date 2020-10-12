import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const fs = require('fs')

export function transformAddress(order) {
  const address = {}
  if (order['Ship to']) address.name = order['Ship to']
  if (order['Shipping address']) address.street1 = order['Shipping address']
  if (order['Shipping address 2']) address.street2 = order['Shipping address 2']
  if (order['Shipping address city'])
    address.city = order['Shipping address city']
  if (order['Shipping address province/state'])
    address.state = order['Shipping address province/state']
  if (order['Shipping address postal code'])
    address.zip = order['Shipping address postal code']
  if (order['Shipping address country'])
    address.country = order['Shipping address country']
  return address
}

export function savePdfToFile(pdf, fileName) {
  return new Promise((resolve, reject) => {
    // To determine when the PDF has finished being written successfully
    // we need to confirm the following 2 conditions:
    //
    //   1. The write stream has been closed
    //   2. PDFDocument.end() was called syncronously without an error being thrown

    let pendingStepCount = 2

    const stepFinished = () => {
      if (--pendingStepCount == 0) {
        resolve()
      }
    }

    const writeStream = fs.createWriteStream(fileName)
    writeStream.on('close', stepFinished)
    pdf.pipe(writeStream)

    pdf.end()

    stepFinished()
  })
}
