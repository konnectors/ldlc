const webroot = 'https://secure.ldlc.com'

const monthes = [
  null,
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
]

function decodePrice(node) {
  return {
    asTring: node.text().trim(),
    asFloat: parseFloat(
      node
        .text()
        .trim()
        .match(/[\d,.]+/)[0]
        .replace(',', '.')
    ),
    currencyString: node
      .text()
      .replace(/[\d,.]+/, '')
      .trim()
  }
}

function dateFromStr(str) {
  const [, day_str, month_human_str, year_str] = str.match(
    /(\d+)\s(\S+)\s(\d+)/
  )
  const day = parseInt(day_str.replace(/^0/, ''))
  const month = monthes.indexOf(month_human_str)
  const year = parseInt(year_str)
  const month_str = month.toString().padStart(2, '0')
  return {
    asString: str,
    year: year,
    month: month,
    day: day,
    iso: `${year_str}-${month_str}-${day_str}`
  }
}

function fetchBill(ctx) {
  const $ = ctx.page
  const details = $('#commandDetail .infosCommande span.bold')
  const productsCommand = $('.productsCommand > table')
  const bottom = productsCommand.eq(-1)
  const bottom_trs = bottom.find('tr')
  const lastLineDivs = bottom_trs
    .eq(-1)
    .children('td')
    .eq(1)
    .children('div')
  const id = details
    .eq(2)
    .text()
    .trim()
  const date = dateFromStr(
    details
      .eq(0)
      .text()
      .trim()
  )
  const pdfFilename = `LDLC_${date.iso}_${id}.pdf`
  const hasPdf = lastLineDivs.length >= 2
  const pdfUrl = hasPdf
    ? webroot +
      lastLineDivs
        .eq(0)
        .children('a')
        .first()
        .attr('href')
        .match(/"(\/.*?)"/)[1]
    : null
  if (!id || id.length == 0) {
    throw new Error(ctx.errors.UNKNOWN_ERROR)
  }
  const meta = {
    date: date,
    delivery: {
      method: details
        .eq(1)
        .text()
        .trim(),
      price: decodePrice(
        bottom_trs
          .eq(0)
          .children('td')
          .eq(2)
      )
    },
    orderId: id,
    payment: details
      .eq(3)
      .text()
      .trim(),
    status: details
      .eq(4)
      .text()
      .trim(),
    totalPrice: decodePrice(
      bottom_trs
        .eq(-2)
        .children('td')
        .eq(2)
    ),
    email: bottom_trs
      .eq(-1)
      .find('.emailCommand')
      .first()
      .text()
      .match(/\S+@\S+/)[0],
    ...(hasPdf ? { pdf: { url: pdfUrl, filename: pdfFilename } } : {})
  }
  const products = productsCommand
    .slice(1, -1)
    .filter((idx, line) => $(line).find('tr').length > 0)
    .map(function(idx, line) {
      const tds = $(line).find('td')
      return {
        img: tds
          .eq(0)
          .find('img')
          .eq(0)
          .attr('src'),
        quantity:
          parseInt(
            tds
              .eq(1)
              .find('span.bold')
              .eq(0)
              .text()
              .trim()
          ) || null,
        name: tds
          .eq(1)
          .find('a')
          .eq(0)
          .text()
          .trim(),
        href:
          tds
            .eq(1)
            .find('a')
            .eq(0)
            .attr('href') || null,
        category: tds
          .eq(1)
          .find('span.cat')
          .eq(0)
          .text()
          .trim(),
        pricePerUnit: decodePrice(tds.eq(2)),
        totalPrice: decodePrice(tds.eq(3))
      }
    })
    .get()
  const additionalServices = bottom_trs
    .slice(1, -2)
    .map(function(idx, service) {
      const tds = $(service).children('td')
      const links = $(service).find('a')
      const hasLink = links.length > 0
      const name_node = hasLink ? links.first() : tds.eq(1)
      return {
        name: name_node.text().trim(),
        link: hasLink ? name_node.attr('href') : null,
        price: decodePrice(tds.eq(2))
      }
    })
    .get()
  //ctx.log( "debug", { ...meta, products, additionalServices }, "order");
  return { ...ctx, bill: { ...meta, products, additionalServices } }
}

module.exports = fetchBill
