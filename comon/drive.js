const { google } = require('googleapis');
const path = require('path');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];
const auth = new google.auth.GoogleAuth({
  keyFile: 'publish/account.json',
  scopes: SCOPES,
});

const SPREADSHEET_ID = process.env.SPREADSHEET_ID; //"1tS-qXSVvVLUGlftF0uiB65y8JTl8iu0UpbWXiaSqB40"; // ID của tài liệu Google Sheets

/**
 * Tạo sheet mới trong tài liệu Google Sheets với dữ liệu và định dạng.
 * @param {string} dateString - chuỗi ngày, có thể dùng làm thông tin bổ sung.
 * @param {Array} data - mảng 2 chiều chứa dữ liệu (ví dụ: 13 hàng, 7 cột).
 * @param {string} fileName - tên sheet mới cần tạo (ví dụ: "BaoCao_25-04-2025").
 * @returns {Promise<number>} - trả về sheetId của sheet mới tạo.
 */
async function uploadExcelFile(dateString, data, fileName) {
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    // 1. Thêm sheet mới vào tài liệu
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: fileName,
                gridProperties: {
                  rowCount: data.length + 10,
                  columnCount: data[0].length + 10
                }
              }
            }
          }
        ]
      }
    });
    
    const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
    console.log(`Đã tạo sheet mới "${fileName}" với sheetId: ${newSheetId}`);
    
    // 2. Ghi dữ liệu vào sheet mới
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${fileName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: data }
    });
    
    const numRows = data.length;
    const numCols = data[0].length;
    
    // 3. Áp dụng border màu đen đậm cho toàn bộ vùng dữ liệu
    const borderRequest = {
      updateBorders: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 0,
          endRowIndex: numRows,
          startColumnIndex: 0,
          endColumnIndex: numCols
        },
        top: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } },
        bottom: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } },
        left: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } },
        right: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } },
        innerHorizontal: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } },
        innerVertical: { style: 'SOLID_MEDIUM', color: { red: 0, green: 0, blue: 0 } }
      }
    };
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [borderRequest] }
    });
    
    // 4. Định dạng dòng tổng (giả sử dòng cuối cùng của data) với màu nền xanh lá nhạt
    const summaryRowIndex = numRows - 1; // 0 - index, dòng tổng là hàng cuối
    const summaryFormatRequest = {
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: summaryRowIndex,
          endRowIndex: summaryRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: numCols
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.8, green: 1, blue: 0.8 } // màu xanh lá nhạt
          }
        },
        fields: "userEnteredFormat.backgroundColor"
      }
    };
    const percentageColumnIndex = numCols - 1;
    const percentageConditionalFormatRequest = {
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: newSheetId,
            startRowIndex: summaryRowIndex, // Dòng tổng
            endRowIndex: summaryRowIndex + 1,
            startColumnIndex: percentageColumnIndex,
            endColumnIndex: percentageColumnIndex + 1
          }],
          booleanRule: {
            condition: {
              type: "NUMBER_LESS",
              values: [{ userEnteredValue: 0.8 }] // Điều kiện: < 80% (0.8 trong Google Sheets)
            },
            format: {
              backgroundColor: { red: 1, green: 0.4, blue: 0.4 } // Màu đỏ
            }
          }
        }
      }
    };
    
    const formatPercentageColumnRequest = {
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 1, // Bắt đầu từ dòng dữ liệu (bỏ qua header)
          endRowIndex: numRows,  // Đến dòng cuối cùng của dữ liệu
          startColumnIndex: 6, // Cột phần trăm (cột thứ 7, vì chỉ số bắt đầu từ 0)
          endColumnIndex: 7  // Chỉ cần đến cột 7 vì chỉ có 1 cột cho phần trăm
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: "PERCENT",
              //attern: "0.00%" // Hiển thị dạng phần trăm với 2 số thập phân
              pattern: "#,##0.00%" // Hiển thị dạng phần trăm với 2 số thập phân

            }
          }
        },
        fields: "userEnteredFormat.numberFormat"
      }
    };

    //await sheets.spreadsheets.batchUpdate({
    //  spreadsheetId: SPREADSHEET_ID,
    //  requestBody: { requests: [summaryFormatRequest,formatPercentageColumnRequest] }
    //});
    // await sheets.spreadsheets.batchUpdate({
    //   spreadsheetId: SPREADSHEET_ID,
    //   requestBody: { requests: [ percentageConditionalFormatRequest] }
    // });
    // 5. Định dạng header (dòng đầu tiên) với font chữ đậm, tạo hiệu ứng bảng dữ liệu
    const headerFormatRequest = {
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: numCols
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true }
          }
        },
        fields: "userEnteredFormat.textFormat.bold"
      }
    };
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [headerFormatRequest] }
    });
    
    console.log(`Sheet "${fileName}" đã được cập nhật dữ liệu và định dạng.`);
    return newSheetId;
  } catch (error) {
    console.error("Lỗi khi tạo sheet và cập nhật dữ liệu:", error);
    throw error;
  }
}

module.exports = uploadExcelFile;
