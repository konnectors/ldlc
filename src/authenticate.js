const loginUrl = 'https://secure.ldlc.com/Account/LoginPage.aspx?redir=/'

function authenticate(ctx) {
  ctx.debug('auth start')
  return requestLoginPage(ctx)
    .then(doLogin)
    .then(confirmAuthenticated)
}

function requestLoginPage(ctx) {
  return ctx.req({ url: loginUrl, ctx })
}

function doLogin(ctx) {
  const params = {
    __EVENTTARGET: 'ctl00$ctl00$cphMainContent$cphMainContent$butConnexion',
    ctl00$ctl00$cphMainContent$cphMainContent$txbMail: ctx.fields.login,
    ctl00$ctl00$cphMainContent$cphMainContent$txbPassword: ctx.fields.password
  }
  return ctx.req({
    url: loginUrl,
    page: ctx.page,
    params: params,
    ctx
  })
}

function confirmAuthenticated(ctx) {
  if (ctx.page('.pnlConnected').length == 0) {
    throw new Error(ctx.errors.LOGIN_FAILED)
  }
  ctx.debug('auth success')
  return ctx
}

module.exports = authenticate
