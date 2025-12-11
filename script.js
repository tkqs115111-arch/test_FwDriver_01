// =========================================================
//  PART 1: 設定與 API 串接
// =========================================================

const SPREADSHEET_ID = '1tJjquBs-Wyav4VEg7XF-BnTAGoWhE-5RFwwhU16GuwQ'; 
const TARGET_SHEETS = ['Windows', 'RHEL', 'Oracle', 'ESXi', 'FW'];

let allProducts = []; // 原始完整資料
let groups = [
    { id: 'g1', name: '群組 1', items: [] }, 
    { id: 'g2', name: '群組 2', items: [] }
];
let activeGroupId = 'g1';
let currentView = 'search'; // 'search' 或 'group'

// =========================================================
//  PART 2: 初始化與資料抓取
// =========================================================

async function initData() {
    renderGroupsSidebar(); // 先畫出右邊空的群組

    const sheetsPromises = TARGET_SHEETS.map(name => fetchSheetData(name));
    let sheetsData = [];
    
    try {
        sheetsData = await Promise.all(sheetsPromises);
    } catch (e) {
        document.getElementById('productContainer').innerHTML = '<div class="no-results">資料載入失敗，請檢查網路。</div>';
        return;
    }

    // --- 資料整合邏輯 (同原版) ---
    let aggregatedMap = {};

    sheetsData.forEach((sheet, index) => {
        if (!Array.isArray(sheet)) return;
        const currentSheetName = TARGET_SHEETS[index];
        const isFwSheet = (currentSheetName === 'FW');

        let lastComponent = ''; 
        let lastVendor = '';    

        sheet.forEach(item => {
            const desc = item.description || item.Description || item['Model Name'];
            let rawComp = item.component || item.Component; 
            let rawVendor = item.vendor || item.Vendor;
            const swid = item.swid || item.SWID;
            const fwVer = item['FW Version'] || item['FW'] || item.Version || item.FW;
            const driverVer = item.driver || item.Driver || item.Version;
            const osVer = item.os || item.OS;

            if (!desc) return;

            // 自動填滿 Component/Vendor
            if (rawComp && rawComp.trim() !== '') lastComponent = rawComp; else rawComp = lastComponent;
            if (rawVendor && rawVendor.trim() !== '') lastVendor = rawVendor; else rawVendor = lastVendor;

            const modelKey = desc.trim();

            if (!aggregatedMap[modelKey]) {
                aggregatedMap[modelKey] = {
                    id: swid || 'N/A',            
                    model: desc, 
                    brand: rawVendor || 'Generic',
                    type: rawComp || 'N/A',    
                    fw: 'N/A',
                    drivers: [] 
                };
            }

            if (isFwSheet) {
                if (fwVer) aggregatedMap[modelKey].fw = fwVer;
                if (swid) aggregatedMap[modelKey].id = swid;
            } else {
                aggregatedMap[modelKey].drivers.push({
                    os: osVer || currentSheetName, 
                    ver: driverVer || 'N/A'
                });
            }
        });
    });

    allProducts = Object.values(aggregatedMap);
    
    // 初始化完成
    renderSidebarMenu(); // 左側選單
    renderProducts(allProducts, 'search'); // 中間卡片
}

async function fetchSheetData(sheetName) {
    try {
        const response = await fetch(`https://opensheet.elk.sh/${SPREADSHEET_ID}/${sheetName}`);
        return response.ok ? await response.json() : [];
    } catch (error) {
        return [];
    }
}

// =========================================================
//  PART 3: 渲染卡片 (核心 UI 更新)
// =========================================================

function renderProducts(data, viewType) {
    const container = document.getElementById('productContainer');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = '<div class="no-results">找不到符合條件的資料</div>';
        return;
    }

    data.forEach((product) => {
        // 為了 UI 簡潔，我們取第一個 Driver 版本顯示，或顯示 "Multiple"
        let displayDriver = "N/A";
        if (product.drivers.length > 0) {
            displayDriver = product.drivers[0].ver; 
        }

        // 判斷是否已在當前群組
        const currentGroup = groups.find(g => g.id === activeGroupId);
        const isAdded = currentGroup.items.some(i => i.model === product.model); // 使用 model name 判斷唯一性

        // 產生按鈕 HTML
        let btnHtml, btnAction;
        if (viewType === 'group') {
            btnHtml = '<div class="btn-add-wrapper remove-mode">-</div>';
            btnAction = `removeFromGroup('${product.model}')`;
        } else {
            // Search Mode
            if (isAdded) {
                btnHtml = '<div class="btn-add-wrapper added">✓</div>';
                btnAction = ''; 
            } else {
                btnHtml = '<div class="btn-add-wrapper">+</div>';
                btnAction = `addToGroup('${product.model}')`;
            }
        }

        // 模擬產生升刷指令 (因為 Sheet 沒提供)
        const mockCmd = generateCommand(product);

        const html = `
        <div class="hw-card">
            <div class="card-header">
                <div onclick="${btnAction}">${btnHtml}</div>
                
                <div class="card-info">
                    <div class="info-item" style="flex:2;">
                        <span class="info-label">型號</span>
                        <span class="val-model" title="${product.model}">${product.model}</span>
                    </div>
                    <div class="info-item" style="flex:1;">
                        <span class="info-label">Driver</span>
                        <span class="val-driver">${displayDriver}</span>
                    </div>
                    <div class="info-item" style="flex:1;">
                        <span class="info-label">FW</span>
                        <span class="val-fw">${product.fw}</span>
                    </div>
                </div>

                <div class="btn-detail-text" onclick="toggleDetails(this)">詳細 ▼</div>
            </div>

            <div class="card-details">
                <span class="info-label">升刷指令:</span>
                <span class="cmd-line">${mockCmd}</span>
                <span class="info-label">SWID / ID:</span>
                <span class="swid-text">${product.id}</span>
            </div>
        </div>`;
        
        container.innerHTML += html;
    });
}

// 輔助: 產生模擬指令
function generateCommand(product) {
    const brand = product.brand.toLowerCase();
    const id = product.id !== 'N/A' ? product.id : 'DEVICE_ID';
    
    if (brand.includes('intel')) return `nvmupdate64e -l log.txt -c nvmupdate.cfg -id ${id}`;
    if (brand.includes('mellanox') || brand.includes('nvidia')) return `mstflint -d 00:03.0 -i ${id}.bin burn`;
    if (brand.includes('broadcom')) return `bnxtnvm -dev=00:00.0 -force -y upgrade_fw`;
    return `fw_update_tool --device ${product.model} --firmware ${product.fw}.bin`;
}

// =========================================================
//  PART 4: 群組管理邏輯
// =========================================================

function renderGroupsSidebar() {
    const wrapper = document.getElementById('groups-wrapper');
    wrapper.innerHTML = '';

    groups.forEach(g => {
        const isActive = (g.id === activeGroupId);
        
        // 群組內的小清單
        let itemsHtml = '';
        if (g.items.length === 0) {
            itemsHtml = '<div class="empty-hint">尚未加入卡片</div>';
        } else {
            g.items.forEach(item => {
                // 簡短顯示
                itemsHtml += `<div class="mini-item">▪ ${item.model.substring(0, 25)}...</div>`;
            });
        }

        const html = `
        <div class="group-box ${isActive ? 'active' : ''}" onclick="setActiveGroup('${g.id}', event)">
            <div class="group-header">
                <input type="text" class="group-name-input" value="${g.name}" 
                       onchange="updateGroupName('${g.id}', this.value)" onclick="event.stopPropagation()">
                <button class="btn-load-group" onclick="loadGroupView('${g.id}'); event.stopPropagation();">查看</button>
            </div>
            <div class="group-items-list">
                ${itemsHtml}
            </div>
        </div>`;
        wrapper.innerHTML += html;
    });

    const activeGroup = groups.find(g => g.id === activeGroupId);
    if(activeGroup) {
        document.getElementById('active-group-name').innerText = activeGroup.name;
    }
}

function createNewGroup() {
    const newId = 'g' + Date.now();
    groups.push({ id: newId, name: '新配置群組', items: [] });
    activeGroupId = newId;
    renderGroupsSidebar();
    
    // 如果在搜尋模式，刷新一下以更新 + 號狀態
    if(currentView === 'search') applyFilters(); 
}

function setActiveGroup(gid) {
    activeGroupId = gid;
    renderGroupsSidebar();
    if(currentView === 'search') applyFilters();
}

function updateGroupName(gid, newName) {
    const group = groups.find(g => g.id === gid);
    if(group) group.name = newName;
    // 不用重新 renderSidebar，因為 input 本身已變更，除非要更新 header 文字
    document.getElementById('active-group-name').innerText = newName;
}

function addToGroup(modelName) {
    const group = groups.find(g => g.id === activeGroupId);
    const product = allProducts.find(p => p.model === modelName);
    
    if (product && !group.items.find(i => i.model === modelName)) {
        group.items.push(product);
        renderGroupsSidebar();
        // 刷新目前卡片以將 + 變勾勾
        applyFilters(); 
    }
}

function removeFromGroup(modelName) {
    const group = groups.find(g => g.id === activeGroupId);
    group.items = group.items.filter(i => i.model !== modelName);
    renderGroupsSidebar();
    // 重新渲染群組視圖
    renderProducts(group.items, 'group');
}

function loadGroupView(gid) {
    currentView = 'group';
    activeGroupId = gid;
    const group = groups.find(g => g.id === gid);
    
    document.getElementById('view-title').innerText = `檢視內容: ${group.name}`;
    document.getElementById('view-title').style.color = 'var(--group-border)';
    document.getElementById('searchInput').value = ''; // 清空搜尋
    
    renderGroupsSidebar(); // 更新高亮
    renderProducts(group.items, 'group');
}

// =========================================================
//  PART 5: UI 互動與篩選
// =========================================================

function toggleDetails(btn) {
    const details = btn.parentElement.nextElementSibling;
    if (details.style.display === "block") {
        details.style.display = "none";
        btn.innerText = "詳細 ▼";
        btn.style.color = "var(--accent-green)";
    } else {
        details.style.display = "block";
        btn.innerText = "收起 ▲";
        btn.style.color = "#e74c3c";
    }
}

function renderSidebarMenu() {
    const menu = document.getElementById('sidebarMenu');
    menu.innerHTML = '';
    
    // 取得所有 Brand
    const brands = [...new Set(allProducts.map(p => p.brand))].sort();

    brands.forEach(brand => {
        // 找出該 Brand 下的所有 Model
        const models = allProducts.filter(p => p.brand === brand).map(p => p.model);
        
        let subItems = models.map(m => 
            `<li class="menu-item" onclick="filterByModel('${m}')">${m}</li>`
        ).join('');

        menu.innerHTML += `
        <li>
            <div class="menu-item" onclick="toggleSubMenu(this)">
                ${brand} <span style="float:right; font-size:10px;">▼</span>
            </div>
            <ul class="submenu">${subItems}</ul>
        </li>`;
    });
}

function toggleSubMenu(el) {
    el.nextElementSibling.classList.toggle('open');
}

function filterByModel(model) {
    document.getElementById('searchInput').value = model;
    applyFilters();
}

function applyFilters() {
    currentView = 'search';
    document.getElementById('view-title').innerText = "搜尋模式";
    document.getElementById('view-title').style.color = "#555";

    const kw = document.getElementById('searchInput').value.toLowerCase();
    
    const filtered = allProducts.filter(p => 
        p.model.toLowerCase().includes(kw) || 
        p.brand.toLowerCase().includes(kw) ||
        p.type.toLowerCase().includes(kw)
    );
    
    renderProducts(filtered, 'search');
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    applyFilters();
}

// 按 Enter 搜尋
document.getElementById("searchInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") applyFilters();
});

// 啟動
window.onload = initData;