const { safePost, safeGet } = require("./safePost");
const subscriptions = require("./subscription.json");
async function CloseLong(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeLong/${coinname}?index=${index}`);
}
async function CloseShort(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeShort/${coinname}?index=${index}`);
}
async function OpenLong(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/long/${coinname}/10?index=${index}`);
}
async function OpenShort(index, coinname) {
    await safeGet(`http://board.itsarex.com:5051/short/${coinname}/10?index=${index}`);
}

async function ManageSubscriptions(stregetyKey, coinName,Action){
    if(stregetyKey in subscriptions){
        let subscribers = subscriptions[stregetyKey];
        subscribers.forEach(sub => {
            if(Action == "Long"){
                console.log("Opening Long for ", sub);
                OpenLong(sub, coinName);
            }else if(Action == "Short"){
                console.log("Opening Short for ", sub);
                OpenShort(sub, coinName);
            }else if(Action == "CloseLong"){
                console.log("Closing Long for ", sub);
                CloseLong(sub, coinName);
            }else if(Action == "CloseShort"){
                console.log("Closing Short for ", sub);
                CloseShort(sub, coinName);
            }else if(Action == "Close"){
                console.log("Closing All for ", sub);
                CloseLong(sub, coinName);
                CloseShort(sub, coinName);
            } 
        });
    }
}

module.exports = {ManageSubscriptions};