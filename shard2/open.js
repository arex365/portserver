const axios = require('axios');
//const baseURL = "https://adaptive-mrc.vercel.app"; // Replace with actual base URL
let baseURL = "http://localhost:5007"; // Replace with actual base URL
const coin = "ZEC"
let payload = {
    "Action": "Extra",
    strategy : "YMA", 
    id : 1, 
    coin: "SENT",
    amount : 20 
}
let position = `${baseURL}/manage/${coin}?tableName=DIY`
let subscribe = `${baseURL}/subscribe` 
let list =  `${baseURL}/subscriptions?strategy=YMA`

console.log(`Sending request to ${baseURL}/api/action/${coin} with payload:`, payload);
// axios.get(list).then(res => {
//     let myData = res.data
//     console.log(JSON.stringify(res.data, null, 2));
//     console.log(myData[0].entries[0])
//     let {whitelist} = myData[0].entries[0]
//     let a = []
    
//     if(whitelist.includes('BNB')){
//         console.log(true)
//     }
// } ).catch(err => {
//     console.error(err);
// });

axios.post(subscribe,payload).then(res => {
    console.log(res.data)
} ).catch(err => {
    console.error(err);
});