process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://7a8db33ca68247a9a969b7574445dedc:36a3a4fc5ebb479bae1850b6913b305d@sentry.cozycloud.cc/46'

const { BaseKonnector, requestFactory, log } = require('cozy-konnector-libs')
const jar = require('request').jar()
const cheerio = require('cheerio')

const requestHTML = requestFactory({
  debug: false,
  cheerio: true,
  jar
})

const requestJSON = requestFactory({
  debug: false,
  json: true,
  jar
})

const VENDOR = 'ldlc.com'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')

  await authenticate.bind(this)(fields.login, fields.password)
  log('info', 'Successfully logged in')
  log('info', 'Fetching the list of bills')
  const ordersPeriods = await parseBills()
  log('info', 'Parsing list of bills')
  log('info', 'Fetching the list of documents')
  const bills = await getBills(ordersPeriods)
  log('info', 'Saving bills data to Cozy')
  log('debug', bills)
  await this.saveBills(bills, fields, {
    identifiers: ['ldlc.com'],
    fileIdAttribute: ['vendorRef'],
    sourceAccount: fields.login,
    sourceAccountIdentifier: fields.login,
    contentType: 'application/pdf'
  })
}

async function authenticate(username, password) {
  await requestHTML({
    url: 'https://www.ldlc.com/v4/fr-fr/form/login',
    headers: {
      'accept-encoding': 'gzip, deflate, br'
    }
  })
  await requestHTML({
    url: 'https://secure2.ldlc.com/fr-fr/Account',
    headers: {
      'accept-encoding': 'gzip, deflate, br'
    }
  })
  await requestHTML({
    url: 'https://secure2.ldlc.com/fr-fr/Login/Login?returnUrl=/fr-fr/Account',
    headers: {
      'accept-encoding': 'gzip, deflate, br'
    }
  })

  const $ = await requestHTML({
    url: 'https://secure2.ldlc.com/fr-fr/Login/Login?returnUrl=/fr-fr/Account',
    headers: { 'x-requested-with': 'XMLHttpRequest' }
  })
  const reqVerifToken = $('input[name="__RequestVerificationToken"]').attr(
    'value'
  )

  await requestJSON({
    url: 'https://secure2.ldlc.com/fr-fr/Login/Login?returnUrl=/fr-fr/Account',
    method: 'POST',
    formSelector: '#loginForm',
    form: {
      __RequestVerificationToken: `${reqVerifToken}`,
      Email: username,
      Password: password,
      LongAuthenticationDuration: false
    }
  })
    .catch(err => {
      log('err', err)
    })
    .then(resp => {
      return resp
    })
}

async function parseBills() {
  const getOrders = await requestJSON({
    url: 'https://secure2.ldlc.com/fr-fr/Orders/CompletedOrdersPeriodSelection',
    method: 'POST'
  })
  return getOrders
}

async function getBills(ordersPeriods) {
  log('debug', ordersPeriods)
  let bills = []
  let orders = []
  let ordersByYear = []
  for (let i = 0; i < ordersPeriods.length; i++) {
    const ordersByPeriod = await requestHTML({
      url: 'https://secure2.ldlc.com/fr-fr/Orders/PartialCompletedOrdersHeader',
      method: 'POST',
      form: {
        Duration: ordersPeriods[i].Duration,
        Value: ordersPeriods[i].Value
      }
    })
    log('debug', ordersByPeriod.html())
    const splitOrders = Array.from(ordersByPeriod('div[class="order"]'))
    log('debug', splitOrders)
    for (const div of splitOrders) {
      const $div = ordersByPeriod(div).html()
      ordersByYear.push($div)
    }
    log('debug', ordersByYear)
  }

  for (let i = 0; i < ordersByYear.length; i++) {
    const $ = cheerio.load(ordersByYear[i])
    const orderHref = $('a[class="collapsed"]').attr('href')
    log('debug', orderHref)
    const getOrderDate = $('.cell-date').text()
    log('debug', getOrderDate)
    // Here we split the Date to get the right date format
    const splitOrderDate = getOrderDate.split('/')
    const orderDay = splitOrderDate[0]
    const orderMonth = splitOrderDate[1]
    const orderYear = splitOrderDate[2]
    // Now date is formatted to YYYY-MM-DD
    const orderDate = `${orderYear}-${orderMonth}-${orderDay}`
    const getVendorRef = $('.cell-nb-order')
    const vendorRef = getVendorRef
      .html()
      .split(' ')[1]
      .match(/([0-9]*[A-Z]{1,2})/g)
    log('debug', vendorRef)
    const getPrice = $('.cell-value')
    const trimPrice = getPrice.html().replace(' ', '')
    const numbers = trimPrice.match(/\d+/g)
    const stringedAmount = `${numbers[0]}.${numbers[1]}`
    const amount = parseFloat(stringedAmount)

    const order = {
      filename: `${orderDate}_ldlc.pdf`,
      fileurl: `https://secure2.ldlc.com/fr-fr/Orders/DownloadOrderInvoice${
        orderHref.split('PartialCompletedOrderContent')[1].split('#')[0]
      }`,
      amount,
      vendorRef: vendorRef[0],
      orderDate
    }
    orders.push(order)
  }
  log('debug', orders)
  for (let i = 0; i < orders.length; i++) {
    let bill = {
      ...orders[i],
      vendor: VENDOR,
      currency: 'EUR',
      date: new Date(),
      requestOptions: {
        method: 'GET',
        jar
      },
      fileAttributes: {
        contentAuthor: 'ldlc.com',
        datetime: new Date(orders[i].orderDate),
        datetimeLabel: 'issueDate'
      }
    }
    bills.push(bill)
  }
  return bills
}
