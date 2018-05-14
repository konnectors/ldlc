const cheerio = require('cheerio')

function ldlcRequest({ url, page, params, method, xhr, ctx }) {
  return ctx
    .cozyRequest({
      method: method || (params ? 'POST' : 'GET'),
      uri: url,
      form: {
        ...formParams(page),
        ...params,
        ...(xhr ? { __ASYNCPOST: 'true' } : {}) // yes: 'true' as a string
      }
    })
    .then(raw => ({ ...ctx, page: cherioFromReq(raw, xhr) }))
}

function cherioFromReq(raw, xhr) {
  return cheerio.load(xhr ? '<div>' + asyncPlayload(raw, xhr) + '</div>' : raw)
}

function asyncPlayload(raw, xhr) {
  // the first data seems a number of char for the playload
  // we should probably use it to slice the playload instead
  // of regexp, but it does not seem to match the real number
  // of character and I can't find their corresponding code
  const re = RegExp(
    `\\|[0-9]+\\|\\w+\\|${xhr}\\|((?:.|[\\n\\r])*?)(?:\\Z|\\|[0-9]+\\|\\w+\\|\\w+\\|)`
  )
  return raw.match(re)[1]
}

// This is partly like the `serializeArray` of Cheerio
// but I needed to include disabled fields (LDLC's javascript use them)
// and cheerio's native function exclude them
function formParams(page) {
  if (page) {
    const form = page('#aspnetForm')
    const params = { __EVENTARGUMENT: '' }
    form
      .find('input,select,textarea,keygen')
      .filter(
        '[name][name!=""]:not(:submit, :button, :image, :reset, :file):matches([checked], :not(:checkbox, :radio))'
      )
      .each(function(i, field) {
        field = form.find(field)
        const name = field.attr('name')
        const value = field.val() || ''
        if (Array.isArray(value)) {
          value.forEach(value => (params[name] = value))
        } else {
          params[name] = value
        }
      })
    return params
  } else {
    return {}
  }
}

module.exports = ldlcRequest
