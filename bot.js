require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
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

let dataDistrist = {};
let ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdDb2RlIjoiZ2huZXhwcmVzcyIsInBhcnRuZXJDb2RlIjoiIiwic2VlZCI6NTUzODE2NzYwNDYzNjE3MDY0Nywic3NvSWQiOiIzMDM0NjUwIiwidXNlcklkIjoiNjJlYjVjYTM3ODM3ODQyM2Q5NDA5NzkxIn0.XTdsEa6_fId7wP-oGqWWdgDSlezPigOLpdcneKsELNE";
let INFO_TOKEN = "e7a2b20a-c46c-11ef-8aa3-5afc7ca5b5c0";

let USER_AGENT = process.env.USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';

let TYPE_IN = "in";
let TYPE_OTP = "otp";
let TYPE_PIN = "pin";
let TYPE_AUTH = "auth";
let TYPE_AUTHINFO = "auth_info";
let TYPE_INFO = "info";
let TYPE_RUN = 'run';
let TYPE_ADD = 'add'; 

const TYPE = [TYPE_IN, TYPE_OTP, TYPE_PIN, TYPE_AUTH,TYPE_AUTHINFO, TYPE_INFO, TYPE_RUN, TYPE_ADD];
 
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Endpoint xử lý webhook
app.post(`/bot${botToken}`, async (req, res) => {
  const message = req?.body?.message ?? {};
  console.log(JSON.stringify(message));
  //if (message != undefined && message?.text != undefined && message?.chat?.id == -1002399045881) {
  //-1002254854101 // chỉ in
  //-1002498534400
  if (message != undefined && message?.text != undefined) {
    try {
      const chatId = message?.chat?.id;
      const messageId = message.message_id;
      const { type, content } = processMessage(message, TYPE);
      if (!TYPE.includes(type) || (!TYPE_IN.includes(type) && [-1002254854101].includes(chatId))) {
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
        case TYPE_ADD:
          if (content && content.length > 0) {
            handleOrderAdd(chatId, messageId, content);
          }
          break;
      }
      res.status(200).send("Message replied");
    } catch (error) {
      res.status(200).send("Failed to reply to message");
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
        "User-Agent": USER_AGENT,
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
//#endregion

//#region // TRIP

const getTripCode = async (driverId, status = "NEW") => {
  return new Promise((resolve) => {
      const bodyData = {
        "hub_id": Warehouseid,
        "status": status,
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
        "User-Agent":USER_AGENT,
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
        const dataTrips = data?.data?.find((item) => { return item.driverId == driverId });
        resolve(dataTrips ?? {});
      })
      .catch((error) => {
        resolve({});
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
        "User-Agent":USER_AGENT,
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
        "User-Agent": USER_AGENT,
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

const handleRunTrip = async (chatId, messageId, driverId) => {
  return new Promise(async (resolve) => {
      let { tripCode }= await getTripCode(driverId.split("\n")[0]);
      if(tripCode== undefined || tripCode == ""){
        sendMessageReply(chatId, messageId, `<b>${driverId}</b>: Không có trong DS chuyến đi`)
        return;
      }
      let isReady = await setTripReady(tripCode);
      sendMessageReply(chatId, messageId, `<b>${driverId}</b>: ${isReady ? `Chuyến đi sẵn sàng`: `Chuyến đi chưa sẵn sàng`}`);
      if(!isReady) return;
      let isStart = await setTripStart(tripCode);
      sendMessageReply(chatId, messageId, `<b>${driverId}</b>: ${isStart ? `Bắt đầu`: `Bắt đầu thất bại`}`);
  });
};

//#region // Handle Add

const handleOrderAdd = async (chatId, messageId, content) => {
  return new Promise(async (resolve) => {
    let [ orderCode, empCode ] = content.split("\n");
    if(orderCode == undefined || orderCode == "") return;
    let { deliver_warehouse_id, status_ops_name } = await getOrderInfo(orderCode);
    if (deliver_warehouse_id == Warehouseid) {
      if (status_ops_name == "Lưu kho giao") {
        let { tripCode  } = {
            ...(await getTripCode(empCode)),
            ...(await getTripCode(empCode, "ON_TRIP")),
        };
        if (tripCode == undefined || tripCode == "") {
          sendMessageReply(chatId ,messageId ,`<b>${empCode}</b>: Không có trong DS chuyến đi hoặc đã chạy`);
          return;
        }
        await setUnPack(orderCode)
        sendMessageReply(chatId,messageId,`<b>${orderCode}</b>: Rã hàng`);
        let result = await addOrderItem({
          tripCode: tripCode,
          orderCodes: orderCode,
        });
        if(result == false){
          sendMessageReply(chatId,messageId,`<b>${orderCode}</b>: Chuyển thất bại`);
          return;
        }
        if(result?.status == "OK"){
          sendMessageReply(chatId,messageId,`<b>${orderCode}</b>: Thêm đơn hàng thành công cho ${empCode}`);
          return;
        }
        sendMessageReply(chatId,messageId,`<b>${result?.message?.split(",")[0] ?? "Thất bại"}, nhắn lên nhóm giao hàng</b>`);
        return;
      } else if (status_ops_name == "Đang giao hàng") {
        sendMessageReply(chatId, messageId, `<b>${orderCode}</b>: ${status_ops_name}`)
      } else {
        sendMessageReply(chatId, messageId, `<b>${orderCode}</b>: ${status_ops_name}`)
      }
    }
    else if(deliver_warehouse_id != undefined){
      sendMessageReply(chatId,messageId,`<b>Nhắn lên nhóm giao hàng</b>`);
    }
  });
};

const addOrderItem = async ({ tripCode,orderCodes }) => {
  return new Promise((resolve) => {
      const bodyData = {
        "tripCode": tripCode,
        "type": "DELIVER",
        "orderCodes": orderCodes.split("\n"),
        "confirmWarning": false
    }
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/v2/trip/add-item-v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":USER_AGENT,
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
        resolve(data);
      })
      .catch((error) => {
        resolve(false);
      });
  });
};

const setUnPack = async (orderCode) => {
  return new Promise((resolve) => {
    const bodyData = {
      orderCode: orderCode,
      locationId: Warehouseid,
      locationType: "GHN_HUB",
      source: "INSIDE_WEB_APP/ktc-van-tai/unpack/quick",
    };
    fetch("https://inside-prd-api.ghn.vn/pms/v1/package/unpack-quick", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":USER_AGENT,
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
        resolve(true);
      })
      .catch((error) => {
        resolve(false);
      });
  });
};


//#endregion

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
      "User-Agent":USER_AGENT,
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
        sendOwner({ content: `data error: ${error.toString()} ` });
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
          "User-Agent":USER_AGENT,
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
          "User-Agent": USER_AGENT,
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
