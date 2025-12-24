const axios = require('axios');
//const baseURL = "https://adaptive-mrc.vercel.app"; // Replace with actual base URL
const baseURL = "https://bunny.itsarex.com"; // Replace with actual base URL
const coin = "ENA"
let payload = {
    "Action": "Stop Long",
}
console.log(`Sending request to ${baseURL}/api/action/${coin} with payload:`, payload);
axios.post(`${baseURL}/manage/${coin}/100`, payload).then(res => {
    console.log(res.data);
} ).catch(err => {
    console.error(err);
});
