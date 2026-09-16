import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  FileSpreadsheet, 
  Bell, 
  Plus, 
  Save, 
  RefreshCw, 
  Check, 
  AlertCircle,
  ExternalLink,
  Copy,
  CheckCircle2,
  Code
} from 'lucide-react';
import Modal from '../components/Modal';
import { fetchLiveSheetsData } from '../services/googleSheets';

export default function Settings({ users, onAddUser, showToast, webAppUrl, setWebAppUrl, onSyncLiveData }) {
  const [activeTab, setActiveTab] = useState('sheets');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Company Form
  const [companyName, setCompanyName] = useState('Hard2Soft Solutions Pvt Ltd');
  const [taxId, setTaxId] = useState('27AAACH2026F1Z5');
  const [currency, setCurrency] = useState('INR (₹)');
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST)');

  // User Form
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('Employee');
  const [userPassword, setUserPassword] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);

  // Handle opening user invite / edit modal
  const handleOpenUserModal = (existingUser = null) => {
    if (existingUser) {
      setEditingUserId(existingUser.id);
      setUserName(existingUser.name);
      setUserEmail(existingUser.email);
      setUserRole(existingUser.role);
      
      // Load current password from localStorage if exists
      try {
        const saved = localStorage.getItem('hard2soft_user_accounts');
        const map = saved ? JSON.parse(saved) : {};
        setUserPassword(map[existingUser.email]?.password || '******');
      } catch (e) {
        setUserPassword('');
      }
    } else {
      setEditingUserId(null);
      setUserName('');
      setUserEmail('');
      setUserRole('Employee');
      setUserPassword('');
    }
    setIsUserModalOpen(true);
  };

  // Google Sheets Sync State
  const [inputUrl, setInputUrl] = useState(webAppUrl || '');
  const [isTesting, setIsTesting] = useState(false);
  const [syncStatus, setSyncStatus] = useState(webAppUrl ? 'connected' : 'idle');
  const [syncMessage, setSyncMessage] = useState(webAppUrl ? 'Connected to live Google Apps Script API' : 'Direct live read active');

  // System Data Backup Handlers
  const handleExportSystemBackup = () => {
    try {
      const backupData = {
        purchases: localStorage.getItem('hard2soft_purchases') ? JSON.parse(localStorage.getItem('hard2soft_purchases')) : null,
        operatingExpenses: localStorage.getItem('hard2soft_operating_expenses') ? JSON.parse(localStorage.getItem('hard2soft_operating_expenses')) : null,
        manufacturing: localStorage.getItem('hard2soft_manufacturing') ? JSON.parse(localStorage.getItem('hard2soft_manufacturing')) : null,
        dispatch: localStorage.getItem('hard2soft_dispatch') ? JSON.parse(localStorage.getItem('hard2soft_dispatch')) : null,
        dispatch_local_map: localStorage.getItem('hard2soft_dispatch_local_map') ? JSON.parse(localStorage.getItem('hard2soft_dispatch_local_map')) : null,
        purchases_edited_map: localStorage.getItem('hard2soft_purchases_edited_map') ? JSON.parse(localStorage.getItem('hard2soft_purchases_edited_map')) : null,
        small_bag_price: localStorage.getItem('h2s_small_bag_price'),
        big_bag_price: localStorage.getItem('h2s_big_bag_price'),
        exportTimestamp: new Date().toISOString()
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hard2soft_inventory_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (showToast) showToast('System Data Backup exported successfully!');
    } catch (e) {
      console.error(e);
      if (showToast) showToast('Error exporting backup file', 'error');
    }
  };

  const handleImportSystemBackup = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.purchases) localStorage.setItem('hard2soft_purchases', JSON.stringify(data.purchases));
        if (data.operatingExpenses) localStorage.setItem('hard2soft_operating_expenses', JSON.stringify(data.operatingExpenses));
        if (data.manufacturing) localStorage.setItem('hard2soft_manufacturing', JSON.stringify(data.manufacturing));
        if (data.dispatch) localStorage.setItem('hard2soft_dispatch', JSON.stringify(data.dispatch));
        if (data.dispatch_local_map) localStorage.setItem('hard2soft_dispatch_local_map', JSON.stringify(data.dispatch_local_map));
        if (data.purchases_edited_map) localStorage.setItem('hard2soft_purchases_edited_map', JSON.stringify(data.purchases_edited_map));
        if (data.small_bag_price) localStorage.setItem('h2s_small_bag_price', String(data.small_bag_price));
        if (data.big_bag_price) localStorage.setItem('h2s_big_bag_price', String(data.big_bag_price));

        if (showToast) showToast('System Data Backup imported successfully! Reloading system...');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        console.error(err);
        if (showToast) showToast('Invalid backup JSON file', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Notification Config
  const [emailDigest, setEmailDigest] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dispatchConfirmations, setDispatchConfirmations] = useState(true);

  // Full 2-Way Real-Time Google Apps Script
  const appsScriptCode = `/**
 * HARD2SOFT INVENTORY OS - GOOGLE APPS SCRIPT BACKEND
 * Connects Web App directly to Google Sheets for 2-Way Real-Time Auto Updates
 * Target Workbook: HARD2SOFT INVENTORY TEST
 * Spreadsheet ID: 1GABauAaLQZbFYviOQjx8JY0BkpML7ZOpCftYpt4mFy8
 */

var SPREADSHEET_ID = "1GABauAaLQZbFYviOQjx8JY0BkpML7ZOpCftYpt4mFy8";
var SECRET_TOKEN = "H2S_SECURE_TOKEN_2026_INVENTORY_SECRET";

var SHEETS = {
  SALES_DISPATCH: "SALES & DISPATCH",
  DISPATCH_FALLBACK: "FINISHED GOODS DISPATCH",
  PURCHASES: "PURCHASES",
  MANUFACTURING: "DAILY MANUFACTURING",
  RAW_MATERIAL: "RAW MATERIAL",
  BOM: "BILL OF MATERIAL"
};

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    if (params.token && params.token !== SECRET_TOKEN) {
      return jsonResponse({ status: "error", message: "Invalid security token" });
    }
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var action = params.action || "ping";
    if (action === "ping") {
      return jsonResponse({ status: "success", message: "Hard2Soft Google Sheets Sync API is live and connected!", timestamp: new Date().toISOString() });
    }
    return jsonResponse({ status: "success", message: "Hard2Soft Webhook Ready" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.token !== SECRET_TOKEN) {
      return jsonResponse({ status: "error", message: "Unauthorized security token" });
    }
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var action = payload.action;
    var data = payload.data || {};

    if (action === "addSalesDispatch" || action === "updateSalesDispatch") {
      return handleSalesDispatchWrite(ss, action, data);
    }
    if (action === "deleteSalesDispatch") {
      return handleSalesDispatchDelete(ss, data);
    }
    if (action === "addPurchase") {
      return handlePurchaseAdd(ss, data);
    }
    if (action === "editPurchase" || action === "updatePurchase") {
      return handlePurchaseEdit(ss, data);
    }
    if (action === "deletePurchase") {
      return handlePurchaseDelete(ss, data);
    }
    if (action === "addManufacturing" || action === "updateManufacturing") {
      return handleManufacturingWrite(ss, action, data);
    }
    if (action === "deleteManufacturing") {
      return handleManufacturingDelete(ss, data);
    }
    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function handleSalesDispatchWrite(ss, action, data) {
  var sheet = ss.getSheetByName(SHEETS.SALES_DISPATCH) || ss.getSheetByName(SHEETS.DISPATCH_FALLBACK);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.SALES_DISPATCH);
    sheet.appendRow([
      "", "NOTE:", "SMALL COURIER BAG COST RS 5 AND BIG COST RS10 SR.NO./ORDER NO.", "DATE", "ORDER ID", "CHANNEL", "CUSTOMER NAME", 
      "STATE", "QTY", "SMALL BAGS", "BIG BAGS", "STATUS", 
      "DISPATCHED", "COURIER PARTNER", "TOTAL AMOUNT", "TAXABLE AMOUNT", 
      "IGST", "CGST", "SGST", "PAYMENT TYPE", "GST NO.", "PHONE NUMBER", 
      "EMAIL ID", "FEEDBACK", "REMARKS"
    ]);
  }
  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var targetSrNo = String(data.srNo || "").trim();
  var targetOrderId = String(data.orderId || data.id || "").trim();

  for (var i = 1; i < rows.length; i++) {
    var r0 = String(rows[i][0] || "").trim();
    var r2 = String(rows[i][2] || "").trim();
    var r4 = String(rows[i][4] || "").trim();
    if ((targetSrNo && (r0 === targetSrNo || r2 === targetSrNo)) ||
        (targetOrderId && (r0 === targetOrderId || r2 === targetOrderId || r4 === targetOrderId))) {
      rowIndex = i + 1;
      break;
    }
  }

  var colOffset = 0;
  if (rows.length > 0) {
    var header0 = String(rows[0][0] || "").trim();
    var header2 = String(rows[0][2] || "").trim();
    if (!header0 && header2) {
      colOffset = 2;
    }
  }

  var isDispatched = (data.dispatched === true || data.dispatched === "YES" || data.dispatched === "true" || data.dispatched === 1);

  var rowData = [
    data.srNo || "",
    data.date || formatDate(new Date()),
    data.orderId || (data.srNo ? "#" + data.srNo : ""),
    data.channel || "WEBSITE",
    String(data.customer || "").toUpperCase(),
    data.state || "MAHARASHTRA",
    Number(data.qty) || 1,
    Number(data.smallBags) || 0,
    Number(data.biggerBags !== undefined ? data.biggerBags : data.bigBags) || 0,
    data.status || "Delivered",
    isDispatched ? "YES" : "NO",
    data.courier || "DELHIVERY",
    Number(data.totalAmount) || 0,
    Number(data.taxableAmount) || 0,
    Number(data.igst) || 0,
    Number(data.cgst) || 0,
    Number(data.sgst) || 0,
    data.paymentType || "PREPAID",
    data.gstin || "-",
    data.phone || "-",
    data.email || "-",
    data.feedback || "Positive",
    data.remarks || ""
  ];

  var finalRow = colOffset === 2 ? ["", ""].concat(rowData) : rowData;

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, finalRow.length).setValues([finalRow]);
    return jsonResponse({ status: "success", message: "Updated Order in Sheet", row: rowIndex });
  } else {
    sheet.appendRow(finalRow);
    return jsonResponse({ status: "success", message: "Added Order to Sheet" });
  }
}

function handlePurchaseAdd(ss, data) {
  var sheet = ss.getSheetByName(SHEETS.PURCHASES) || ss.insertSheet(SHEETS.PURCHASES);
  var rowData = [
    data.id || "PO-" + sheet.getLastRow(),
    data.date || formatDate(new Date()),
    data.materialId || "RM001",
    data.material || "",
    Number(data.qty) || 0,
    data.unit || "KG",
    Number(data.unitPrice) || 0,
    data.supplier || "-",
    data.invoiceNo || "-",
    data.remarks || "Web App Entry"
  ];
  sheet.appendRow(rowData);
  return jsonResponse({ status: "success", message: "Added Purchase to Sheet" });
}

function handlePurchaseEdit(ss, data) {
  var sheet = ss.getSheetByName(SHEETS.PURCHASES);
  if (!sheet) return jsonResponse({ status: "error", message: "Sheet not found" });
  var rows = sheet.getDataRange().getValues();
  var targetPoId = String(data.id || "").trim();
  var rowIndex = -1;

  for (var i = 1; i < rows.length; i++) {
    var cellId = String(rows[i][0] || rows[i][1] || "").trim();
    if (cellId === targetPoId || (targetPoId.includes(cellId) && cellId.length > 2)) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowData = [
    data.id || "PO-001",
    data.date || formatDate(new Date()),
    data.materialId || "RM001",
    data.material || "",
    Number(data.qty) || 0,
    data.unit || "KG",
    Number(data.unitPrice) || 0,
    data.supplier || "-",
    data.invoiceNo || "-",
    data.remarks || "Updated from Web App"
  ];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    return jsonResponse({ status: "success", message: "Updated Purchase in Sheet", row: rowIndex });
  } else {
    sheet.appendRow(rowData);
    return jsonResponse({ status: "success", message: "Appended Purchase to Sheet" });
  }
}

function handleManufacturingWrite(ss, action, data) {
  var sheet = ss.getSheetByName(SHEETS.MANUFACTURING) || ss.insertSheet(SHEETS.MANUFACTURING);
  var rows = sheet.getDataRange().getValues();
  if (rows.length === 0) return jsonResponse({ status: "error", message: "Manufacturing sheet is empty" });

  var normTarget = String(data.batchNo || data.id || "").trim().toUpperCase().replace(/O/g, '0').replace(/[^A-Z0-9]/g, '');
  var rowIndex = -1;

  for (var i = 1; i < rows.length; i++) {
    var c2 = String(rows[i][2] || "").trim().toUpperCase().replace(/O/g, '0').replace(/[^A-Z0-9]/g, '');
    var c1 = String(rows[i][1] || "").trim().toUpperCase().replace(/O/g, '0').replace(/[^A-Z0-9]/g, '');
    var c0 = String(rows[i][0] || "").trim().toUpperCase().replace(/O/g, '0').replace(/[^A-Z0-9]/g, '');

    if (normTarget && (c2 === normTarget || c1 === normTarget || c0 === normTarget)) {
      rowIndex = i + 1;
      break;
    }
  }

  var m = data.actualMaterials || {};
  var qty = Number(data.qty) || 0;
  var sleeves = Number(data.sleevesUsed || m['RM014'] || qty);

  var mix = [
    m['RM001'] !== undefined ? Number(m['RM001']) : (qty * 0.5),
    m['RM002'] !== undefined ? Number(m['RM002']) : (qty * 0.5),
    m['RM003'] !== undefined ? Number(m['RM003']) : (qty * 1),
    m['RM004'] !== undefined ? Number(m['RM004']) : (qty * 1),
    m['RM005'] !== undefined ? Number(m['RM005']) : (qty * 1),
    m['RM006'] !== undefined ? Number(m['RM006']) : (qty * 1),
    m['RM007'] !== undefined ? Number(m['RM007']) : (qty * 1),
    m['RM008'] !== undefined ? Number(m['RM008']) : (qty * 1),
    m['RM009'] !== undefined ? Number(m['RM009']) : (qty * 1),
    m['RM010'] !== undefined ? Number(m['RM010']) : (qty * 2),
    m['RM011'] !== undefined ? Number(m['RM011']) : (qty * 1),
    m['RM012'] !== undefined ? Number(m['RM012']) : (qty * 1),
    m['RM013'] !== undefined ? Number(m['RM013']) : (qty * 1),
    m['RM014'] !== undefined ? Number(m['RM014']) : sleeves
  ];

  var rowData = [
    "",
    data.date || formatDate(new Date()),
    data.batchNo || data.id || "MFG-001",
    qty,
    sleeves,
    data.operator || "MAYURI",
    data.status || "Completed",
    data.remarks || ""
  ].concat(mix);

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    return jsonResponse({ status: "success", message: "Updated Manufacturing Batch " + (data.batchNo || data.id) + " in Sheet", row: rowIndex });
  } else {
    sheet.appendRow(rowData);
    return jsonResponse({ status: "success", message: "Added New Manufacturing Batch to Sheet" });
  }
}

/**
 * Helper to auto-fill RM001 through RM014 in Columns I to V for all existing rows
 */
function fillRawMaterialMixForExistingBatches() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.MANUFACTURING) || ss.getSheets()[0];
  if (!sheet) return;
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return;

  var rm1ColIndex = -1;
  var headers = rows[0];
  for (var h = 0; h < headers.length; h++) {
    var hText = String(headers[h] || "").trim().toUpperCase();
    if (hText === "RM001" || hText.indexOf("RM001") !== -1) {
      rm1ColIndex = h + 1;
      break;
    }
  }
  if (rm1ColIndex === -1) rm1ColIndex = 9;

  for (var i = 1; i < rows.length; i++) {
    var qty = Number(rows[i][3] || rows[i][2]) || 0;
    var sleeves = Number(rows[i][4] || rows[i][3]) || qty;
    if (qty > 0) {
      var mix = [
        qty * 0.5, // RM001
        qty * 0.5, // RM002
        qty * 1,   // RM003
        qty * 1,   // RM004
        qty * 1,   // RM005
        qty * 1,   // RM006
        qty * 1,   // RM007
        qty * 1,   // RM008
        qty * 1,   // RM009
        qty * 2,   // RM010
        qty * 1,   // RM011
        qty * 1,   // RM012
        qty * 1,   // RM013
        sleeves    // RM014
      ];
      sheet.getRange(i + 1, rm1ColIndex, 1, mix.length).setValues([mix]);
    }
  }
}

/**
 * Helper to remove duplicate appended rows below row 20
 */
function cleanupDuplicateManufacturingRows() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.MANUFACTURING);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow > 20) {
    sheet.deleteRows(21, lastRow - 20);
  }
}

function handleManufacturingDelete(ss, data) {
  var sheet = ss.getSheetByName(SHEETS.MANUFACTURING);
  if (!sheet) return jsonResponse({ status: "error", message: "Manufacturing Sheet not found" });
  var rows = sheet.getDataRange().getValues();
  var targetBatch = String(data.batchNo || data.id || "").trim().toUpperCase().replace(/O/g, '0');
  var targetId = String(data.id || "").trim();

  for (var i = 1; i < rows.length; i++) {
    var cellBatch = String(rows[i][0] || rows[i][1] || "").trim().toUpperCase().replace(/O/g, '0');
    var cellId = String(rows[i][0] || "").trim();
    if ((targetBatch && cellBatch === targetBatch) || (targetId && cellId === targetId)) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: "success", message: "Deleted Manufacturing Batch " + targetBatch + " from Sheet", row: i + 1 });
    }
  }
  return jsonResponse({ status: "error", message: "Batch not found in Sheet" });
}

function handlePurchaseDelete(ss, data) {
  var sheet = ss.getSheetByName(SHEETS.PURCHASES);
  if (!sheet) return jsonResponse({ status: "error", message: "Purchases Sheet not found" });
  var rows = sheet.getDataRange().getValues();
  var targetId = String(data.id || "").trim();
  for (var i = 1; i < rows.length; i++) {
    var cellId = String(rows[i][0] || "").trim();
    if (cellId === targetId) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: "success", message: "Deleted Purchase " + targetId });
    }
  }
  return jsonResponse({ status: "error", message: "Purchase not found" });
}

function handleSalesDispatchDelete(ss, data) {
  var sheet = ss.getSheetByName(SHEETS.SALES_DISPATCH) || ss.getSheetByName(SHEETS.DISPATCH_FALLBACK);
  if (!sheet) return jsonResponse({ status: "error", message: "Dispatch Sheet not found" });
  var rows = sheet.getDataRange().getValues();
  var targetSrNo = String(data.srNo || "").trim();
  var targetOrderId = String(data.orderId || data.id || "").trim();
  for (var i = 1; i < rows.length; i++) {
    var r0 = String(rows[i][0] || "").trim();
    var r2 = String(rows[i][2] || "").trim();
    var r4 = String(rows[i][4] || "").trim();
    if ((targetSrNo && (r0 === targetSrNo || r2 === targetSrNo)) ||
        (targetOrderId && (r0 === targetOrderId || r2 === targetOrderId || r4 === targetOrderId))) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: "success", message: "Deleted Order from Sheet" });
    }
  }
  return jsonResponse({ status: "error", message: "Order not found in Sheet" });
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MMM-yyyy");
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setIsCopied(true);
    showToast('Copied Google Apps Script code to clipboard!');
    setTimeout(() => setIsCopied(false), 3000);
  };

  const handleSaveCompany = (e) => {
    e.preventDefault();
    showToast('Company profile settings updated successfully!');
  };

  const handleAddUserSubmit = (e) => {
    e.preventDefault();
    if (!userName || !userEmail) return;

    const cleanEmail = userEmail.trim().toLowerCase();
    const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const pass = userPassword || 'user123';

    // 1. Save to credentials registry in localStorage for login authentication
    try {
      const savedAccounts = localStorage.getItem('hard2soft_user_accounts');
      const accountsMap = savedAccounts ? JSON.parse(savedAccounts) : {};
      accountsMap[cleanEmail] = {
        name: userName,
        role: userRole,
        avatar: initials,
        password: pass
      };
      localStorage.setItem('hard2soft_user_accounts', JSON.stringify(accountsMap));
    } catch (err) {
      console.error("Error saving user credentials:", err);
    }

    const updatedUserObj = {
      id: editingUserId || `USR-${Math.floor(10 + Math.random() * 90)}`,
      name: userName,
      email: cleanEmail,
      role: userRole,
      status: 'Active',
      avatar: initials
    };

    onAddUser(updatedUserObj);
    setIsUserModalOpen(false);
    showToast(editingUserId ? `Updated credentials for ${cleanEmail}` : `Added member ${cleanEmail} with role ${userRole}`);
  };

  const handleTestAndSync = async () => {
    if (!inputUrl || !inputUrl.includes('/exec')) {
      showToast('Please enter your complete Web App URL ending in /exec', 'error');
      setSyncStatus('error');
      setSyncMessage('Invalid URL format. URL must end in /exec');
      return;
    }

    setIsTesting(true);
    setSyncStatus('testing');
    setSyncMessage('Testing connection to Google Sheets...');

    try {
      const data = await fetchLiveSheetsData(inputUrl);
      setWebAppUrl(inputUrl);
      setSyncStatus('connected');
      setSyncMessage('Connected successfully! Live inventory & Sales data synced.');
      showToast('Successfully connected to Google Sheet!');
      if (onSyncLiveData) {
        onSyncLiveData(data);
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage(`Connection failed: ${err.message}`);
      showToast(`Connection failed: ${err.message}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Settings Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '6px',
        borderRadius: '18px',
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(15, 76, 58, 0.08)',
        width: 'fit-content',
        boxShadow: '0 4px 14px rgba(15, 76, 58, 0.04)'
      }}>
        {[
          { id: 'sheets', label: 'Google Sheets Integration', icon: FileSpreadsheet },
          { id: 'company', label: 'Company Profile', icon: Building2 },
          { id: 'users', label: 'Users & Roles', icon: Users },
          { id: 'notifications', label: 'Notifications & Alerts', icon: Bell }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'linear-gradient(135deg, #0F4C3A 0%, #16644d 100%)' : 'transparent',
                color: isActive ? '#ffffff' : '#64748B',
                fontWeight: isActive ? 700 : 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 4px 12px rgba(15, 76, 58, 0.25)' : 'none'
              }}
            >
              <Icon size={18} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: GOOGLE SHEETS */}
      {activeTab === 'sheets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Top Connection Card */}
          <div className="glass-card" style={{ padding: '36px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(15, 76, 58, 0.08)' }}>
              <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '16px', color: '#22C55E' }}>
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F4C3A' }}>
                  Live Google Sheets Bidirectional Sync
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                  Target Workbook: <strong>HARD2SOFT INVENTORY TEST</strong> (ID: 1GABauAaLQZbFYviOQjx8JY0BkpML7ZOpCftYpt4mFy8)
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Status Indicator Card */}
              <div style={{
                padding: '18px 22px',
                borderRadius: '16px',
                background: syncStatus === 'connected' ? 'rgba(34, 197, 94, 0.08)' : syncStatus === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(15, 76, 58, 0.04)',
                border: `1px solid ${syncStatus === 'connected' ? 'rgba(34, 197, 94, 0.25)' : syncStatus === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(15, 76, 58, 0.1)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: syncStatus === 'connected' ? '#15803D' : syncStatus === 'error' ? '#DC2626' : '#0F4C3A', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {syncStatus === 'connected' ? <Check size={18} /> : syncStatus === 'error' ? <AlertCircle size={18} /> : <RefreshCw size={18} />}
                    Google Sheet Status: {syncStatus.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '2px' }}>
                    {syncMessage}
                  </div>
                </div>
                <button 
                  onClick={handleTestAndSync}
                  disabled={isTesting}
                  className="btn btn-secondary btn-sm"
                  style={{ borderRadius: '10px', fontWeight: 700 }}
                >
                  <RefreshCw size={14} className={isTesting ? 'animate-spin' : ''} /> {isTesting ? 'Syncing...' : 'Test & Sync Live Data'}
                </button>
              </div>

              <div className="form-group">
                <label>Deployed Apps Script Web App URL (/exec)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button" 
                  onClick={handleTestAndSync}
                  disabled={isTesting}
                  className="btn btn-primary" 
                  style={{ padding: '12px 24px' }}
                >
                  <Save size={18} /> Save & Connect Webhook
                </button>

                <a 
                  href="https://docs.google.com/spreadsheets/d/1GABauAaLQZbFYviOQjx8JY0BkpML7ZOpCftYpt4mFy8/edit?usp=sharing"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ padding: '12px 20px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ExternalLink size={16} /> Open Google Sheet
                </a>
              </div>
            </div>
          </div>

          {/* 1-Click System Data Backup & Transfer Card */}
          <div className="glass-card" style={{ padding: '36px', maxWidth: '900px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'rgba(15, 76, 58, 0.08)', borderRadius: '16px', color: '#0F4C3A' }}>
                <Save size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F4C3A' }}>
                  1-Click System Data Backup & Domain Sync
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                  Export all your local Purchases, Operating Expenses, Manufacturing Batches, and Sales entries to transfer to GitHub Pages in 1 second.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleExportSystemBackup}
                className="btn btn-primary"
                style={{ borderRadius: '12px', padding: '12px 24px', fontWeight: 700 }}
              >
                <Save size={18} /> 💾 Export Full System Backup (.json)
              </button>

              <label
                className="btn btn-secondary"
                style={{ borderRadius: '12px', padding: '12px 24px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <RefreshCw size={18} /> 📥 Import System Backup (.json)
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportSystemBackup}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* 3-Step Setup Instructions & Apps Script Code Box */}
          <div className="glass-card" style={{ padding: '36px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', background: '#0F4C3A', borderRadius: '12px', color: '#ffffff' }}>
                  <Code size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F4C3A' }}>
                    Sales & Dispatch Apps Script Setup (1-Click Copy)
                  </h4>
                  <div style={{ fontSize: '0.825rem', color: '#64748B' }}>
                    Automatically syncs all 23 columns of Sales & Dispatch orders to your live spreadsheet.
                  </div>
                </div>
              </div>

              <button
                onClick={handleCopyCode}
                className="btn btn-primary"
                style={{ borderRadius: '12px', fontSize: '0.85rem' }}
              >
                {isCopied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {isCopied ? 'Copied Code!' : 'Copy Apps Script Code'}
              </button>
            </div>

            {/* Step-by-Step Guide */}
            <div style={{ background: 'rgba(15, 76, 58, 0.04)', padding: '18px 22px', borderRadius: '16px', border: '1px solid rgba(15, 76, 58, 0.08)', marginBottom: '20px' }}>
              <div style={{ fontWeight: 800, color: '#0F4C3A', fontSize: '0.9rem', marginBottom: '8px' }}>
                3-Step Setup Instructions:
              </div>
              <ol style={{ fontSize: '0.85rem', color: '#475569', paddingLeft: '20px', lineHeight: 1.7, margin: 0 }}>
                <li>Open your Google Sheet (<strong>HARD2SOFT INVENTORY TEST</strong>) and click <strong>Extensions ➔ Apps Script</strong>.</li>
                <li>Delete existing code, paste the script below, and click <strong>Save (💾)</strong>.</li>
                <li>Click <strong>Deploy ➔ New Deployment ➔ Select Type: Web App</strong>. Set <em>Who has access</em> to <strong>Anyone</strong>, click <strong>Deploy</strong>, copy the URL ending in <code>/exec</code>, and paste it in the box above!</li>
              </ol>
            </div>

            {/* Code Snippet Box */}
            <pre style={{
              background: '#0F172A',
              color: '#A7F3D0',
              padding: '20px',
              borderRadius: '16px',
              fontSize: '0.775rem',
              overflowX: 'auto',
              maxHeight: '320px',
              lineHeight: 1.5,
              fontFamily: 'monospace'
            }}>
              {appsScriptCode}
            </pre>
          </div>

        </div>
      )}

      {/* TAB 2: COMPANY PROFILE */}
      {activeTab === 'company' && (
        <div className="glass-card" style={{ padding: '36px', maxWidth: '780px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(15, 76, 58, 0.08)' }}>
            <div style={{ padding: '12px', background: 'rgba(15, 76, 58, 0.08)', borderRadius: '16px', color: '#0F4C3A' }}>
              <Building2 size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F4C3A' }}>
                Hard2Soft Organization Details
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                Manage workspace defaults, operational currency, and corporate metadata.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveCompany}>
            <div className="form-group">
              <label>Company Legal Name</label>
              <input
                type="text"
                className="form-control"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tax Identification / GSTIN</label>
                <input
                  type="text"
                  className="form-control"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>System Currency</label>
                <input
                  type="text"
                  className="form-control"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Operational Timezone</label>
              <input
                type="text"
                className="form-control"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '12px', padding: '12px 24px' }}>
              <Save size={18} /> Save Settings
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: USERS & ROLES */}
      {activeTab === 'users' && (
        <div className="glass-card" style={{ padding: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(15, 76, 58, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '16px', color: '#3B82F6' }}>
                <Users size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F4C3A' }}>
                  Team Members & Role Access
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                  Manage internal employee access privileges and role permissions.
                </p>
              </div>
            </div>

            <button onClick={() => handleOpenUserModal(null)} className="btn btn-primary">
              <Plus size={18} /> Invite New Member
            </button>
          </div>

          <div className="table-container" style={{ boxShadow: 'none' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Email Address</th>
                  <th>Assigned Role</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((usr) => (
                  <tr key={usr.id}>
                    <td style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0F4C3A 0%, #2F855A 100%)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.825rem',
                        fontWeight: 800
                      }}>
                        {usr.avatar}
                      </div>
                      {usr.name}
                    </td>
                    <td style={{ color: '#64748B', fontWeight: 500 }}>{usr.email}</td>
                    <td>
                      <span className="badge badge-purple">{usr.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${usr.status === 'Active' ? 'badge-healthy' : 'badge-low'}`}>
                        <span className="badge-dot" /> {usr.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenUserModal(usr)}
                        style={{
                          background: 'rgba(15, 76, 58, 0.08)',
                          border: 'none',
                          color: '#0F4C3A',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        🔑 Edit Password / Role
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="glass-card" style={{ padding: '36px', maxWidth: '780px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(15, 76, 58, 0.08)' }}>
            <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '16px', color: '#F59E0B' }}>
              <Bell size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F4C3A' }}>
                Notification Preferences & Safety Thresholds
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                Manage alert triggers, email digests, and desktop push updates.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '14px', background: 'rgba(15, 76, 58, 0.03)', border: '1px solid rgba(15, 76, 58, 0.06)', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>Instant Low Stock Reorder Alerts</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Notify admins immediately when raw material hits safety minimum.</div>
              </div>
              <input
                type="checkbox"
                checked={lowStockAlerts}
                onChange={(e) => setLowStockAlerts(e.target.checked)}
                style={{ accentColor: '#0F4C3A', width: '20px', height: '20px' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '14px', background: 'rgba(15, 76, 58, 0.03)', border: '1px solid rgba(15, 76, 58, 0.06)', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>Daily Stock & Yield Email Digest</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Receive an end-of-day summary report at 18:00 IST.</div>
              </div>
              <input
                type="checkbox"
                checked={emailDigest}
                onChange={(e) => setEmailDigest(e.target.checked)}
                style={{ accentColor: '#0F4C3A', width: '20px', height: '20px' }}
              />
            </label>

            <button
              type="button"
              onClick={() => showToast('Saved notification alert preferences!')}
              className="btn btn-primary"
              style={{ width: 'fit-content', padding: '12px 24px', marginTop: '8px' }}
            >
              <Save size={18} /> Save Alert Settings
            </button>
          </div>
        </div>
      )}

      {/* INVITE / EDIT USER & PASSWORD MODAL */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title={editingUserId ? "Edit User Credentials & Role" : "Add / Invite Hard2Soft Team Member"}
        icon={Users}
      >
        <form onSubmit={handleAddUserSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Rahul Sharma"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Work Email Address</label>
            <input
              type="email"
              className="form-control"
              placeholder="e.g. member@hard2soft.com"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Assigned Role (Permissions)</label>
              <select
                className="form-control"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
              >
                <option value="Administrator">Administrator (Master Access to All Modules)</option>
                <option value="Employee">Employee (Daily Manufacturing & Sales/Dispatch)</option>
                <option value="Marketing">Marketing (Sales/Dispatch & Sales Analytics Dashboard)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Login Password</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. secret123"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer" style={{ margin: '20px -28px -28px -28px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsUserModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingUserId ? 'Save User Credentials' : 'Create & Authorize Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
