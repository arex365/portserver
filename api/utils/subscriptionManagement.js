const { default: axios } = require("axios");
const { safePost, safeGet } = require("./safePost");
const subscriptions = require("./subscription.json");
const { getCollection } = require("./database");
async function CloseLong(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeLong/${coinname}?index=${index}`);
}
async function CloseShort(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeShort/${coinname}?index=${index}`);
}
async function OpenLong(index, coinname,amount) {
  await safeGet(`http://board.itsarex.com:5051/long/${coinname}/${amount}?index=${index}`);
}
async function OpenShort(index, coinname,amount) {
    await safeGet(`http://board.itsarex.com:5051/short/${coinname}/${amount}?index=${index}`);
}

// async function ManageSubscriptions(stregetyKey, coinName,Action){
//     if(stregetyKey in subscriptions){
//         let subscribers = subscriptions[stregetyKey];
//         subscribers.forEach(sub => {
//             if(Action == "Long"){
//                 console.log("Opening Long for ", sub);
//                 OpenLong(sub, coinName);
//             }else if(Action == "Short"){
//                 console.log("Opening Short for ", sub);
//                 OpenShort(sub, coinName);
//             }else if(Action == "CloseLong"){
//                 console.log("Closing Long for ", sub);
//                 CloseLong(sub, coinName);
//             }else if(Action == "CloseShort"){
//                 console.log("Closing Short for ", sub);
//                 CloseShort(sub, coinName);
//             }else if(Action == "Close"){
//                 console.log("Closing All for ", sub);
//                 CloseLong(sub, coinName);
//                 CloseShort(sub, coinName);
//             } 
//         });
//     }
// }
let getSubscription = async (strategy, id = null)=>{
    const Strategies = () => getCollection("Strategies");
  try {
    const match = {};
    if (strategy) match.name = strategy;

    const docs = await Strategies().find(match).toArray();

    const data = docs.map(d => ({
      strategy: d.name,
      entries:
        id !== undefined
          ? (d.entries || []).filter(e => e.id === Number(id))
          : (d.entries || [])
    }));

    return data 

    //res.json(data);

  } catch (err) {
    console.error(err);
    return null
  }    
}
async function ManageSubscriptions(stregetyKey, coinName,Action){
    let response = await getSubscription(stregetyKey) 
    let subs = response
    console.log(subs)
    let a = []
    if(subs.length == 0) return;
    subs = subs[0]
    let {entries} = subs 
    entries.forEach(entry=>{
        let {id,whitelist,amount} = entry 
        if(whitelist.includes(coinName)){
            if(Action == "Long"){
                console.log("Opening Long for ", id);
                OpenLong(id, coinName,amount);
            }else if(Action == "Short"){
                console.log("Opening Short for ", id);
                OpenShort(id, coinName,amount);
            }else if(Action == "CloseLong"){
                console.log("Closing Long for ", id);
                CloseLong(id, coinName);
            }else if(Action == "CloseShort"){
                console.log("Closing Short for ", id);
                CloseShort(id, coinName);
            }else if(Action == "Close"){
                console.log("Closing All for ", id);
                CloseLong(id, coinName);
                CloseShort(id, coinName);
            }
        }else{
            console.log(`ignoring ${Action} on ${id}`)
        }
    })
}


// async function ManageSubscriptions(stregetyKey, coinName,Action){
//     let response = await axios.get(`http://localhost:5007/subscriptions?strategy=${stregetyKey}`)
//     let subs = response.data
//     subs = subs[0]
//     let {entries} = subs 
//     entries.forEach(entry=>{
//         let {id,whitelist,amount} = entry 
//         if(whitelist.includes(coinName)){
//             if(Action == "Long"){
//                 console.log("Opening Long for ", id);
//                 OpenLong(id, coinName);
//             }else if(Action == "Short"){
//                 console.log("Opening Short for ", sub);
//                 OpenShort(id, coinName);
//             }else if(Action == "CloseLong"){
//                 console.log("Closing Long for ", sub);
//                 CloseLong(id, coinName);
//             }else if(Action == "CloseShort"){
//                 console.log("Closing Short for ", sub);
//                 CloseShort(id, coinName);
//             }else if(Action == "Close"){
//                 console.log("Closing All for ", sub);
//                 CloseLong(id, coinName);
//                 CloseShort(id, coinName);
//             }
//         }else{
//             console.log(`ignoring ${Action} on ${id}`)
//         }
//     })
// }

module.exports = {ManageSubscriptions};