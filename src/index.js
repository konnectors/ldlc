process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://7a8db33ca68247a9a969b7574445dedc:36a3a4fc5ebb479bae1850b6913b305d@sentry.cozycloud.cc/46'

const {
  BaseKonnector,
  errors,
  saveFiles,
  saveBills,
  log,
  requestFactory
} = require('cozy-konnector-libs')

const req = require('./ldlc_request.js')

const authenticate = require('./authenticate.js')
const fetchBills = require('./fetch_bills.js')

function start(fields) {
  const accountData = this.getAccountData()
  const jar = requestFactory().jar()
  const cozyRequest = requestFactory({ cheerio: false, jar: jar })
  const konnector = this
  const debug = function(msg, grp) {
    log('debug', msg, `LDLC ${fields.login} ${grp || ''}`)
  }
  const ctx = {
    fields,
    req,
    log,
    saveFiles,
    saveBills,
    errors,
    jar,
    debug,
    accountData,
    konnector,
    cozyRequest
  }
  return (
    authenticate(ctx)
      .then(() =>
        Promise.all([
          fetchBills(ctx)
          //fetchAllAddresses(ctx),
          //fetchAllFavorites(ctx),
          //fetchAllPriceAlerts(ctx),
          //fetchAllAvailabilitiesAlerts(ctx),
          //fetchAllWaitingBaskets(ctx),
          //fetchIdentity(ctx),
        ])
      )
      .then(arr => ({ ...ctx, data: { bills: arr[0].bills } }))
      //.then(saveAccountData)
      .then(() => debug('end of connector!'))
  )
}

// eslint-disable-next-line
function saveAccountData(ctx) {
  // ctx.debug(ctx.data, "saving new account data");
  ctx.konnector.saveAccountData(ctx.data, { merge: false })
  return ctx
}

module.exports = new BaseKonnector(start)
