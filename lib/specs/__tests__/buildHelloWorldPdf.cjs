"use strict"

function pad10(n) {
  return String(n).padStart(10, "0")
}

/** Minimal one-page PDF with correct xref offsets. Pass as Uint8Array to pdf-parse. */
function buildHelloWorldPdf(text) {
  const parts = []
  const offsets = [0]
  const add = (s) => {
    parts.push(Buffer.from(s, "latin1"))
  }
  add("%PDF-1.4\n")
  const addObj = (s) => {
    offsets.push(parts.reduce((n, b) => n + b.length, 0))
    add(s)
  }
  addObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
  addObj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
  addObj(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
  )
  const stream = `BT /F1 24 Tf 100 700 Td (${text}) Tj ET`
  addObj(
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  )
  addObj("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")
  const xrefStart = parts.reduce((n, b) => n + b.length, 0)
  let xref = `xref\n0 ${offsets.length}\n`
  xref += "0000000000 65535 f \n"
  for (let i = 1; i < offsets.length; i++) {
    xref += `${pad10(offsets[i])} 00000 n \n`
  }
  add(xref)
  add(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  )
  return Buffer.concat(parts)
}

module.exports = { buildHelloWorldPdf }
