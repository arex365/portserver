const axios = require('axios');
//const baseURL = "https://adaptive-mrc.vercel.app"; // Replace with actual base URL
let baseURL = "http://localhost:5007"; // Replace with actual base URL
const coin = "ZEC"
let payload = {
    "Action": "Extra",
}
console.log(`Sending request to ${baseURL}/api/action/${coin} with payload:`, payload);
axios.post(`${baseURL}/manage/${coin}?tableName=DIY`, payload).then(res => {
    console.log(res.data);
} ).catch(err => {
    console.error(err);
});
