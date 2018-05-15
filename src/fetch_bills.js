// Bluebird is here to manage the Promise concurrency
// see https://github.com/request/request-promise/issues/133
const Promise = require('bluebird')
// We use two encapsulated Promise.map
// so 3x3 requests at the same time
const concurrency = 3

const listingUrl = 'https://secure.ldlc.com/Account/CommandListingPage.aspx'

const fetchBillData = require('./fetch_bill.js')

module.exports = function(ctx) {
  return requestListingPage(ctx)
    .then(listYears)
    .then(fetchBillsPerYear)
  //.then(storeBills)
}

function requestListingPage(ctx) {
  return ctx.req({ url: listingUrl, ctx })
}

function listYears(ctx) {
  const years = ctx
    .page('#ctl00_ctl00_cphMainContent_cphMainContent_ddlDate')
    .children('option')
    .map((i, option) => ctx.page(option).val())
    .get()
    .filter(year => year.match(/^\d{4}$/))
    .map(year => parseInt(year))
  return { ...ctx, years }
}

function fetchBillsPerYear(ctx) {
  const flattenBills = arr => ({
    ...ctx,
    bills: [].concat(...arr.map(foryear => foryear.bills))
  })
  return Promise.map(
    ctx.years,
    year => fetchBillsForYear({ ...ctx, year: year }),
    { concurrency }
  ).then(flattenBills)
}

function fetchBillsForYear(ctx) {
  return requestYearPage(ctx)
    .then(listBillsKeysForYear)
    .then(fetchBillsByKeys)
}

function requestYearPage(ctx) {
  const params = {
    __EVENTTARGET: 'ctl00$ctl00$cphMainContent$cphMainContent$ddlDate',
    ctl00$ctl00$cphMainContent$cphMainContent$ddlDate: ctx.year.toString()
  }
  return ctx.req({
    url: listingUrl,
    page: ctx.page,
    params: params,
    xhr: 'ctl00_ctl00_cphMainContent_cphMainContent_upListing',
    ctx: { ...ctx, form: ctx.page }
  })
}

function listBillsKeysForYear(ctx) {
  const table = ctx.page('#TopListing')
  const billsKeys = table
    .find('tr > td[class=right] > a[id*=_lbDetail]')
    .map((idx, link) =>
      table
        .find(link)
        .attr('id')
        .replace(/_/g, '$')
    )
    .get()
  ctx.debug(`year=${ctx.year} bills=${billsKeys.length})`)
  return { ...ctx, billsKeys }
}

function fetchBillsByKeys(ctx) {
  const flattenBills = arr => ({
    ...ctx,
    bills: arr.map(forkey => forkey.bill)
  })
  return Promise.map(ctx.billsKeys, billKey => fetchBill({ ...ctx, billKey }), {
    concurrency
  }).then(flattenBills)
}

function fetchBill(ctx) {
  return requestBillPage(ctx)
    .then(fetchBillData)
    .then(saveBill)
}

function requestBillPage(ctx) {
  const params = {
    __EVENTTARGET: ctx.billKey,
    ctl00$ctl00$actScriptManager:
      'ctl00$ctl00$cphMainContent$cphMainContent$upListing|' + ctx.billKey,
    ctl00$ctl00$cphMainContent$cphMainContent$ddlDate: ctx.year.toString()
  }
  return ctx.req({
    url: listingUrl,
    page: ctx.form,
    params: params,
    xhr: 'ctl00_ctl00_cphMainContent_cphMainContent_upListing',
    ctx: ctx
  })
}

function saveBill(ctx) {
  const date = ctx.bill.date
  const pdf = {
    filename: ctx.bill.pdf && ctx.bill.pdf.filename,
    fileurl: ctx.bill.pdf && ctx.bill.pdf.url,
    requestOptions: {
      jar: ctx.jar
    }
  }
  const bill = {
    date: new Date(Date.UTC(date.year, date.month - 1, date.day)),
    amount: ctx.bill.totalPrice.asFloat,
    vendor: 'LDLC',
    orderId: ctx.bill.orderId,
    ...(ctx.bill.pdf ? pdf : {})
  }
  const options = {
    keys: ['vendor', 'orderId'],
    identifiers: ['ldlc']
  }
  ctx.saveBills([bill], ctx.fields, options)
  return ctx
}
