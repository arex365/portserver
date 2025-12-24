const { safePost, safeGet } = require("./safePost");
const subscriptions = require("./subscription.json");
async function CloseLong(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeLong/${coinname}?index=${index}`);
}
async function CloseShort(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/closeShort/${coinname}?index=${index}`);
}
async function OpenLong(index, coinname) {
  await safeGet(`http://board.itsarex.com:5051/long/${coinname}?index=${index}`);
}
async function OpenShort(index, coinname) {
    await safeGet(`http://board.itsarex.com:5051/short/${coinname}?index=${index}`);
}

async function ManageSubscriptions(stregetyKey, coinName,Action){
    if(stregetyKey in subscriptions){
        let subscribers = subscriptions[stregetyKey];
        subscribers.forEach(sub => {
            if(Action == "Long"){
                OpenLong(sub, coinName);
            }else if(Action == "Short"){
                OpenShort(sub, coinName);
            }else if(Action == "CloseLong"){
                CloseLong(sub, coinName);
            }else if(Action == "CloseShort"){
                CloseShort(sub, coinName);
            }else if(Action == "Close"){
                CloseLong(sub, coinName);
                CloseShort(sub, coinName);
            } 
        });
    }
}

module.exports = {ManageSubscriptions};