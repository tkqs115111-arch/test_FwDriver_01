// =========================================================
//  PART 1: 設定與 API
// =========================================================
const SPREADSHEET_ID = '1tJjquBs-Wyav4VEg7XF-BnTAGoWhE-5RFwwhU16GuwQ'; 

const TARGET_SHEETS = ['Windows', 'RHEL', 'Oracle', 'ESXi', 'FW']; 

let OS_LIST = ['Windows', 'RHEL']; 

const STORAGE_KEY = 'HCL_CONFIG_DATA_V5'; 

const COLOR_PALETTE = [
    '#8e44ad', '#2980b9', '#27ae60', '#f39c12', '#c0392b', '#34495e'
];

let allProducts = [];
let groups = [ { id: 'g1', name: '預設群組', items: [], os: 'Windows', color: COLOR_PALETTE[0] } ];
let activeGroupId = 'g1';
let currentView = 'search';

// =========================================================
//  PART 2: 初始化與資料處理
// =========================================================
async function initData() {
    loadFromLocalStorage(); 
    initGlobalOSSelector(); 
    renderGroupsSidebar(); 
    
    document.getElementById('result-count').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 資料庫同步中...';

    const sheetsPromises = TARGET_SHEETS.map(name => fetchSheetData(name));
    let sheetsData = [];
    try { 
        sheetsData = await Promise.all(sheetsPromises); 
    } catch (e) { 
        document.getElementById('productContainer').innerHTML = '<div class="no-results">資料載入失敗，請檢查網路或 Sheet ID。</div>'; 
        return; 
    }

    let aggregatedMap = {};
    let detectedOS = new Set(); 

    sheetsData.forEach((sheet, index) => {
        if (!Array.isArray(sheet)) return;
        const currentSheetName = TARGET_SHEETS[index];
        const isFwSheet = (currentSheetName === 'FW');

        let lastValidModel = null;
        let lastValidBrand = 'Generic';
        let lastValidType = 'Component';

        sheet.forEach(item => {
            let rawDesc = item.description || item.Description || item['Model Name'] || item.Model;
            let rawBrand = item.vendor || item.Vendor;
            let rawType = item.component || item.Component;

            // [向下填補]
            if (rawDesc && rawDesc.trim() !== "") {
                lastValidModel = rawDesc.trim();
                if (rawBrand) lastValidBrand = rawBrand;
                if (rawType) lastValidType = rawType;
            }
            
            if (!lastValidModel) return;

            const modelKey = lastValidModel;
            const brandKey = rawBrand || lastValidBrand;
            const typeKey = rawType || lastValidType;

            if (!aggregatedMap[modelKey]) {
                aggregatedMap[modelKey] = {
                    id: item.swid || item.SWID || 'N/A', 
                    model: modelKey, 
                    brand: brandKey,
                    type: typeKey,    
                    fw: 'N/A',
                    drivers: [] 
                };
            }

            if (isFwSheet) {
                if (item['FW Version'] || item.FW) aggregatedMap[modelKey].fw = item['FW Version'] || item.FW;
                if (item.swid || item.SWID) aggregatedMap[modelKey].id = item.swid || item.SWID;
            } else {
                let rawOS = item['Operating System'] || item.OS || item.os || currentSheetName;
                // 資料清洗
                let specificOS = rawOS.replace(/\(.*\)/g, '').trim();

                if (specificOS) {
                    detectedOS.add(specificOS);
                    aggregatedMap[modelKey].drivers.push({
                        os: specificOS, 
                        ver: item.driver || item.Driver || item.Version || 'N/A'
                    });
                }
            }
        });
    });

    if(detectedOS.size > 0) {
        OS_LIST = Array.from(detectedOS).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
    }
    
    initGlobalOSSelector();
    renderGroupsSidebar(); 

    allProducts = Object.values(aggregatedMap);
    renderSidebarMenu();
    showDashboard();
}

function showDashboard() {
    currentView = 'search';
    
    const currentOS = document.getElementById('global-os-select') ? document.getElementById('global-os-select').value : 'Windows';
    updateStatusBar(currentOS, allProducts.length);

    document.getElementById('productContainer').innerHTML = `
        <div class="welcome-dashboard">
            <div class="welcome-icon-circle"><i class="fas fa-server"></i></div>
            <h2>Firmware & Driver HCL Tool</h2>
            <p>請輸入型號搜尋，或由左側選單瀏覽</p>
            <div class="quick-links">
                <div class="quick-card" onclick="filterByBrand('Intel')"><i class="fas fa-microchip"></i><span>Intel</span></div>
                <div class="quick-card" onclick="filterByBrand('Mellanox')"><i class="fas fa-network-wired"></i><span>Mellanox</span></div>
                <div class="quick-card" onclick="filterByBrand('Broadcom')"><i class="fas fa-hdd"></i><span>Broadcom</span></div>
            </div>
            <div class="instruction-step">
                <small><i class="fas fa-info-circle"></i> 提示：左側選單已啟用自動縮合功能；支援 Excel 自動填補。</small>
            </div>
        </div>
    `;
}

function updateStatusBar(osName, count) {
    const statusBar = document.getElementById('result-count');
    if (statusBar) {
        statusBar.innerHTML = `顯示 OS: <span style="font-weight:bold;">${osName}</span> <span style="color:#ddd; margin:0 5px;">|</span> 資料庫: ${count} 筆`;
    }
}

function filterByBrand(brandName) {
    document.getElementById('searchInput').value = brandName;
    applyFilters();
}

async function fetchSheetData(sheetName) {
    try {
        const response = await fetch(`https://opensheet.elk.sh/${SPREADSHEET_ID}/${sheetName}`);
        return response.ok ? await response.json() : [];
    } catch (error) { return []; }
}

function initGlobalOSSelector() {
    const sel = document.getElementById('global-os-select');
    if(sel) {
        const listToUse = OS_LIST.length > 0 ? OS_LIST : ['Windows'];
        sel.innerHTML = listToUse.map(os => `<option value="${os}">${os}</option>`).join('');
    }
}

// =========================================================
//  PART 3: 渲染列表
// =========================================================

function parseOS(originalString) {
    if(!originalString) return { mainName: "Unknown", tag: "", badgeColorClass: "" };
    let str = originalString;
    let mainName = str;
    let tag = "";
    let badgeColorClass = "os-badge"; 

    if (str.includes("Windows")) {
        mainName = "Windows"; badgeColorClass += " badge-blue";
        if (str.includes("2025")) tag = "2025";
        else if (str.includes("2022")) tag = "2022";
        else if (str.includes("2019")) tag = "2019";
        else tag = "Server";
    } 
    else if (str.includes("Red Hat") || str.includes("RHEL")) {
        mainName = "RHEL"; badgeColorClass += " badge-red";
        const versionMatch = str.match(/(\d+(\.\d+)?)/);
        if (versionMatch) tag = versionMatch[0];
    }
    else if (str.includes("Ubuntu")) {
        mainName = "Ubuntu"; badgeColorClass += " badge-green";
        const versionMatch = str.match(/(\d+(\.\d+)?)/);
        if (versionMatch) tag = versionMatch[0];
    }
    else if (str.includes("ESXi")) {
        mainName = "ESXi"; badgeColorClass += " badge-green"; 
        const versionMatch = str.match(/(\d+(\.\d+)?)/);
        if (versionMatch) tag = versionMatch[0];
    }
    else if (str.includes("Oracle")) {
        mainName = "Oracle"; badgeColorClass += " badge-red";
        const versionMatch = str.match(/(\d+(\.\d+)?)/);
        if (versionMatch) tag = versionMatch[0];
    }
    return { mainName, tag, badgeColorClass };
}

function renderProducts(data, viewType) {
    const container = document.getElementById('productContainer');
    container.innerHTML = '';

    let targetOS = OS_LIST[0]; 
    if (viewType === 'group') {
        const currentGroup = groups.find(g => g.id === activeGroupId);
        if (currentGroup) targetOS = currentGroup.os;
    } else {
        const globalSel = document.getElementById('global-os-select');
        if (globalSel) targetOS = globalSel.value;
    }

    updateStatusBar(targetOS, data.length);

    if (data.length === 0) {
        container.innerHTML = '<div class="no-results">找不到符合條件的資料</div>';
        return;
    }

    const osInfo = parseOS(targetOS);
    const osDisplayHtml = osInfo.tag 
        ? `${osInfo.mainName} <span class="${osInfo.badgeColorClass}">${osInfo.tag}</span>` 
        : osInfo.mainName;

    data.forEach((product) => {
        const driverObj = product.drivers.find(d => d.os === targetOS);
        let displayDriver = "N/A";
        let statusClass = "val-driver";

        if (driverObj) {
            displayDriver = driverObj.ver;
            const lowerVer = displayDriver.toLowerCase();
            if (lowerVer.includes('not support') || lowerVer === 'n/a' || lowerVer === '') {
                statusClass = "status-unsupported";
                if(lowerVer === 'n/a' || lowerVer === '') displayDriver = "Not Listed";
            } else {
                statusClass = "status-supported";
            }
        } else {
            displayDriver = "Unknown"; statusClass = "status-unknown";
        }

        const currentGroup = groups.find(g => g.id === activeGroupId);
        const isAdded = currentGroup.items.some(i => i.model === product.model);
        
        let btnClass = isAdded ? 'active' : '';
        let btnIcon = isAdded ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>';
        let btnAction = `addToGroup('${product.model}')`;
        
        if (viewType === 'group') {
            btnClass = 'remove'; btnIcon = '<i class="fas fa-minus"></i>'; btnAction = `removeFromGroup('${product.model}')`;
        } else if (isAdded) {
            btnAction = `removeFromGroup('${product.model}')`;
        }

        const html = `
        <div class="hw-row-card">
            <div class="row-main-content">
                <div class="row-header">
                    <div class="row-model-title" title="${product.model}">${product.model}</div>
                    <div class="row-brand-badge">${product.brand}</div>
                </div>
                <div class="row-body">
                    <div class="data-group">
                        <div class="data-item">
                            <span class="data-label">FW Version</span>
                            <span class="data-val val-fw">${product.fw}</span>
                        </div>
                        <div class="data-item">
                            <span class="data-label">Driver for ${osDisplayHtml}</span>
                            <span class="data-val ${statusClass}">${displayDriver}</span>
                        </div>
                    </div>
                    <div class="action-group">
                        <div class="btn-expand-text" onclick="toggleDetails(this)">詳細 <i class="fas fa-chevron-down"></i></div>
                        <div class="btn-circle ${btnClass}" onclick="${btnAction}">${btnIcon}</div>
                    </div>
                </div>
            </div>
            <div class="row-details-panel">
                <div style="margin-bottom:5px; font-weight:bold; color:#666;">升刷指令:</div>
                <code class="cmd-code">${generateCommand(product)}</code>
                <div style="margin-top:10px; font-size:12px; color:#999;">SWID: ${product.id}</div>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}

function generateCommand(product) {
    const brand = product.brand.toLowerCase();
    const id = product.id !== 'N/A' ? product.id : 'DEVICE_ID';
    if (brand.includes('intel')) return `nvmupdate64e -l log.txt -c nvmupdate.cfg -id ${id}`;
    if (brand.includes('mellanox') || brand.includes('nvidia')) return `mstflint -d 00:03.0 -i ${id}.bin burn`;
    return `fw_update_tool --device "${product.model}" --firmware ${product.fw}.bin`;
}

function toggleDetails(btn) {
    const panel = btn.closest('.hw-row-card').querySelector('.row-details-panel');
    const icon = btn.querySelector('i');
    if (panel.style.display === 'block') { panel.style.display = 'none'; icon.classList.replace('fa-chevron-up', 'fa-chevron-down'); }
    else { panel.style.display = 'block'; icon.classList.replace('fa-chevron-down', 'fa-chevron-up'); }
}

// =========================================================
//  PART 4: 群組管理
// =========================================================

function renderGroupsSidebar() {
    const wrapper = document.getElementById('groups-wrapper');
    wrapper.innerHTML = '';

    groups.forEach(g => {
        const isActive = (g.id === activeGroupId);
        if(!g.os) g.os = OS_LIST[0] || 'Windows'; 
        if(!g.color) g.color = COLOR_PALETTE[0];

        const optionsHtml = OS_LIST.map(os => 
            `<option value="${os}" ${g.os === os ? 'selected' : ''}>${os}</option>`
        ).join('');

        const colorDotsHtml = COLOR_PALETTE.map(color => {
            const isSelected = (g.color === color) ? 'selected' : '';
            return `<div class="color-dot ${isSelected}" 
                        style="background-color: ${color};" 
                        onclick="updateGroupColor('${g.id}', '${color}', event)">
                    </div>`;
        }).join('');

        const activeStyle = isActive 
            ? `border-left-color: ${g.color}; box-shadow: 0 0 0 4px ${g.color}99; transform: scale(1.02); z-index: 10;` 
            : `border-left-color: ${g.color};`;

        let itemsHtml = g.items.length === 0 
            ? '<div style="color:#ccc;font-style:italic;padding:5px;text-align:center;">無項目</div>' 
            : g.items.map(i => {
                const maxLen = 25;
                const displayName = i.model.length > maxLen ? i.model.substring(0, maxLen) + '...' : i.model;
                return `<div style="border-bottom:1px solid #eee;padding:4px 2px;">${displayName}</div>`;
            }).join('');
        
        wrapper.innerHTML += `
        <div class="group-box ${isActive ? 'active' : ''}" 
             id="group-box-${g.id}"
             style="${activeStyle}" 
             onclick="setActiveGroup('${g.id}', event)">
             
            <div class="group-header">
                <input class="group-name-input" value="${g.name}" onchange="updateGroupName('${g.id}',this.value)" onclick="event.stopPropagation()">
                <div style="display:flex; align-items:center;">
                    <i class="fas fa-pen btn-edit-group" onclick="toggleGroupEditMode('${g.id}', this, event)"></i>
                    <i class="fas fa-trash-alt" style="color:#d93025;cursor:pointer;font-size:12px;padding:5px;" onclick="deleteGroup('${g.id}', event)"></i>
                </div>
            </div>
            
            <div class="group-color-picker" onclick="event.stopPropagation()">
                ${colorDotsHtml}
            </div>
            
            <div class="group-os-box">
                <span class="group-os-label"><i class="fas fa-desktop"></i> 目標 OS:</span>
                <select class="group-os-select" onchange="updateGroupOS('${g.id}', this.value)" onclick="event.stopPropagation()">
                    ${optionsHtml}
                </select>
            </div>

            <div class="group-items-list">${itemsHtml}</div>
            
            <div class="group-actions">
                <i class="fas fa-file-export btn-icon btn-export-icon" title="導出 CSV" onclick="exportGroupToCSV('${g.id}', event)"></i>
                <i class="fas fa-eye btn-icon btn-view-icon" title="檢視清單" onclick="loadGroupView('${g.id}'); event.stopPropagation()"></i>
            </div>
        </div>`;
    });
    
    const activeGroup = groups.find(g => g.id === activeGroupId);
    if(activeGroup) {
        const titleElem = document.getElementById('active-group-name');
        if(titleElem) {
            titleElem.innerText = activeGroup.name;
            titleElem.style.color = activeGroup.color; 
        }
        
        const centerTargetElem = document.getElementById('target-group-name');
        if(centerTargetElem) {
            centerTargetElem.innerText = activeGroup.name;
            centerTargetElem.style.color = activeGroup.color;
        }
    }
}

function toggleGroupEditMode(gid, btn, event) {
    event.stopPropagation();
    const groupBox = document.getElementById(`group-box-${gid}`);
    groupBox.classList.toggle('editing');
    
    const isEditing = groupBox.classList.contains('editing');
    if (isEditing) {
        btn.classList.replace('fa-pen', 'fa-check');
        btn.style.color = 'var(--status-green)';
    } else {
        btn.classList.replace('fa-check', 'fa-pen');
        btn.style.color = '';
    }
}

function updateGroupColor(gid, newColor, event) {
    if(event) event.stopPropagation();
    const g = groups.find(x => x.id === gid);
    if(g) {
        g.color = newColor;
        saveToLocalStorage();
        renderGroupsSidebar(); 
    }
}

function updateGroupOS(gid, newOS) {
    const g = groups.find(x => x.id === gid);
    if(g) {
        g.os = newOS;
        saveToLocalStorage();
        if(currentView === 'group' && activeGroupId === gid) loadGroupView(gid);
    }
}

function saveToLocalStorage() { localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); }

function loadFromLocalStorage() {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
        try { groups = JSON.parse(savedData); 
              if (groups.length === 0) throw new Error();
              activeGroupId = groups[0].id; 
        } catch (e) { 
            groups = [ { id: 'g1', name: '預設群組', items: [], os: 'Windows', color: COLOR_PALETTE[0] } ]; 
            activeGroupId = 'g1'; 
        }
    }
}

// =========================================================
//  PART 5: 左側選單 & 視覺狀態管理
// =========================================================

function setActiveMenuItem(el) {
    const allMenuItems = document.querySelectorAll('.menu-item');
    allMenuItems.forEach(item => item.classList.remove('active'));
    if (!el) return;
    el.classList.add('active');
    if (el.classList.contains('menu-model')) {
        const submenuUl = el.closest('ul.submenu');
        if (submenuUl) {
            const vendorDiv = submenuUl.previousElementSibling;
            if (vendorDiv && vendorDiv.classList.contains('menu-vendor')) {
                vendorDiv.classList.add('active'); 
            }
        }
    }
}

function renderSidebarMenu() {
    const menu = document.getElementById('sidebarMenu'); menu.innerHTML = '';
    const components = [...new Set(allProducts.map(p => p.type))].filter(Boolean).sort();
    components.forEach(comp => {
        const vendors = [...new Set(allProducts.filter(p => p.type === comp).map(p => p.brand))].sort();
        let vendorHtml = vendors.map(v => {
            const models = allProducts.filter(p => p.type === comp && p.brand === v).map(p => p.model);
            return `<li>
                        <div class="menu-item menu-vendor" onclick="toggleSubMenu(this)">
                            ${v} <i class="fas fa-caret-right arrow"></i>
                        </div>
                        <ul class="submenu">
                            ${models.map(m => `
                                <li class="menu-item menu-model" onclick="filterByModel('${m}', this);event.stopPropagation()">
                                    ${m}
                                </li>`).join('')}
                        </ul>
                    </li>`;
        }).join('');
        
        menu.innerHTML += `<li><div class="menu-item menu-category" onclick="toggleSubMenu(this)">${comp} <i class="fas fa-caret-right arrow"></i></div><ul class="submenu">${vendorHtml}</ul></li>`;
    });
}

// [修改] 側邊欄點擊邏輯：手風琴效果 (自動關閉其他)
function toggleSubMenu(el) { 
    setActiveMenuItem(el); 
    
    const parentLi = el.parentElement;       
    const containerUl = parentLi.parentElement; 
    
    // 1. 找出同一層所有其他的項目，如果它們是打開的，就把它們關掉
    Array.from(containerUl.children).forEach(sibling => {
        if (sibling !== parentLi && sibling.classList.contains('open')) {
            sibling.classList.remove('open'); 
            // 也要把裡面的 submenu 藏起來 (確保箭頭和高度都重置)
            const subMenu = sibling.querySelector('.submenu');
            if (subMenu) subMenu.classList.remove('open');
        }
    });

    // 2. 切換自己的狀態
    el.nextElementSibling.classList.toggle('open'); 
    parentLi.classList.toggle('open'); 
}

function filterByModel(m, el) { 
    if(el) setActiveMenuItem(el); 
    document.getElementById('searchInput').value = m; 
    applyFilters(); 
    if (window.innerWidth <= 768) closeAllSidebars();
}

// =========================================================
//  PART 6: 輔助功能
// =========================================================

function createNewGroup() {
    const randomColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    groups.push({ id: 'g' + Date.now(), name: '新配置', items: [], os: OS_LIST[0] || 'Windows', color: randomColor });
    saveToLocalStorage();
    renderGroupsSidebar();
}

function setActiveGroup(gid, evt) {
    if(evt && (evt.target.tagName === 'INPUT' || evt.target.tagName === 'SELECT')) return;
    activeGroupId = gid;
    renderGroupsSidebar();
    
    if (currentView === 'group') {
        loadGroupView(gid);
    } else {
        applyFilters(); 
    }
}

function deleteGroup(gid, evt) {
    evt.stopPropagation();
    if(groups.length <= 1) return alert("至少保留一個");
    if(confirm("確定刪除此群組？")) {
        groups = groups.filter(g => g.id !== gid);
        if(gid === activeGroupId) activeGroupId = groups[0].id;
        saveToLocalStorage(); renderGroupsSidebar();
        if(currentView === 'group') { 
            clearFilters(); 
        }
    }
}

function updateGroupName(gid, val) { 
    const g = groups.find(x => x.id === gid);
    if(g) {
        g.name = val; 
        saveToLocalStorage();
        const titleElem = document.getElementById('active-group-name');
        if(titleElem && activeGroupId === gid) titleElem.innerText = val;
    }
}

function addToGroup(name) {
    const g = groups.find(x => x.id === activeGroupId);
    const p = allProducts.find(x => x.model === name);
    if(p && !g.items.find(x => x.model === name)) { 
        g.items.push(p); saveToLocalStorage(); renderGroupsSidebar(); 
        if(currentView === 'search') applyFilters(); else loadGroupView(activeGroupId); 
    }
}

function removeFromGroup(name) {
    const g = groups.find(x => x.id === activeGroupId);
    g.items = g.items.filter(x => x.model !== name);
    saveToLocalStorage(); renderGroupsSidebar();
    if (currentView === 'search') applyFilters(); else renderProducts(g.items, 'group');
}

function loadGroupView(gid) { 
    currentView = 'group'; activeGroupId = gid; renderGroupsSidebar(); 
    renderProducts(groups.find(g => g.id === gid).items, 'group'); 
}

function exportGroupToCSV(gid, evt) {
    evt.stopPropagation();
    const g = groups.find(x => x.id === gid);
    if(!g.items.length) return alert("無資料可導出");
    let content = "Type,Brand,Model,FW_Version,Target_OS,Driver_Version,SWID,Update_Command\n";
    g.items.forEach(i => {
        const d = i.drivers.find(x => x.os === g.os);
        const drvVer = d ? d.ver : 'N/A';
        content += `${i.type},${i.brand},${i.model},${i.fw},${g.os},${drvVer},${i.id},${generateCommand(i).replace(/,/g,' ')}\n`;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;\uFEFF'}));
    a.download = `HCL_${g.name}_${g.os}.csv`; a.click();
}

function applyFilters() { 
    currentView = 'search'; 
    const kw = document.getElementById('searchInput').value.toLowerCase(); 
    renderProducts(allProducts.filter(p => p.model.toLowerCase().includes(kw) || p.brand.toLowerCase().includes(kw)), 'search'); 
}

function clearFilters() { 
    document.getElementById('searchInput').value = ''; 
    showDashboard(); 
}

function toggleSidebar(side) { 
    const s = document.getElementById(side==='left'?'sidebarLeft':'sidebarRight'); 
    const o = document.getElementById('overlay');
    if(s.classList.contains('active')) { s.classList.remove('active'); o.classList.remove('active'); }
    else { closeAllSidebars(); s.classList.add('active'); o.classList.add('active'); }
}

function closeAllSidebars() { document.getElementById('sidebarLeft').classList.remove('active'); document.getElementById('sidebarRight').classList.remove('active'); document.getElementById('overlay').classList.remove('active'); }

document.getElementById("searchInput").addEventListener("keypress", e => { if(e.key==="Enter") applyFilters(); });

window.onload = initData;