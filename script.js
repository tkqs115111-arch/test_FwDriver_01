// =========================================================
//  PART 1: 資料庫連接區 (Google Sheets)
// =========================================================

let products = []; 

async function fetchDataFromDatabase() {
    // 1. 設定你的 Google Sheet ID 和工作表名稱
    const spreadsheetId = '1gY5KxQJqWpMv3XF-xOqV_5_p65zZtOq2wE8-y6y6o9E'; 
    const sheetName = 'Sheet1'; // 預設通常是 "工作表1" 或 "Sheet1"

    // 使用 opensheet API 將 Google Sheet 轉為 JSON
    const apiUrl = `https://opensheet.elk.sh/${spreadsheetId}/${sheetName}`;

    try {
        console.log("正在從 Google Sheet 載入資料...");
        const response = await fetch(apiUrl);
        
        if (!response.ok) throw new Error("網路回應不正常");
        
        const rawData = await response.json();

        // 2. 資料清洗 (Data Parsing)
        // Google Sheet 下來的資料全部都是字串，我們需要把 OS 和 Drivers 轉回陣列
        const processedData = rawData.map(item => {
            return {
                ...item,
                // 處理 FormFactor (如果沒填預設 PCIE)
                formFactor: item.formFactor || 'PCIE',
                
                // 處理 OS: 字串 "Win, Linux" -> 陣列 ["Win", "Linux"]
                os: item.os ? item.os.split(',').map(s => s.trim()) : [],

                // 處理 Drivers: JSON 字串 -> 物件陣列
                // 試算表中要填: [{"os":"Win","ver":"1.0"}]
                drivers: parseDrivers(item.drivers)
            };
        });

        console.log("資料載入成功:", processedData);
        return processedData;

    } catch (error) {
        console.error("資料庫讀取失敗:", error);
        // 如果失敗，可以在這裡回傳空陣列，或者回傳備份的本地資料
        return [];
    }
}

// 輔助函式：解析 Drivers JSON 字串，避免格式錯誤導致當機
function parseDrivers(jsonString) {
    if (!jsonString) return [];
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn("Driver 格式錯誤:", jsonString);
        return [];
    }

}
