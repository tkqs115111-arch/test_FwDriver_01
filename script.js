// =========================================================
//  PART 1: 資料庫連接與矩陣轉換
// =========================================================

let products = []; 

// 設定你要抓取的「伺服器型號」欄位名稱 (對應 Google Sheet 的 Header)
// 這樣如果以後有新機器，只要加在這個陣列裡就好
const SERVER_MODELS = ["RX2530_M7", "RX2540_M7"]; 

async function fetchDataFromDatabase() {
    // 範例：這裡填入你的 Google Sheet ID
    const spreadsheetId = '2PACX-1vShstGLIVRLUcHIComi18vRJP1dhfroruuEEVrIqmOLA-B5SIV-HKh_zX7ac6GRcpg34DC-i8Al7pn-';
    const sheetName = 'Sheet1';
    // const apiUrl = `https://opensheet.elk.sh/${spreadsheetId}/${sheetName}`;

    try {
        // --- 模擬從 Google Sheet 讀到的原始資料 (包含空值與合併儲存格現象) ---
        // 注意：這模擬了圖片中的結構，Component 只在第一行出現
        const rawData = [
            { "Component": "Chipset", "Vendor": "Intel", "Description": "Intel QAT", "OS": "Win Svr 2022", "RX2530_M7": "2.5.0", "RX2540_M7": "n/a" },
            { "Component": "",        "Vendor": "",      "Description": "Intel QAT", "OS": "Win Svr 2019", "RX2530_M7": "2.4.0", "RX2540_M7": "n/a" },
            { "Component": "",        "Vendor": "",      "Description": "Intel SGX", "OS": "Win Svr 2025", "RX2530_M7": "",      "RX2540_M7": "" }, // 假設這行沒驅動
            { "Component": "",        "Vendor": "",      "Description": "Intel C741", "OS": "Win Svr 2025", "RX2530_M7": "19928", "RX2540_M7": "19928" },
            { "Component": "Graphic", "Vendor": "Fujitsu", "Description": "iRMC S6",  "OS": "Win Svr 2025", "RX2530_M7": "1.15.3", "RX2540_M7": "1.15.3" }
        ];
        
        // 若接上真實 API，請打開下面這行：
        // const response = await fetch(apiUrl); const rawData = await response.json();

        return processMatrixData(rawData);

    } catch (error) {
        console.error("資料處理失敗:", error);
        return [];
    }
}

/**
 * 核心演算法：處理合併儲存格與矩陣資料
 */
function processMatrixData(rawData) {
    const processedMap = new Map(); // 用來根據產品名稱分組
    
    // 用來暫存上一列的資料 (處理合併儲存格用)
    let lastComponent = "";
    let lastVendor = "";

    rawData.forEach((row, index) => {
        // 1. 處理合併儲存格 (Fill Down)
        // 如果這一列的 Component 是空的，就沿用上一列的
        if (row.Component && row.Component.trim() !== "") {
            lastComponent = row.Component;
        }
        if (row.Vendor && row.Vendor.trim() !== "") {
            lastVendor = row.Vendor;
        }

        // 2. 取得基本資料
        const name = row.Description || "未命名";
        const os = row.OS || "Unknown OS";

        // 3. 檢查各個伺服器型號的驅動版本
        SERVER_MODELS.forEach(modelName => {
            const version = row[modelName]; // 取得該型號的版本號

            // 只有當版本號存在，且不是 "n/a" 或空值時才處理
            if (version && version.toLowerCase() !== "n/a" && version.trim() !== "") {
                
                // 如果這個產品還沒建立過，先建立卡片結構
                if (!processedMap.has(name)) {
                    processedMap.set(name, {
                        id: index, // 臨時 ID
                        name: name,
                        brand: lastVendor,
                        category: lastComponent,
                        spec: name, // 這裡暫時用 Description 當規格，你也可以指定其他欄位
                        os: [],     // 用 Set 來收集不重複的 OS
                        drivers: []
                    });
                }

                const product = processedMap.get(name);

                // 加入 OS (如果不重複)
                if (!product.os.includes(os)) {
                    product.os.push(os);
                }

                // 加入 Driver 資訊
                product.drivers.push({
                    os: os,
                    ver: version,
                    model: modelName.replace(/_/g, " ") // 把 RX2530_M7 轉成 RX2530 M7 顯示
                });
            }
        });
    });

    // 將 Map 轉回 Array
    return Array.from(processedMap.values());
}

// =========================================================
//  PART 2: 更新渲染邏輯 (顯示適用機型)
// =========================================================

function renderProducts(data) {
    const container = document.getElementById('productContainer');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="no-results">沒有找到符合條件的硬體</div>';
        return;
    }

    container.innerHTML = data.map(product => {
        const brandColor = getBrandColorVar(product.brand);
        const osTagsHtml = product.os.map(os => `<span class="os-pill">${os}</span>`).join('');
        
        // --- 修改重點：Driver 列表現在要顯示「適用機型」 ---
        let driversHtml = '<span style="color:#999; font-style:italic; font-size:13px;">無相容驅動</span>';
        
        if (product.drivers && product.drivers.length > 0) {
            // 我們可以簡單排序一下，讓相同 OS 的排在一起
            product.drivers.sort((a, b) => a.os.localeCompare(b.os));

            driversHtml = `<div class="driver-list">
                <div class="driver-header" style="display:flex; color:#888; font-size:12px; margin-bottom:4px; padding:0 4px;">
                    <span style="flex:1;">OS</span>
                    <span style="flex:1;">機型</span>
                    <span style="width:80px; text-align:right;">版本</span>
                </div>
                ${product.drivers.map(d => `
                    <div class="driver-item" style="display:flex; justify-content:space-between; font-size:13px; padding:4px; border-bottom:1px dashed #eee;">
                        <span style="flex:1; color:#555;">${d.os}</span>
                        <span style="flex:1; color:#0068B5; font-size:12px;">${d.model}</span>
                        <span style="width:80px; text-align:right; font-weight:bold; font-family:monospace;">${d.ver}</span>
                    </div>
                `).join('')}
            </div>`;
        }

        return `
        <div class="hw-card">
            <div class="card-header">
                <div class="card-title" title="${product.name}">${product.name}</div>
                <div class="brand-badge" style="background-color: ${brandColor}">${product.brand}</div>
            </div>
            
            <div class="card-body">
                <div class="spec-row">
                    <span class="spec-label">組件類型:</span>
                    <span class="spec-value">${product.category}</span>
                </div>
                
                <div class="driver-container">
                    ${driversHtml}
                </div>

                <div class="divider"></div>

                <div class="support-section">
                    <span class="support-label">支援系統總覽:</span>
                    <div class="os-tags">${osTagsHtml}</div>
                </div>
            </div>
        </div>
        `;
    }).join('');
}