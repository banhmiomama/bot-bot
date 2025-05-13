require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { processMessage, setWebhook, deleteWebhook } = require("./comon/comon");
const uploadExcelFile = require("./comon/drive");
const axios = require('axios');
const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');


const port = process.env.PORT || 3000;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const IDOWNER = process.env.TELEGRAM_IDOWNER;
const Warehouseid = "21122000";
const bot = new TelegramBot(botToken, { polling: false ,request: {
  agent: new https.Agent({ family: 4 }) // ⚠️ buộc IPv4
}});
const app = express();

app.use(express.json());
let browser; // Giữ trình duyệt Chromium
let page; // Trang hiện tại
let dataDistrist = {}, dataSchedule = {};
let ACCESS_TOKEN = "";
let pageLogin;
let USER_AGENT = process.env.USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';

let TYPE_IN = "in";
let TYPE_INFO = "info";
let TYPE_RUN = 'run';
let TYPE_ADD = 'add'; 
let TYPE_RP = 'rp'; 

const TYPE = [TYPE_IN, TYPE_INFO, TYPE_RUN, TYPE_ADD, TYPE_RP];
 
const chatAllow = [
  -1002254854101, // Nhóm chỉ in
  -1002399045881, // Nhóm chính
  6140961420, 
  -1002498534400, // Nhóm test 
  -1002371190546, //// Nhóm test mới
  //-1002448718905, //// Nhóm test mới 2
  -4634438501,
  -4786598413 // REPORT GHN

]
let chatCurrentID = ""

const wareData = {
  "-1002254854101" : "21606000",
  "-1002399045881" : "21122000",
  "-1002498534400": "21122000",
  "-1002371190546": "21606000",
  "-4634438501": "21463000"
}

const getWareID = () => {
  return wareData[chatCurrentID] ?? "";
}

// Endpoint xử lý webhook
app.post(`/bot${botToken}`, async (req, res) => {
  const message = req?.body?.message ?? {};
  console.log(message)
  if (message != undefined && message?.text != undefined) {
    try {
      const chatId = message?.chat?.id;
      const messageId = message.message_id;
      console.log(JSON.stringify((message)));
      const { type, content } = processMessage(message, TYPE);
      if (!chatAllow.includes(chatId) || !TYPE.includes(type)) {
        res.status(200).send("NEXT");
        return;
      }
      chatCurrentID = chatId;
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
        case TYPE_RUN:
          if (content && content.length > 6) {
            handleRunTrip(chatId, messageId, content);
          }
          break;
        case TYPE_INFO:
          if (content && content.length > 0) {
            let { order_info } = await getOrderInfo(content);
            if (
              typeof order_info == "object" &&
              Object.entries(order_info).length > 0
            ) {
              sendMessageInfo(chatId, messageId, order_info);
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
        case TYPE_RP:
          if (content && content.length > 0) {
            handleReport(chatId, messageId, content);
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


const sendMessageLink = async (chatId, messageId, title,  currentLink) => {
  bot.sendMessage(chatId, title, {
    parse_mode: "HTML",
    protect_content: true,
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Link",
            url: `${currentLink}`,
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
        "X-Warehouseid": getWareID(),
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
        resolve(data?.data?.token ?? "");
      })
      .catch((error) => {
        sendOwner({ content: `data getPrintA5: ${error.toString()} ` });
        resolve("");
      });
  });
};
//#endregion

//#region // TRIP

const getTripCode = async (driverId, status = "NEW") => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const bodyData = {
        hub_id: getWareID(),
        status: status,
        is_ready: 0,
        offset: 0,
        limit: 100,
        reverse: 1,
        page: 1,
        size: 100,
      };
      fetch(
        "https://fe-nhanh-api.ghn.vn/api/lastmile/trip/get-trip-list-by-hub",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "User-Agent": USER_AGENT,
            "X-Warehouseid": getWareID(),
            "Content-Length": JSON.stringify(bodyData).length,
            Referer: "https://nhanh.ghn.vn/",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
          },
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
          const dataTrips = data?.data?.find((item) => {
            return item.driverId == driverId;
          });
          resolve(dataTrips ?? {});
        })
        .catch((error) => {
          resolve({});
        });
    }, 300);
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
        "X-Warehouseid": getWareID(),
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
        "X-Warehouseid": getWareID(),
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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const handleOrderAdd = async (chatId, messageId, content) => {
  return new Promise(async (resolve) => {
    let [ orderCode, empCode ] = content.split("\n");
    if(orderCode == undefined || orderCode == "") return;
    let { order_info, tracking_logs} = await getOrderInfo(orderCode);
    let { deliver_warehouse_id, status_ops_name,  } = order_info ?? {};
    if (deliver_warehouse_id == getWareID()) {
      if (status_ops_name == "Lưu kho giao" || status_ops_name == "Đang luân chuyển giao") {
        let tripCodeDefault = await getTripCode(empCode);
        await sleep(1000);
        let tripCodeOnTrip = await getTripCode(empCode, "ON_TRIP");
        let {tripCode } = {
            ...tripCodeDefault,
            ...tripCodeOnTrip,
        };
        if (tripCode == undefined || tripCode == "") {
          sendMessageReply(chatId ,messageId ,`<b>${empCode}</b>: Không có trong DS chuyến đi hoặc đã chạy`);
          return;
        }
        await setUnPack(orderCode)
        sendMessageReply(chatId,messageId,`<b>${orderCode}</b>: Rã hàng`);
        await sleep(4000);
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
        let itemStatus = tracking_logs?.find((item) => { return item.action_code == "START_DELIVERY_TRIP" });
        let exectorCode =  itemStatus?.executor?.employee_id ?? ""
        sendMessageReply(chatId, messageId, `
          <b>${orderCode}</b>: ${status_ops_name}\n${exectorCode != "" ? `<b>Trong App: ${exectorCode} - ${dataSchedule[getWareID()][exectorCode]?.user_name ?? ""}</b>`: ""}
        `)
      } else if (status_ops_name == "Đã giao hàng") {
        let itemStatus = tracking_logs?.find((item) => { return item.action_code == "DELIVER_IN_TRIP" });
        let exectorCode =  itemStatus?.executor?.employee_id ?? ""
        sendMessageReply(chatId, messageId, `
          <b>${orderCode}</b>: ${status_ops_name}\n${exectorCode != "" ? `<b>Giao hàng thành công: ${exectorCode} - ${dataSchedule[getWareID()][exectorCode]?.user_name ?? ""}</b>`: ""}
        `)
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
        "X-Warehouseid": getWareID(),
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
      locationId: getWareID(),
      locationType: "GHN_HUB",
      source: "INSIDE_WEB_APP/ktc-van-tai/unpack/quick",
    };
    fetch("https://inside-prd-api.ghn.vn/pms/v1/package/unpack-quick", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "User-Agent":USER_AGENT,
        "X-Warehouseid": getWareID(),
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
  return new Promise(async (resolve) => {
    try {
      await launchPage();
      const order_code = order_codes.split("\n")[0];
      const source = "inside_system";
      await page.waitForSelector('.search-input');
      const result = await page.evaluate(
        async ({ order_code, source }) => {
          const bodyData = {
            order_code,
            source,
          };

          const headerData = {
            "content-length": JSON.stringify(bodyData).length.toString(),
            "content-type": "application/json",
            token: localStorage.getItem('token'),
            accept: "application/json",
          };

          // Thực hiện fetch từ ngữ cảnh của trình duyệt
          const response = await fetch(
            "https://fe-online-gateway.ghn.vn/order-tracking/public-api/internal/tracking-logs",
            {
              method: "POST",
              headers: headerData,
              body: JSON.stringify(bodyData),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          return await response.json();
        },
        { order_code, source } // Truyền tham số vào evaluate
      );

      resolve(result?.data ?? {});
    } catch (error) {
      console.error(`Lỗi trong getOrderInfo: ${error.toString()}`);
      resolve({});
    }
  });
};

const getWareDetail = async (code) => {
  return new Promise(async (resolve) => {
    try {
    await launchPage();
    const result = await page.evaluate(
      async ({ code }) => {
        const headerData = {
          "content-type": "application/json",
          token: localStorage.getItem('token'),
          accept: "application/json",
        };
        const response = await fetch(
          "https://fe-online-gateway.ghn.vn/order-tracking/public-api/master-data/ward-detail?ward_code=" + code,
          {
            method: "GET",
            headers: headerData
          }
        );
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
      },
      { code }
    );
    resolve(result?.data?.ward_name ?? {});
  } catch (error) {
    console.error(`Lỗi trong getWareDetail: ${error.toString()}`);
    resolve({});
  }
  });
};

const getDistricts = async () => {
  return new Promise(async (resolve) => {
    try {
    await launchPage();
    const result = await page.evaluate(
      async ({ }) => {
        const response = await fetch(
          "https://fe-online-gateway.ghn.vn/order-tracking/public-api/master-data/districts",
          {
            method: "GET"
          }
        );
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
      },
      {  }
    );
    resolve(result?.data?? []);

  } catch (error) {
    console.error(`Lỗi trong getWareDetail: ${error.toString()}`);
    resolve({});
  }
  });
};

//#endregion

//#region // GET USER


const getUserScheduler = async ({dateFrom, dateTo ,wareid }) => {
  return new Promise((resolve) => {
    const bodyData = {
      "hub_id": wareid,
      "from_date": dateFrom.toISOString(),
      "to_date":  dateTo.toISOString(),
    }
    fetch("https://fe-nhanh-api.ghn.vn/api/sop/user-schedule/get-user-schedules-by-hub", {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        Referer: "https://nhanh.ghn.vn/",
        "Sec-Ch-Ua": `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`,
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": `"Windows"`,
        "X-Warehouseid": getWareID(),
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
        resolve(data?.data ?? {});
      })
      .catch((error) => {
        resolve({});
      });
  });
};

const handleGetDataUser = async () => {
  if (!ACCESS_TOKEN) return;

  let newDate = new Date();
  let wareIds = ["21122000", "21606000", "21463000"];
  dataSchedule = {};

  for (let wareid of wareIds) {
    try {
      let result = await getUserScheduler({ dateFrom: newDate, dateTo: newDate, wareid });

      if (result && typeof result === "object" && Object.keys(result).length > 0) {
        const { users } = result ?? {};
        if (users) {
          dataSchedule[wareid] = users.reduce((acc, user) => {
            if (user.user_id) acc[Number(user.user_id)] = user;
            return acc;
          }, {});
        }
      }

      console.log(`Fetched data for wareid: ${wareid}`);
      
    } catch (error) {
      console.error(`Error fetching data for wareid ${wareid}:`, error);
    }

    await sleep(1000); 
  }
};


//#endregion

//#region // Handle INIT

const launchBrowser = async () => {
  if (browser) await browser.close();
  browser = await chromium.launchPersistentContext('./user-data', {
    headless: false,
    args: ['--no-sandbox'],
  });
  page = await browser.newPage();
  await page.goto('https://tracuunoibo.ghn.vn');
};

const launchPage = async () =>{
  try{
    if (!browser || !page) {
      console.log('Chromium không hoạt động. Khởi động lại...');
      await launchBrowser();
    }
    await page.goto('https://tracuunoibo.ghn.vn/internal');
  }catch(error){
    console.error(`Lỗi launchPage: ${error.toString()}`);
  }
}

const runMain = async () => {
  try {
    console.log('Khởi động Chromium...');
    await launchBrowser();
  } catch (error) {
    sendOwner({ content: `data r: ${error.toString()} ` });
    console.error(`Lỗi: ${error.toString()}`);
  } finally {
  }
}

const autoSetACCESSTOKEN = async () =>{
  try{
    if (!browser || !page) {
      console.log('Chromium không hoạt động. Khởi động lại...');
      await launchBrowser();
    }
    await page.goto('https://nhanh.ghn.vn/lastmile/trip-list');
    const result = await page.evaluate(() => {
        return localStorage.getItem('SESSION');
      },
      {  }
    );
    ACCESS_TOKEN = result;
    return result
  }catch(error){
    runLoginPage();
    console.error(`Lỗi launchPage: ${error.toString()}`);
  }
}


const runLoginPage = async () => {
  try{


    pageLogin = await browser.newPage();
    await pageLogin.goto('https://sso-v2.ghn.vn/internal/login');
    // Bước 1: Điền thông tin đăng nhập lần đầu
    await pageLogin.fill('#userId', '3050253'); // Điền userId
    await pageLogin.fill('#password', 'Dhl@1711'); // Điền password
    await pageLogin.click('button[type=submit]'); // Click nút "Đăng nhập"

    // Đợi điều hướng sau khi đăng nhập lần đầu
    await pageLogin.waitForNavigation();
    sendOwner({ content: "Nhập mã pin" });
  }
  catch(ex){  
  }  
}

//#endregion

//#region // HANDLE REPORT

const handleReport = async (chatId, messageId, content) => {
  var dataResult = [
    [
      "STT",
      "Tên Nhân Viên",
      "Đơn Gán",
      "Giao TC",
      "Giao TB",
      "Đơn Lấy",
      "Đơn Trả",
      "Tỉ lệ giao TC",
    ],
  ];
  let fileName = '' 
  try {
    let [date, wareid] = content.split("\n");
    if (date == undefined || date == "" || wareid == undefined || wareid == "")
      return;
    let dateFrom = new Date(date);
    let dateTo = new Date(date);
    dateTo.setDate(dateTo.getDate() + 1);
    fileName = `Báo cáo ${ConvertDatetimeToDMY(dateFrom)}`;
    const tripList = await getSearchTrip({ dateFrom, dateTo, wareid });
    if (tripList == undefined || tripList.length < 0) return;
    let total = { DELIVER: 0, DELIVER_SUCC: 0, PICK: 0, RETURN: 0 };

    for (let i = 0; i < tripList.length; i++) {
      let { driverName, tripCode, status } = tripList[i];
      if (status !== "FINISHED") continue;

      let tripItems = await getTripItems({ tripCode, wareid });

      let totalAll = tripItems.reduce(
        (pre, arr) => {
          if (arr) {
            switch (arr.type) {
              case "DELIVER":
                pre.DELIVER++;
                if (arr.isSucceeded) pre.DELIVER_SUCC++;
                break;
              case "PICK":
                pre.PICK++;
                break;
              case "RETURN":
                if (arr.isSucceeded) pre.RETURN++;
                break;
            }
          }
          return pre;
        },
        { DELIVER: 0, DELIVER_SUCC: 0, PICK: 0, RETURN: 0 }
      );

      // Cộng dồn tổng
      total.DELIVER += totalAll.DELIVER;
      total.DELIVER_SUCC += totalAll.DELIVER_SUCC;
      total.PICK += totalAll.PICK;
      total.RETURN += totalAll.RETURN;

      let tripItem = [
        i,
        driverName,
        totalAll.DELIVER,
        totalAll.DELIVER_SUCC,
        totalAll.DELIVER - totalAll.DELIVER_SUCC,
        totalAll.PICK,
        totalAll.RETURN,
        totalAll.DELIVER
          ? (totalAll.DELIVER_SUCC / totalAll.DELIVER).toFixed(2)
          : 0,
      ];
      dataResult.push(tripItem);
      sleep(600);
    }

    // Tính tổng các cột & trung bình cộng cho cột "Tỉ lệ giao TC"
    let avgRate = total.DELIVER
      ? (total.DELIVER_SUCC / total.DELIVER).toFixed(2)
      : "0";

    dataResult.push([
      "",
      "Tổng",
      total.DELIVER,
      total.DELIVER_SUCC,
      total.DELIVER - total.DELIVER_SUCC,
      total.PICK,
      total.RETURN,
      avgRate,
    ]);

    
    const result = await uploadExcelFile(
      ConvertDatetimeToDMY(dateFrom),
      dataResult,
      `${wareid}-${ConvertDatetimeToDMY(dateFrom)}`
    );
    sendMessageLink(
      chatId,
      messageId,
      fileName,
      `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID || "1tS-qXSVvVLUGlftF0uiB65y8JTl8iu0UpbWXiaSqB40"}/edit?gid=${result}#gid=${result}`
    );
  } catch (er) {
    if (er.status == 400) {
      sendMessageReply(
        chatId,
        messageId,
        er.message
      );
    }
  } finally{
    createImage(fileName, dataResult, chatId, messageId);
  }
};

const ConvertDatetimeToDMY = (date) => {
  let day = date.getDate();
  let month = date.getMonth() + 1; // Tháng bắt đầu từ 0
  const year = date.getFullYear();

  // Đảm bảo ngày và tháng có hai chữ số
  day = day.toString().padStart(2, "0");
  month = month.toString().padStart(2, "0");

  return `${day}/${month}/${year}`;
};

const getSearchTrip = async ({ dateFrom, dateTo ,wareid }) => {
  return new Promise((resolve) => {
    const bodyData = {
      "fromDate": dateFrom,
      "toDate": dateTo,
      "page": 1,
      "limit": 20,
      "offset": 0,
      "hubId": wareid,
      "reverse": true
  }
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/trip/search-trip", {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        Referer: "https://nhanh.ghn.vn/",
        "Sec-Ch-Ua": `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`,
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": `"Windows"`,
        "X-Warehouseid": wareid,
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
        resolve(data?.data ?? []);
      })
      .catch((error) => {
        resolve({});
      });
  });
};

const getTripItems = async ({ tripCode, wareid }) => {
  return new Promise((resolve) => {
    const bodyData = {
        "typeList": [
            "PICK",
            "DELIVER",
            "RETURN"
        ],
        "offset": 0,
        "limit": 1000,
        "TripCode": tripCode
    }
    fetch("https://fe-nhanh-api.ghn.vn/api/lastmile/trip/get-trip-items", {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        Referer: "https://nhanh.ghn.vn/",
        "Sec-Ch-Ua": `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`,
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": `"Windows"`,
        "X-Warehouseid": wareid,
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
        resolve(data?.data ?? []);
      })
      .catch((error) => {
        resolve({});
      });
  });
};


const createImage = async (fileName, data, chatId, messageId) => {
  const html = `
    <html>
    <head>
      <style>
        body { font-family: Arial; }
        table {
          border-collapse: collapse;
          width: 100%;
          font-size: 14px;
        }
        th, td {
          border: 1px solid #999;
          padding: 8px;
          text-align: center;
        }
        th {
          background-color: #4CAF50;
          color: white;
        }
        tr:nth-child(even) { background-color: #f2f2f2; }
        tr:last-child { background-color:  #f6653c ; color:white }


        caption {
          caption-side: top;
          font-weight: bold;
          font-size: 20px;
          padding: 10px;
          text-transform: uppercase;
        }
        .danger{
          background-color: bf3636;
          color:white;
        }
      </style>
    </head>
    <body>
      <table>
             <caption>${fileName}</caption>

        <thead>
          <tr>${data[0].map((col) => `<th>${col}</th>`).join("")}</tr>
        </thead>
        <tbody>
        ${data
          .slice(1)
          .map((row) => {
            return `<tr>${row
              .map((cell, i) => {
                // Nếu là cột cuối cùng
                if (i === row.length - 1) {
                  const percent = Math.round(cell * 100); // 0.6 -> 60
                  const color = percent < 80 ? "danger" : "";
                  return `<td class="${color}">${percent}%</td>`;
                }
                return `<td>${cell}</td>`;
              })
              .join("")}</tr>`;
          })
          .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;

  if (browser) {
    const pageImage = await browser.newPage();
    await pageImage.setContent(html, { waitUntil: "networkidle0" });

    const element = await pageImage.$("table");
    await element.screenshot({ path: "table.png" });
    //await pageImage.close();

    const base64Str = fs.readFileSync("table.png").toString("base64");
    const imageBuffer = Buffer.from(base64Str, "base64");
    bot
      .sendPhoto(chatId, imageBuffer, {
        caption: fileName,
        reply_to_message_id: messageId,
      })
      .then(() => {
        console.log("✅ Đã gửi ảnh dạng reply");
      });
  }
};

//#endregion

app.listen(port, async () => {
  await runMain();
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
  await autoSetACCESSTOKEN();
  await handleGetDataUser();
  await deleteWebhook();
  await setWebhook();

  

//   handleReport(-1002498534400,2074,`2025/04/07
// 21122000` )

});