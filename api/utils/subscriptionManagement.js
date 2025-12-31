const { default: axios } = require("axios");
const { safePost, safeGet } = require("./safePost");
const subscriptions = require("./subscription.json");
const { getCollection } = require("./database");
function checkIfCoinExistsInSide(coinName, data,side) {
  if (!data?.positions?.openPositions) return false;

  return data.positions.openPositions.some(
    position => position.positionSide === side 
  );
}

async function CloseLong(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeLong/${coinname}?index=${index}`);
}
async function CloseShort(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeShort/${coinname}?index=${index}`);
}
async function OpenLong(index, coinname,amount,appendable = true) {
  if(!appendable){
    let data = await safeGet(`http://board.itsarex.com:5051/list?index=${index}`)
    let status = checkIfCoinExistsInSide(coinname,data,"LONG")
    if(status){
      return
    }
  }
  await safeGet(`http://board.itsarex.com:5051/long/${coinname}/${amount}?index=${index}`);
}
async function OpenShort(index, coinname,amount, appendable = true) {
  if(!appendable){
    let data = await safeGet(`http://board.itsarex.com:5051/list?index=${index}`)
    let status = checkIfCoinExistsInSide(coinname,data,"SHORT")
    if(status){
      return
    }
  }
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
        id !== null
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
async function ManageSubscriptions(stregetyKey, coinName,Action,multiplier=1,appendable = false){
    let response = await getSubscription(stregetyKey)
    if(Action.includes("Extra")){
        appendable = true 
    } 
    let subs = response
    console.log(subs)
    let a = []
    if(subs.length == 0) return;
    subs = subs[0]
    console.log(subs)
    let {entries} = subs 
    entries.forEach(entry=>{
        let {id,whitelist,amount} = entry 
        if(whitelist.includes(coinName) || whitelist.includes("ALL")){
            if(Action == "Long" || Action == "Extra Long"){
                console.log("Opening Long for ", id);
                console.log("Amount: ",amount)
                OpenLong(id, coinName,amount*multiplier,appendable);
            }else if(Action == "Short" || Action == "Extra Short"){
                console.log("Opening Short for ", id);
                console.log("Amount: ",amount)
                OpenShort(id, coinName,amount*multiplier,appendable);
            }else if(Action == "CloseLong"){
                console.log("Closing Long for ", id);
                console.log("Amount: ",amount)
                CloseLong(id, coinName);
            }else if(Action == "CloseShort"){
                console.log("Closing Short for ", id);
                console.log("Amount: ",amount)
                CloseShort(id, coinName);
            }else if(Action == "Close"){
                console.log("Closing All for ", id);
                console.log("Amount: ",amount)
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