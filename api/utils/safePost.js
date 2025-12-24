const axios = require("axios");
async function safePost(url, payload) {
  try {
    return await axios.post(url, payload);
  } catch (e) {
    console.error("POST failed:", {
      url,
      payload,
      data: e.response?.data
    });
    throw e;
  }
}
async function safeGet(url) {
  try {
    return await axios.get(url);
  } catch (e) {
    console.warn("GET failed:", url, e.response?.data);
    console.error(e);
  }
}
module.exports = { safePost, safeGet };