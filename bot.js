require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const { processMessage, setWebhook, deleteWebhook } = require("./comon/comon");

const port = process.env.PORT || 3000;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const IDOWNER = process.env.TELEGRAM_IDOWNER;
const Warehouseid = "21122000";
const bot = new TelegramBot(botToken, { polling: false });
const app = express();
const validPasswordHash = crypto
  .createHash("md5")
  .update("hoikythuat")
  .digest("hex"); // Mã hóa mật khẩu hợp lệ

app.use(express.json());

let browserInstance = null;
let awaitAuth = false;
let pageAuth = null;
let dataDistrist = {};
const tokenFilePath = "./access_token.txt";
let ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdDb2RlIjoiZ2huZXhwcmVzcyIsInBhcnRuZXJDb2RlIjoiIiwic2VlZCI6MTc1NzQxMDI2Mzc3NjM5Mzg2LCJzc29JZCI6IjMwMzQ2NTAiLCJ1c2VySWQiOiI2MmViNWNhMzc4Mzc4NDIzZDk0MDk3OTEifQ.lUKfGxUAo8APd_7OLeVYppVDhLGpV0NP_TvSpAk2K1g";
let INFO_TOKEN = "92f2362e-c2d0-11ef-8cf1-3218e4e684df";
// //if (fs.existsSync(tokenFilePath)) {
//   ACCESS_TOKEN = fs.readFileSync(tokenFilePath, 'utf-8');
// }

let TYPE_IN = "in";
let TYPE_OTP = "otp";
let TYPE_PIN = "pin";
let TYPE_AUTH = "auth";
let TYPE_AUTHINFO = "auth_info";
let TYPE_INFO = "info";
let TYPE_RUN = 'run';

const TYPE = [TYPE_IN, TYPE_OTP, TYPE_PIN, TYPE_AUTH,TYPE_AUTHINFO, TYPE_INFO, TYPE_RUN];
 
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Endpoint xử lý webhook
app.post(`/bot${botToken}`, async (req, res) => {
  const message = req?.body?.message ?? {};
  console.log(JSON.stringify(message));
  //if (message != undefined && message?.text != undefined && message?.chat?.id == -1002399045881) {

  if (message != undefined && message?.text != undefined) {
    try {
      const chatId = message?.chat?.id;
      const messageId = message.message_id;
      const { type, content } = processMessage(message, TYPE);
      console.log("chatId", chatId);
      console.log("type", type);
      console.log("content", content);
      if (!TYPE.includes(type)) {
        res.status(200).send("NEXT");
        return;
      }

      switch (type) {
        case TYPE_IN:
          let result = await getPrintA5(content);
          if (ACCESS_TOKEN != "" && result && result != "") {
            sendMessagePrintA5(chatId, messageId, result);
          } else {
            sendOwner({ content: "Chưa xác thực" });
            res.status(200).send("Failed to reply to message");
            return;
          }
          break;
        case TYPE_PIN:
          break;
        case TYPE_OTP:
          break;
        case TYPE_AUTH:
          if (content && content.length > 100) {
            ACCESS_TOKEN = content;
            sendOwner({ content: "Nhập xác thực thành công" });
            res.status(200).send("Message replied");
            return;
          }
          break;
          case TYPE_RUN:
            if (content && content.length > 6) {
              handleRunTrip(chatId, messageId, content);
            }
            break;
        case TYPE_AUTHINFO:
          if (content && content.length > 20) {
            INFO_TOKEN = content;
            sendOwner({ content: "Nhập xác thực info thành công" });
            res.status(200).send("Message replied");
            return;
          }
          break;
        case TYPE_INFO:
          if (content && content.length > 0) {
            let result = await getOrderInfo(content);
            if (
              typeof result == "object" &&
              Object.entries(result).length > 0
            ) {
              sendMessageInfo(chatId, messageId, result);
            } else {
              sendOwner({ content: "Chưa xác thực INFO TOKEN" });
            }
          }
          break;
      }
      res.status(200).send("Message replied");
    } catch (error) {
      console.error("Error in webhook handler:", error);
      res.status(500).send("Failed to reply to message");
    }
  } else {
    res.status(200).send("No message data");
  }
});

app.post("/sendAccess", async (req, res) => {
  try {
    const { text, password } = req?.body;
    if (password != validPasswordHash || text == "" || text.length < 100) {
      res.status(500).json({
        success: false,
        message: `Failed to trigger openWebView. ${password} ${validPasswordHash}`,
      });
      return;
    }
    ACCESS_TOKEN = text;
    res.status(200).json({
      success: true,
      message: "openWebView triggered successfully.",
      token: "",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to trigger openWebView.",
    });
  }
});

//#region // SEND MESSAGE

const sendOwner = async ({ content }) => {
  const message = `${content}`;
  bot.sendMessage(IDOWNER, message);
};

const sendMessagePrintA5 = async (chatId, messageId, currentLink) => {
  bot.sendMessage(chatId, "In phiếu trả hàng A5", {
    parse_mode: "HTML",
    protect_content: true,
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Link",
            url: `https://online-gateway.ghn.vn/a5/public-api/printA5?token=${currentLink}`,
          },
        ],
      ],
    },
  });
};

const sendMessageInfo = async (chatId, messageId, data) => {
  try {
    let { to_name, to_phone, to_address, to_area } = data;
    let distrist = dataDistrist[data?.to_district_id] ? dataDistrist[data?.to_district_id].DistrictName :"";
    let ware = await getWareDetail(data.to_ward_code)
    const escapeHTML = (str) =>
      str.replace(/[&<>"']/g, (char) => 
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])
      );
    let mes = `
      <b>Thông tin đơn hàng</b>
      Họ và tên:
      <b>${escapeHTML(to_name ?? "")}</b>
      Số điện thoại:
      <b>${escapeHTML(to_phone ?? "")}</b>
      Địa chỉ:
      <b>${escapeHTML(to_address ?? "")}</b>
      Quận/Huyện:
      <b>${escapeHTML(distrist ?? "")}</b>
      Phường/Xã:
      <b>${escapeHTML(ware ?? "")}</b>
      Khu vực giao hàng:
      <b>${escapeHTML(to_area ?? "")}</b>
    `;
    bot.sendMessage(chatId, mes, {
      parse_mode: "HTML",
      protect_content: true,
      reply_to_message_id: messageId
    });
  } 
  catch (ex) {
      console.log(ex)
  }
};

const sendMessageReply = async (chatId, messageId, mes) => {
  try {
    bot.sendMessage(chatId, mes, {
      parse_mode: "HTML",
      protect_content: true,
      reply_to_message_id: messageId
    });
  } 
  catch (ex) {
      console.log(ex)
  }
};

//#endregion

//#region // GET PRINT A5

const getPrintA5 = async (order_codes) => {
  return new Promise((resolve) => {
    const bodyData = {
      order_codes: order_codes.split("\n").join(","),
    };
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/order/gen-a5-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "X-Warehouseid": Warehouseid,
        Referer: "https://nhanh.ghn.vn/",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify(bodyData),
    })
      .then((response) => {
        sendOwner({ content: " res: " + JSON.stringify(response) });
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        sendOwner({ content: `data r: ${JSON.stringify(data)} ` });
        resolve(data?.data?.token ?? "");
      })
      .catch((error) => {
        sendOwner({ content: `data errr: ${error.toString()} ` });
        resolve("");
      });
  });
};

const getTripCode = async (driverId) => {
  return new Promise((resolve) => {
      const bodyData = {
        "hub_id": Warehouseid,
        "status": "NEW",
        "is_ready": 0,
        "offset": 0,
        "limit": 100,
        "reverse": 1,
        "page": 1,
        "size": 100
    }
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/trip/get-trip-list-by-hub", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "X-Warehouseid": Warehouseid,
        "Content-Length": JSON.stringify(bodyData).length,
        Referer: "https://nhanh.ghn.vn/",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify(bodyData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        const dataTrips = data?.data?.find((item) => {return item.driverId == driverId});
        resolve(dataTrips?.tripCode ?? "");
      })
      .catch((error) => {
        resolve("");
      });
  });
};

const setTripReady = async (trip_code) => {
  return new Promise((resolve) => {
      const bodyData ={
        "is_ready": true,
        "trip_code": trip_code
    }
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/trip/set-ready", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "X-Warehouseid": Warehouseid,
        "Content-Length": JSON.stringify(bodyData).length,
        Referer: "https://nhanh.ghn.vn/",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify(bodyData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        resolve(true);
      })
      .catch((error) => {
        resolve(false);
      });
  });
};

const setTripStart = async (trip_code) => {
  return new Promise((resolve) => {
      const bodyData = {
        "trip_code": trip_code
      }
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/trip/start-trip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "X-Warehouseid": Warehouseid,
        "Content-Length": JSON.stringify(bodyData).length,
        Referer: "https://nhanh.ghn.vn/",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify(bodyData),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        resolve(true);
      })
      .catch((error) => {
        resolve(false);
      });
  });
};

const handleRunTrip = async ( chatId, messageId, driverId) => {
  return new Promise(async (resolve) => {
      let tripcode = await getTripCode(driverId.split("\n")[0]);
      if(tripcode == ""){
        sendMessageReply(chatId, messageId, `<b>${driverId}</b>: Không có trong DS chuyến đi`)
        return;
      }
      //sendMessageReply(chatId, messageId, `Mã chuyến đi: ${tripcode}`);
      let isReady = await setTripReady(tripcode);
      sendMessageReply(chatId, messageId, `<b>${driverId}</b>: ${isReady ? `Chuyến đi sẵn sàng`: `Chuyến đi chưa sẵn sàng`}`);
      if(!isReady) return;
      let isStart = await setTripStart(tripcode);
      sendMessageReply(chatId, messageId, `<b>${driverId}</b>: ${isStart ? `Bắt đầu`: `Bắt đầu thất bại`}`);
  });
};



const getOrderInfo = async (order_codes) => {
  return new Promise((resolve) => {
    const bodyData = {
      order_code: order_codes.split("\n")[0],
      source: "inside_system",
    };
    const headerData = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language":
        "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5",
      "Content-Type": "application/json",
      "Content-Length": JSON.stringify(bodyData).length,
      Token: `${INFO_TOKEN}`,
      origin: "https://tracuunoibo.ghn.vn",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: "https://tracuunoibo.ghn.vn/",
      "Sec-Ch-Ua": `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`,
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": `"Windows"`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
    }
    sendOwner({content: `data headerData: ${JSON.stringify(headerData)} `});
    fetch(
      "https://fe-online-gateway.ghn.vn/order-tracking/public-api/internal/tracking-logs",
      {
        method: "POST",
        headers: headerData,
        body: JSON.stringify(bodyData),
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        //sendOwner({content: `data RES: ${JSON.stringify(data)} `});
        resolve(data?.data?.order_info ?? {});
      })
      .catch((error) => {
        sendOwner({ content: `data errr: ${error.toString()} ` });
        resolve({});
      });
  });
};

const getWareDetail = async (code) => {
  return new Promise((resolve) => {
    fetch(
      "https://fe-online-gateway.ghn.vn/order-tracking/public-api/master-data/ward-detail?ward_code=" + code,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language":
            "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5",
          "Content-Type": "application/json",
          Token: `${INFO_TOKEN}`,
          origin: "https://tracuunoibo.ghn.vn",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: "https://tracuunoibo.ghn.vn/",
        }
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        resolve(data?.data?.ward_name ?? "");
      })
      .catch((error) => {
        resolve("");
      });
  });
};


const getDistricts = async () => {
  return new Promise((resolve) => {
    fetch(
      "https://fe-online-gateway.ghn.vn/order-tracking/public-api/master-data/districts",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language":
            "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,fr-FR;q=0.6,fr;q=0.5",
          "Content-Type": "application/json",
          origin: "https://tracuunoibo.ghn.vn",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: "https://tracuunoibo.ghn.vn/",
        }
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        resolve(data?.data ?? []);
      })
      .catch((error) => {
        resolve([]);
      });
  });
};

//#endregion

// const setAccessToken = (token) =>{
//   fs.writeFileSync(tokenFilePath, token, 'utf-8');
// }

app.listen(port, async () => {
  console.log(`Server đang chạy trên cổng ${port}`);
  let distrist = await getDistricts();
  if(distrist && distrist.length> 0){
    dataDistrist = distrist.reduce((pre,arr) => {
      if(arr?.DistrictID){
        let e ={};
        e.DistrictName = arr.DistrictName;
        pre[arr?.DistrictID] = e;
      }
      return pre;
    }, {})
  }

  await deleteWebhook();
  await setWebhook();
});
