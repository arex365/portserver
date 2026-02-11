const express = require('express');
const path = require('path');
const cors = require('cors');
const { connectDB } = require('./utils/database');
const root = require('./routes/hello');
const managePosition = require('./routes/managePosition');
const getTrades = require('./routes/getTrades');
const getPrice = require('./routes/getPrice');
const getPositionCount = require('./routes/positioncount');
// const extra = require('./routes/extra')
const app = express();
const bodyParser = require('body-parser');
const subs = require('./routes/subs')
const active = require('./routes/activeTrades')
const PORT = process.env.PORT || 5007;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));

app.use(root);
app.use(managePosition);
app.use(getTrades);
app.use(getPrice);
app.use(getPositionCount);
app.use(subs)
app.use(active)
// Serve control page at /control
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control.html'));
});
app.get('/chart', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chart.html'));
});
app.get('/bubble', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bubble.html'));
});
app.get('/stack', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'stack.html'));
});
app.get("/brick", (req, res) => res.sendFile(path.join(__dirname, 'public', 'brick.html')))
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, 'public', 'sub.html')))
app.get("/allcharts", (req, res) => res.sendFile(path.join(__dirname, 'public', 'AllCharts.html')))
// Connect to MongoDB and start server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Trade server is running on port ${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});