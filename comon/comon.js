require("dotenv").config();
const axios = require("axios");
const ngrok = require("ngrok");

const botToken = process.env.TELEGRAM_BOT_TOKEN;

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
      .filter((line) => !line.startsWith(result.type))
      .join("\n");
    return result;
  } catch (error) {
    console.error("Error in processMessage:", error);
    return { type: "", content: "" };
  }
};

const setWebhook = async () => {
  try {
    //const url = await ngrok.connect(process.env.PORT || 3000);
    const urlServer =  await ngrok.connect(process.env.PORT || 3000);// `https://vuonghoanhwedding.cloud`
    const result = await axios.post(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      { url: `${urlServer}/bot${botToken}` }
    );
    console.log("Webhook đã được thiết lập thành công!", result.data);
  } catch (error) {
    console.error("Lỗi khi thiết lập webhook:", error.response?.data || error.message);
  }
};

const deleteWebhook = async () => {
  try {
    const result = await axios.get(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
    console.log("deleteWebhook thành công!", result.data);
  } catch (error) {
    console.error("Lỗi khi thiết lập webhook:", error.response?.data || error.message);
  }
};

module.exports = { processMessage, setWebhook, deleteWebhook };
