const express = require('express');
const helloRouter = require('./routes/Hello');
const longRouter = require('./routes/long');
const shortRouter = require('./routes/short');
const leverageRouter = require('./routes/leverage');
const simpleLongRouter = require('./routes/simple_long');
const simpleShortRouter = require('./routes/simple_short');
const manageOrderRouter = require("./routes/manageOrder")
const closeLong = require("./routes/closeLong")
const closeShort = require("./routes/closeShort")
const partialClose = require("./routes/partialClose")
const exitRouter = require("./routes/exit")
//const states = require("./routes/coinstate")
const listPos = require("./routes/getpositions")
const Cors = require('cors')

const app = express();
app.use(Cors())
app.use(express.json());
const port = 5051;
app.use(helloRouter);
app.use(leverageRouter);
app.use(longRouter);
app.use(shortRouter);
app.use(simpleLongRouter);
app.use(simpleShortRouter);
app.use(manageOrderRouter)
app.use(exitRouter);
app.use(closeLong)
app.use(closeShort)
app.use(partialClose)
//app.use(states)
app.use(listPos)
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
