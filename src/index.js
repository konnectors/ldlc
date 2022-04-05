process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://4238f8379a724aa5961c17001877f67a@errors.cozycloud.cc/32'

const {
  BaseKonnector,
  requestFactory,
  log,
  cozyClient,
  solveCaptcha,
  errors
} = require('cozy-konnector-libs')
const jar = require('request').jar()
const cheerio = require('cheerio')

const models = cozyClient.new.models
const { Qualification } = models.document

const requestHTML = requestFactory({
  debug: false,
  cheerio: true,
  gzip: true,
  jar
})

const requestJSON = requestFactory({
  debug: false,
  json: true,
  gzip: true,
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
  log(
    'debug',
    ordersPeriods
      ? `Contains ${ordersPeriods.length} periods from parseBills`
      : `No ordersPeriods founded from parseBills`
  )
  log('info', 'Parsing list of bills')
  log('info', 'Fetching the list of documents')
  const bills = await getBills(ordersPeriods)
  log('info', 'Saving bills data to Cozy')
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
    url: `https://secure2.ldlc.com/fr-fr/Login/PartialCaptchaByIpOrEmail?email=${username}`
  })
  const $ = await requestHTML({
    url: 'https://secure2.ldlc.com/fr-fr/Login/Login?returnUrl=/fr-fr/Account',
    headers: { 'x-requested-with': 'XMLHttpRequest' }
  })
  const reqVerifToken = $('input[name="__RequestVerificationToken"]').attr(
    'value'
  )
  if (!reqVerifToken) {
    throw new Error(
      'There is no verification token, cannot connect the account'
    )
  }
  const gRecaptcha = await solveCaptcha({
    websiteKey: '6LdgbxgUAAAAAHvdiswvziUz_XecIWb1sWTW7pnz',
    websiteURL: 'https://www.ldlc.com/'
  })
  const resp = await requestJSON({
    url: 'https://secure2.ldlc.com/fr-fr/Login/Login?returnUrl=/fr-fr/Account',
    method: 'POST',
    formSelector: '#loginForm',
    form: {
      __RequestVerificationToken: `${reqVerifToken}`,
      Email: username,
      Password: password,
      LongAuthenticationDuration: false,
      'g-recaptcha-response': gRecaptcha
    }
  })
  if (resp.match(/href="\/fr-fr\/Account\/Logout/g)) {
    log('debug', 'Login successful, sending OK to cozy-libs')
    return reqVerifToken
  }
  if (resp.match(/<title>Connexion<\/title>/g)) {
    if (resp.match(/Identifiants incorrects/g)) {
      log('debug', 'Something went wrong with your credentials')
      throw new Error(errors.LOGIN_FAILED)
    } else {
      log('debug', 'Something went wrong with the website')
      throw new Error(errors.VENDOR_DOWN)
    }
  }
}

async function parseBills() {
  const getOrders = await requestJSON({
    url: 'https://secure2.ldlc.com/fr-fr/Orders/CompletedOrdersPeriodSelection',
    method: 'POST'
  })
  log('debug', 'First getOrders')
  log(
    'debug',
    getOrders
      ? `getOrders is ${getOrders.length} long and of type ${typeof getOrders}`
      : `No getOrders`
  )

  log('debug', 'Returning order list')
  return getOrders
}

async function getBills(ordersPeriods) {
  log(
    'debug',
    ordersPeriods
      ? `Contains ${ordersPeriods.length} periods`
      : `No ordersPeriods founded`
  )
  let bills = []
  let orders = []
  let ordersByYear = []
  for (let i = 0; i < ordersPeriods.length; i++) {
    log('debug', `Passing ${i} times in getBills loop`)
    const ordersByPeriod = await requestHTML({
      url: 'https://secure2.ldlc.com/fr-fr/Orders/PartialCompletedOrdersHeader',
      method: 'POST',
      form: {
        duration: ordersPeriods[i].duration,
        value: ordersPeriods[i].value
      }
    })
    const splitOrders = Array.from(ordersByPeriod('div[class="order"]'))
    for (const div of splitOrders) {
      const $div = ordersByPeriod(div).html()
      ordersByYear.push($div)
    }
  }

  for (let i = 0; i < ordersByYear.length; i++) {
    const $ = cheerio.load(ordersByYear[i])
    const orderHref = $('a[class="collapsed"]').attr('href')
    const getOrderDate = $('.cell-date').text()
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
  for (let i = 0; i < orders.length; i++) {
    let bill = {
      ...orders[i],
      vendor: VENDOR,
      currency: 'EUR',
      date: new Date(),
      requestOptions: {
        jar
      },
      fileAttributes: {
        metadata: {
          contentAuthor: 'ldlc.com',
          issueDate: new Date(),
          datetime: new Date(orders[i].orderDate),
          datetimeLabel: `issueDate`,
          carbonCopy: true,
          qualification: Qualification.getByLabel('other_invoice')
        }
      }
    }
    bills.push(bill)
  }
  return bills
}
