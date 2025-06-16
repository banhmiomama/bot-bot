require("dotenv").config();
const axios = require("axios");
const https = require("https");
const ngrok = require("ngrok");

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const httpsAgent = new https.Agent({ family: 4 });

if (!botToken) {
  console.error("Lỗi: TELEGRAM_BOT_TOKEN không được cung cấp!");
  process.exit(1);
}

const processMessage = (message, types) => {
  try {
    const { text } = message;
    const result = { type: "", content: "" };
    const lines = text.split("\n").map((line) => line.trim());
    const lastLine = lines[lines.length - 1].toLowerCase();
    for (let type of types) {
      if (lastLine == type) {
        result.type = type;
        break;
      }
    }
    result.content = lines
      .filter((line) => !line.toLowerCase().startsWith(result.type))
      .join("\n");
    return result;
  } catch (error) {
    console.error("Error in processMessage:", error);
    return { type: "", content: "" };
  }
};

const setWebhook = async () => {
  try {
    const urlServer = process.env.URL || await ngrok.connect(process.env.PORT || 6000);
    const result = await axios.post(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      { url: `${urlServer}/bot${botToken}` },

       { httpsAgent } 
    );
    console.log("Webhook đã được thiết lập thành công!", result.data);
  } catch (error) {
    console.error("Lỗi khi thiết lập webhook:", error.response?.data || error.message);
  }
};

const deleteWebhook = async () => {
  try {
    const result = await axios.get(`https://api.telegram.org/bot${botToken}/deleteWebhook`, { httpsAgent } );
    console.log("deleteWebhook thành công!", result.data);
  } catch (error) {
    console.error("Lỗi khi thiết lập webhook:", error.response?.data || error.message);
  }
};

module.exports = { processMessage, setWebhook, deleteWebhook };
