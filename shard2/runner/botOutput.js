const express = require('express')
// serve images in outputs folder
const path = require('path')
const fs = require('fs')
const app = express()
const port = 3001

const outputsDir = path.join(__dirname, 'outputs')
app.use('/outputs', express.static(outputsDir))

function isValidSymbol(s) {
  return /^[A-Za-z0-9_-]+$/.test(s)
}

// Serve images by symbol, e.g. GET /BAT -> outputs/BAT.png
app.get('/:symbol', (req, res) => {
  const symbol = req.params.symbol
  if (!isValidSymbol(symbol)) return res.status(400).send('Invalid symbol')
  const filePath = path.join(outputsDir, `${symbol}.png`)
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).send('Not found')
    res.sendFile(filePath)
  })
})

app.listen(port, () => {
  console.log(`Bot output server listening at http://localhost:${port}`)
})