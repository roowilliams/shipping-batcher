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
