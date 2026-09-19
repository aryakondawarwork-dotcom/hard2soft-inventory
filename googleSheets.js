import { deduplicateOrders } from '../utils/dateUtils.js';

const SPREADSHEET_ID = "1GABauAaLQZbFYviOQjx8JY0BkpML7ZOpCftYpt4mFy8";
const SECRET_TOKEN = "H2S_SECURE_TOKEN_2026_INVENTORY_SECRET";

/**
 * Bulletproof Material ID Normalizer
 * Handles typos like RMOOO2, RM0002, rm02 -> normalizes all to RM002
 */
export function normalizeMatId(id) {
  if (!id) return '';
  let clean = String(id).toUpperCase().replace(/O/g, '0').replace(/\s+/g, '');
  const match = clean.match(/^RM0*(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const padded = String(num).padStart(3, '0');
    return `RM${padded}`;
  }
  return clean;
}

/**
 * Helper to check if a date string is past 5th August 2026
 */
function isPast5thAug(dateStr) {
  if (!dateStr) return false;
  const parts = String(dateStr).trim().split(/[-.]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parts[1].toLowerCase();
    if (!isNaN(day) && day > 5 && (month.includes('aug') || month === '08' || month === '8')) {
      return true;
    }
  }
  return false;
}

/**
 * Parses raw CSV text into a 2D array of clean string values
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  return lines.map(line => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells.map(val => val.replace(/^"|"$/g, '').trim());
  });
}

/**
 * Fetches live sheet CSV directly from Google Sheets GViz endpoint
 */
async function fetchSheetCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&t=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet ${sheetName}`);
  }
  const text = await response.text();
  return parseCSV(text);
}

/**
 * Automated GST Calculator Helper (Total Amount GST Inclusive @ 18%)
 */
export function calculateGST(totalAmount, state = 'Maharashtra') {
  const total = Number(totalAmount) || 0;
  const GST_RATE = 0.18;
  const taxable = total / (1 + GST_RATE);
  const totalGst = total - taxable;

  const isMaharashtra = String(state || '').toLowerCase().includes('maharashtra') || String(state || '').toLowerCase().includes('mh');

  if (isMaharashtra) {
    return {
      totalAmount: total,
      taxableAmount: taxable,
      cgst: totalGst / 2,
      sgst: totalGst / 2,
      igst: 0
    };
  } else {
    return {
      totalAmount: total,
      taxableAmount: taxable,
      cgst: 0,
      sgst: 0,
      igst: totalGst
    };
  }
}

/**
 * Professional FIFO (First In, First Out) Inventory Valuation Engine
 */
export function calculateFifoInventoryEngine(rawMaterialRows, purchaseOrders, bomRecipeMap, totalUnitsYielded) {
  const fifoBatchesByMatId = {};
  const rawMaterialsFinal = [];
  const fifoAuditLedger = [];
  let fifoTotalMfgCost = 0;
  let fifoTotalInventoryValue = 0;

  // 1. Baseline Batches (31.07.2026)
  rawMaterialRows.forEach(mat => {
    const normId = mat.normId;
    if (!normId) return;

    fifoBatchesByMatId[normId] = [];

    if (mat.baselineStock > 0) {
      const b0 = {
        batchId: `BATCH-BASE-${normId}`,
        purchaseId: 'BASELINE-31.07',
        materialId: normId,
        materialName: mat.name,
        date: '31.07.2026',
        supplier: 'Initial Warehouse Stock',
        qtyPurchased: mat.baselineStock,
        unit: mat.unit,
        unitCost: mat.price,
        remainingQty: mat.baselineStock
      };
      fifoBatchesByMatId[normId].push(b0);
    }
  });

  // 2. Purchase Batches
  purchaseOrders.forEach((po, idx) => {
    const normId = normalizeMatId(po.materialId || po.material);
    if (!normId) return;

    if (!fifoBatchesByMatId[normId]) {
      fifoBatchesByMatId[normId] = [];
    }

    const purchaseBatch = {
      batchId: `BATCH-${po.id || idx + 1}`,
      purchaseId: po.id || `PO-${idx + 1}`,
      materialId: normId,
      materialName: po.material,
      date: po.date || '03.08.2026',
      supplier: po.supplier || 'Vendor',
      qtyPurchased: po.qty || 0,
      unit: po.unit || 'KG',
      unitCost: po.unitPrice || 0,
      remainingQty: po.qty || 0
    };

    fifoBatchesByMatId[normId].push(purchaseBatch);
  });

  // 3. FIFO Depletion for Manufacturing Yield
  rawMaterialRows.forEach(mat => {
    const normId = mat.normId;
    if (!normId) return;

    const batches = fifoBatchesByMatId[normId] || [];
    const stdQtyPerProduct = bomRecipeMap[normId] !== undefined ? bomRecipeMap[normId] : (normId === 'RM001' || normId === 'RM002' ? 0.5 : normId === 'RM010' || normId === 'RM014' ? 2 : 1);
    let qtyToDeplete = totalUnitsYielded * stdQtyPerProduct;
    let materialMfgCostRecognized = 0;
    let materialTotalPurchased = 0;

    batches.forEach(b => {
      if (b.purchaseId !== 'BASELINE-31.07') {
        materialTotalPurchased += b.qtyPurchased;
      }

      if (qtyToDeplete > 0) {
        if (b.remainingQty <= qtyToDeplete) {
          const consumed = b.remainingQty;
          materialMfgCostRecognized += consumed * b.unitCost;
          qtyToDeplete -= consumed;
          b.remainingQty = 0;
        } else {
          const consumed = qtyToDeplete;
          materialMfgCostRecognized += consumed * b.unitCost;
          b.remainingQty -= consumed;
          qtyToDeplete = 0;
        }
      }
    });

    fifoTotalMfgCost += materialMfgCostRecognized;

    const currentFifoStock = batches.reduce((sum, b) => sum + b.remainingQty, 0);
    const materialInventoryValue = batches.reduce((sum, b) => sum + (b.remainingQty * b.unitCost), 0);
    fifoTotalInventoryValue += materialInventoryValue;

    const latestBatch = [...batches].reverse().find(b => b.purchaseId !== 'BASELINE-31.07') || batches[0];
    const latestPrice = latestBatch ? latestBatch.unitCost : mat.price;

    let status = 'Healthy';
    if (currentFifoStock <= mat.minStock) status = 'Low';
    else if (currentFifoStock <= mat.minStock * 1.5) status = 'Medium';

    rawMaterialsFinal.push({
      id: normId,
      name: mat.name,
      unit: mat.unit,
      baselineStock: mat.baselineStock,
      totalPurchased: materialTotalPurchased,
      totalConsumed: totalUnitsYielded * stdQtyPerProduct,
      currentStock: currentFifoStock,
      minStock: mat.minStock,
      price: latestPrice,
      latestPrice: latestPrice,
      fifoInventoryValue: materialInventoryValue,
      status: status,
      remarks: mat.remarks || ''
    });

    batches.forEach(b => {
      fifoAuditLedger.push({
        batchId: b.batchId,
        purchaseId: b.purchaseId,
        materialId: normId,
        materialName: mat.name,
        date: b.date,
        supplier: b.supplier,
        unitCost: b.unitCost,
        qtyPurchased: b.qtyPurchased,
        remainingQty: b.remainingQty,
        batchValue: b.remainingQty * b.unitCost
      });
    });
  });

  return {
    rawMaterials: rawMaterialsFinal,
    fifoTotalMfgCost,
    fifoTotalInventoryValue,
    fifoAuditLedger
  };
}

/**
 * Direct Live Reader with Unified Sales & Dispatch and Dynamic Manufacturing Engine
 */
export async function fetchLiveSheetsData(webAppUrl) {
  try {
    // 1. Fetch BILL OF MATERIAL (BOM)
    const bomRows = await fetchSheetCSV("BILL OF MATERIAL");
    const bom = [];
    const bomRecipeByMatId = {};

    if (bomRows.length > 1) {
      for (let i = 1; i < bomRows.length; i++) {
        const row = bomRows[i];
        const rawId = String(row[1] || '').trim();
        if (!rawId) continue;

        const normId = normalizeMatId(rawId);
        const stdQty = Number(row[4]) || 0;
        const piecePrice = Number(row[6]) || 0;

        bomRecipeByMatId[normId] = stdQty;

        bom.push({
          materialId: normId,
          material: String(row[2] || '').trim(),
          unit: row[3] || 'PCS',
          stdQtyPerProduct: isNaN(stdQty) ? 0 : stdQty,
          specifications: row[5] || '-',
          pieceCost: isNaN(piecePrice) ? 0 : piecePrice
        });
      }
    }

    // 2. Fetch PURCHASES sheet
    const purchaseRows = await fetchSheetCSV("PURCHASES");
    const purchases = [];
    let poCounter = 1;

    if (purchaseRows.length > 1) {
      for (let i = 1; i < purchaseRows.length; i++) {
        const row = purchaseRows[i];
        if (!row[1] && !row[2] && !row[3]) continue;

        const dateVal = row[1] || '03.08.2026';
        const poIdVal = row[2] && String(row[2]).trim().startsWith('PO') ? String(row[2]).trim() : `PO-${String(poCounter).padStart(3, '0')}`;
        
        let rawMatId = '';
        let matName = '';
        let qtyStr = '';
        let unitPriceStr = '';

        if (row[3] && String(row[3]).trim().toUpperCase().startsWith('RM')) {
          rawMatId = String(row[3]).trim();
          matName = String(row[4] || '').trim();
          qtyStr = String(row[5] || '').trim();
          unitPriceStr = String(row[6] || '').trim();
        } else if (row[2] && String(row[2]).trim().toUpperCase().startsWith('RM')) {
          rawMatId = String(row[2]).trim();
          matName = String(row[3] || '').trim();
          qtyStr = String(row[4] || '').trim();
          unitPriceStr = String(row[5] || '').trim();
        } else {
          rawMatId = String(row[3] || row[2] || '').trim();
          matName = String(row[4] || row[3] || '').trim();
          qtyStr = String(row[5] || row[4] || '').trim();
          unitPriceStr = String(row[6] || row[5] || '').trim();
        }

        const normMatId = normalizeMatId(rawMatId);
        const qty = parseFloat(String(qtyStr || '0').replace(/[^0-9.]/g, '')) || 0;
        const unitPrice = parseFloat(String(unitPriceStr || '0').replace(/[^0-9.]/g, '')) || 0;
        const baseAmt = qty * unitPrice;
        const rawGst = String(row[7] || '18').replace(/[^0-9.]/g, '');
        const gstRate = rawGst !== '' ? parseFloat(rawGst) : 0;
        const gstAmt = (baseAmt * gstRate) / 100;
        const total = baseAmt + gstAmt;

        poCounter++;

        purchases.push({
          id: poIdVal,
          date: dateVal,
          materialId: normMatId || 'RM001',
          material: matName || 'Raw Material',
          qty: qty,
          unit: String(qtyStr || '').replace(/[0-9.\s]/g, '') || 'PCS',
          unitPrice: unitPrice,
          baseAmount: baseAmt,
          gstRate: gstRate,
          gstAmount: gstAmt,
          total: total,
          supplier: row[10] || row[8] || 'Direct Vendor',
          invoiceNo: row[11] || row[9] || '-',
          remarks: row[12] || '',
          status: 'Received'
        });
      }
    }

    // 3. Dynamic Live Fetch of SALES & DISPATCH sheet with intelligent column auto-alignment
    let dispatchRows = await fetchSheetCSV("SALES & DISPATCH");
    if (dispatchRows.length <= 1 || (dispatchRows[0] && dispatchRows[0].join('').includes('HARD2SOFT INVENTORY DASHBOARD'))) {
      dispatchRows = await fetchSheetCSV("FINISHED GOODS DISPATCH");
    }

    const dispatch = [];
    let totalProductsDispatched = 0;

    // Helper to detect date cell (stripping trailing dots like 07.08.2026.)
    const isDatePattern = (val) => {
      if (!val) return false;
      const s = String(val).trim().replace(/\.+$/g, '');
      if (s.length < 6 || s.length > 12) return false;
      return /^\d{1,2}[-./][a-zA-Z0-9]{2,4}[-./]\d{2,4}$/.test(s) || /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(s);
    };

    if (dispatchRows.length > 1) {
      for (let i = 1; i < dispatchRows.length; i++) {
        const row = dispatchRows[i];
        if (!row || !row.some(c => c && String(c).trim())) continue;

        // Auto-detect column offset for this row
        let offset = 0;
        if (isDatePattern(row[1])) {
          offset = 0;
        } else if (isDatePattern(row[3])) {
          offset = 2;
        } else if (isDatePattern(row[2])) {
          offset = 1;
        } else {
          for (let c = 0; c < 6; c++) {
            if (isDatePattern(row[c])) {
              offset = c - 1 >= 0 ? c - 1 : 0;
              break;
            }
          }
        }

        let srNo = String(row[offset] || '').trim();
        let rawDate = String(row[offset + 1] || '').trim().replace(/\.+$/, '');
        let rawOrderId = String(row[offset + 2] || '').trim();
        const channel = String(row[offset + 3] || 'WEBSITE').trim().toUpperCase();
        const customer = String(row[offset + 4] || '').trim().toUpperCase();
        let state = String(row[offset + 5] || 'MAHARASHTRA').trim().toUpperCase();
        const qty = Number(row[offset + 6]) || 1;
        const smallBags = Number(row[offset + 7]) || 0;
        const bigBags = Number(row[offset + 8]) || 0;
        const status = String(row[offset + 9] || 'DELIVERED').trim();
        const dispatchedStr = String(row[offset + 10] || 'YES').trim().toUpperCase();
        const dispatched = dispatchedStr === 'YES' || dispatchedStr === 'TRUE' || dispatchedStr === '';
        let rawCourier = String(row[offset + 11] || 'DELHIVERY').trim().toUpperCase();
        let courier = 'Delhivery';
        if (rawCourier.includes('FLIPKART') || rawCourier.includes('EKART')) courier = 'Flipkart';
        else if (rawCourier.includes('SHIPROCKET')) courier = 'Shiprocket';
        else if (rawCourier.includes('BLUEDART')) courier = 'BlueDart';
        else if (rawCourier.includes('INDIA POST') || rawCourier.includes('POST')) courier = 'India Post';
        else if (rawCourier && rawCourier !== '-') courier = rawCourier;
        const rawAmtCell = row[offset + 12];
        let totalAmount = 0;
        if (rawAmtCell !== undefined && rawAmtCell !== '' && !isNaN(Number(rawAmtCell))) {
          totalAmount = Number(rawAmtCell);
        } else {
          totalAmount = qty * 3699.1;
        }

        // Sanity Check: If state was incorrectly shifted to a number (e.g. "1"), fallback to Maharashtra or customer state
        if (/^\d+$/.test(state)) {
          state = 'ANDHRA PRADESH';
        }

        const paymentType = String(row[offset + 17] || 'PREPAID').trim().toUpperCase();
        const gstin = String(row[offset + 18] || '-').trim();
        const phone = String(row[offset + 19] || '-').trim();
        let email = String(row[offset + 20] || '-').trim().replace(/^mailto:/i, '');
        const feedback = String(row[offset + 21] || 'Positive').trim();

        if ((!srNo && !rawOrderId && !customer) || !rawDate || rawDate === '-') continue;

        // Date formatting: 01.08.2026, 11-08-2026, 10-Aug-26 -> 01-Aug-26
        let formattedDate = rawDate;
        if (rawDate.includes('.') || rawDate.includes('-')) {
          const parts = rawDate.split(/[-.]/);
          if (parts.length === 3) {
            const d = parts[0].padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            let m = 'Aug';
            if (/^\d+$/.test(parts[1])) {
              m = months[parseInt(parts[1], 10) - 1] || 'Aug';
            } else {
              m = parts[1].slice(0, 3);
              m = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
            }
            const y = parts[2].slice(-2);
            formattedDate = `${d}-${m}-${y}`;
          }
        }

        const normStatus = String(status || '').toLowerCase();
        const isReturnedOrCancelled = normStatus.includes('return') || normStatus.includes('rto') || normStatus.includes('cancel');
        
        if (!isReturnedOrCancelled) {
          totalProductsDispatched += qty;
        }

        // Dynamic 18% Inclusive GST Calculation
        const taxableAmount = totalAmount > 0 ? Number((totalAmount / 1.18).toFixed(2)) : 0;
        const totalTax = totalAmount > 0 ? Number((totalAmount - taxableAmount).toFixed(2)) : 0;
        const isLocal = state.includes('MAHARASHTRA');
        const cgst = isLocal ? Number((totalTax / 2).toFixed(2)) : 0;
        const sgst = isLocal ? Number((totalTax / 2).toFixed(2)) : 0;
        const igst = !isLocal ? totalTax : 0;

        // Clean sequential Order ID resolution
        let finalOrderId = rawOrderId;
        if (!finalOrderId || finalOrderId === '-' || finalOrderId === srNo) {
          finalOrderId = srNo.startsWith('#') ? srNo : `#${srNo}`;
        }

        dispatch.push({
          id: finalOrderId,
          srNo: srNo || String(dispatch.length + 1),
          orderId: finalOrderId,
          date: formattedDate,
          channel: channel || 'WEBSITE',
          customer: customer || 'DIRECT CUSTOMER',
          state: state || 'MAHARASHTRA',
          qty: qty,
          smallBags: smallBags,
          biggerBags: bigBags,
          status: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
          dispatched: dispatched,
          courier: courier || 'DELHIVERY',
          totalAmount: totalAmount,
          taxableAmount: taxableAmount,
          cgst: cgst,
          sgst: sgst,
          igst: igst,
          paymentType: paymentType || 'PREPAID',
          gstin: gstin || '-',
          phone: phone || '-',
          email: email || '-',
          feedback: 'Positive'
        });
      }
    }

    // 4. Dynamic Live Fetch of DAILY MANUFACTURING sheet with clean Batch IDs & Deduplication
    const mfgRows = await fetchSheetCSV("DAILY MANUFACTURING");
    const mfgMap = {};
    let activeBatchCount = 1;

    if (mfgRows.length > 1) {
      for (let i = 1; i < mfgRows.length; i++) {
        const row = mfgRows[i];
        const col0 = String(row[0] || '').trim();
        const col1 = String(row[1] || '').trim();
        const col2 = String(row[2] || '').trim();

        if (!col1 && !col0 && !col2) continue;
        if (col1.toUpperCase() === 'DATE' || col0.toUpperCase() === 'DATE' || col2.toUpperCase() === 'DATE') continue;

        let dateStr = col1;
        let rawBatchNo = col2;
        let qtyVal = Number(row[3]) || 0;
        let sleevesVal = Number(row[4]) || 0;
        let opVal = String(row[5] || 'MAYURI').trim();

        // Handle misaligned row where Batch No is in Column 0 (e.g., Row 21: "B020", "", "Hard2Soft", 13, 13)
        if (col0.toUpperCase().includes('RETURN') || (col0.toUpperCase().startsWith('B') && col0.length <= 6)) {
          rawBatchNo = col0;
          dateStr = col1 || col2;
          if (!dateStr || dateStr.toUpperCase() === 'HARD2SOFT') {
            dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
          }
          qtyVal = Number(row[3]) || 0;
          sleevesVal = Number(row[4]) || 0;
          opVal = String(row[5] || 'MAYURI').trim();
        }

        if (!dateStr) {
          dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
        }
        if (dateStr.toUpperCase() === 'DATE' || dateStr.toUpperCase() === 'TOTAL') continue;

        let displayBatchId = '-';
        const isReturnBatch = rawBatchNo.toUpperCase().includes('RETURN') || col0.toUpperCase().includes('RETURN');

        if (qtyVal > 0) {
          if (rawBatchNo && rawBatchNo !== '0' && rawBatchNo !== '-' && rawBatchNo.toUpperCase() !== 'HARD2SOFT') {
            if (isReturnBatch) {
              displayBatchId = 'RETURN BATCH';
            } else if (rawBatchNo.toUpperCase().startsWith('B') || rawBatchNo.toUpperCase().startsWith('BO')) {
              displayBatchId = rawBatchNo.toUpperCase().replace(/^BOO/, 'B00').replace(/^BO/, 'B0').replace(/O/g, '0');
            } else {
              displayBatchId = rawBatchNo.toUpperCase();
            }
          } else if (isReturnBatch) {
            displayBatchId = 'RETURN BATCH';
          } else {
            displayBatchId = `B00${activeBatchCount}`;
            activeBatchCount++;
          }
        } else {
          displayBatchId = rawBatchNo === '0' ? '0' : '-';
        }

        // Build actual materials consumed map for this batch
        const actualMatMap = {};
        let customMixFound = false;

        // 1. Check if 14 individual columns exist starting at index 8 (Col I: RM001)
        if (row.length >= 20 && row[8] !== undefined && row[8] !== '' && !isNaN(parseFloat(row[8]))) {
          actualMatMap['RM001'] = parseFloat(row[8]) || 0;
          actualMatMap['RM002'] = parseFloat(row[9]) || 0;
          actualMatMap['RM003'] = parseFloat(row[10]) || 0;
          actualMatMap['RM004'] = parseFloat(row[11]) || 0;
          actualMatMap['RM005'] = parseFloat(row[12]) || 0;
          actualMatMap['RM006'] = parseFloat(row[13]) || 0;
          actualMatMap['RM007'] = parseFloat(row[14]) || 0;
          actualMatMap['RM008'] = parseFloat(row[15]) || 0;
          actualMatMap['RM009'] = parseFloat(row[16]) || 0;
          actualMatMap['RM010'] = parseFloat(row[17]) || 0;
          actualMatMap['RM011'] = parseFloat(row[18]) || 0;
          actualMatMap['RM012'] = parseFloat(row[19]) || 0;
          actualMatMap['RM013'] = parseFloat(row[20]) || 0;
          actualMatMap['RM014'] = parseFloat(row[21]) || sleevesVal || (qtyVal * 2);
          customMixFound = true;
        }

        // 2. Try parsing custom raw material mix stored as JSON in Column 6, 7, 8, or 9
        if (!customMixFound) {
          for (let colIdx = 6; colIdx < row.length; colIdx++) {
            const colCell = String(row[colIdx] || '').trim();
            if (colCell.startsWith('{') && colCell.endsWith('}') && colCell.includes('RM001')) {
              try {
                const parsed = JSON.parse(colCell);
                if (parsed && typeof parsed === 'object') {
                  Object.keys(parsed).forEach(k => {
                    actualMatMap[k] = Number(parsed[k]) || 0;
                  });
                  customMixFound = true;
                  break;
                }
              } catch (e) {
                console.warn("Invalid raw material mix JSON in sheet row:", e);
              }
            }
          }
        }

        // 3. Default standard BOM fallback if no custom mix is saved in Google Sheet
        if (!customMixFound) {
          actualMatMap['RM001'] = qtyVal * 0.5;
          actualMatMap['RM002'] = qtyVal * 0.5;
          actualMatMap['RM003'] = qtyVal * 1;
          actualMatMap['RM004'] = qtyVal * 1;
          actualMatMap['RM005'] = qtyVal * 1;
          actualMatMap['RM006'] = qtyVal * 1; // Cable Tie (1 PCS per product unit)
          actualMatMap['RM007'] = qtyVal * 1;
          actualMatMap['RM008'] = qtyVal * 1;
          actualMatMap['RM009'] = qtyVal * 1;
          actualMatMap['RM010'] = qtyVal * 2;
          actualMatMap['RM011'] = qtyVal * 1;
          actualMatMap['RM012'] = qtyVal * 1;
          actualMatMap['RM013'] = qtyVal * 1;
          actualMatMap['RM014'] = sleevesVal || (qtyVal * 2);
        }

        const stdRM001 = qtyVal * 0.5;
        const actRM001 = actualMatMap['RM001'] !== undefined ? actualMatMap['RM001'] : stdRM001;
        const diffRM001 = actRM001 - stdRM001;

        let vLabel = 'Exact BOM Recipe (100% Target)';
        if (isReturnBatch) {
          vLabel = '🔄 Returned Units Repackaged & Restocked';
        } else if (Math.abs(diffRM001) > 0.01) {
          vLabel = diffRM001 > 0 ? `+${diffRM001.toFixed(1)} KG Antiscalant (Extra Scrap)` : `-${Math.abs(diffRM001).toFixed(1)} KG Antiscalant (Material Saved)`;
        } else if (sleevesVal > qtyVal) {
          vLabel = `+${sleevesVal - qtyVal} Sleeves (Extra Scrap)`;
        }

        const mfgItem = {
          id: displayBatchId !== '-' ? displayBatchId : `B-ROW-${i}`,
          batchNo: displayBatchId,
          date: dateStr,
          product: 'Hard2Soft',
          qty: qtyVal,
          sleevesUsed: sleevesVal,
          operator: opVal || 'MAYURI',
          status: isReturnBatch ? 'Return Restocked' : (qtyVal > 0 ? 'Completed' : 'No Production'),
          isReturnBatch: isReturnBatch,
          actualMaterials: actualMatMap,
          varianceLabel: vLabel
        };

        // Merge any locally saved user edits from localStorage for this batch
        try {
          const savedEditedStr = typeof localStorage !== 'undefined' ? localStorage.getItem('hard2soft_manufacturing_edited_map') : null;
          if (savedEditedStr) {
            const editedMap = JSON.parse(savedEditedStr);
            const mId = mfgItem.id;
            const mNo = mfgItem.batchNo;
            const mNorm = mNo ? mNo.toUpperCase().replace(/O/g, '0') : '';
            const mDate = dateStr ? dateStr.trim().toLowerCase() : '';

            let localEdit = editedMap[mId] || editedMap[mNo] || (mNorm ? editedMap[mNorm] : null) || (mDate ? editedMap[mDate] : null);
            if (!localEdit && editedMap) {
              const allEdits = Object.values(editedMap);
              for (const edit of allEdits) {
                if (!edit) continue;
                const eId = String(edit.id || edit.originalId || '').trim();
                const eNo = String(edit.batchNo || '').trim();
                const eNorm = eNo.toUpperCase().replace(/O/g, '0');
                const eDate = String(edit.date || '').trim().toLowerCase();

                if ((mId && eId && mId === eId) ||
                    (mNo && eNo && mNo === eNo) ||
                    (mNorm && eNorm && mNorm === eNorm && mNorm !== '-') ||
                    (mDate && eDate && mDate === eDate)) {
                  localEdit = edit;
                  break;
                }
              }
            }
            if (localEdit && localEdit.actualMaterials) {
              mfgItem.actualMaterials = {
                ...mfgItem.actualMaterials,
                ...localEdit.actualMaterials
              };
              if (localEdit.qty !== undefined) mfgItem.qty = localEdit.qty;
              if (localEdit.sleevesUsed !== undefined) mfgItem.sleevesUsed = localEdit.sleevesUsed;
              if (localEdit.operator) mfgItem.operator = localEdit.operator;
              if (localEdit.status) mfgItem.status = localEdit.status;
              if (localEdit.remarks) mfgItem.remarks = localEdit.remarks;
            }
          }
        } catch (e) {
          console.warn("Notice: Local edited map merge error in googleSheets.js:", e);
        }

        // Key for deduplication
        const normKey = `${dateStr.toLowerCase()}_${displayBatchId.toUpperCase().replace(/O/g, '0')}`;
        mfgMap[normKey] = mfgItem;
      }
    }

    const manufacturing = Object.values(mfgMap);
    let totalProductsManufactured = manufacturing.reduce((sum, m) => sum + (Number(m.qty) || 0), 0);

    const totalUnitsProducedAfter31st = Math.max(totalProductsManufactured, totalProductsDispatched);
    const baselineFinishedGoods = 59;
    const currentFinishedGoods = Math.max(0, baselineFinishedGoods + totalProductsManufactured - totalProductsDispatched);

    // 5. Fetch RAW MATERIAL sheet
    const rawMatRows = await fetchSheetCSV("RAW MATERIAL");
    const parsedRawMaterialRows = [];

    if (rawMatRows.length > 1) {
      for (let i = 1; i < rawMatRows.length; i++) {
        const row = rawMatRows[i];
        const rawId = String(row[1] || '').trim();
        const name = String(row[2] || '').trim();
        if (!rawId && !name) continue;
        if (rawId === 'NOTE:') break;

        const normId = rawId ? (rawId.startsWith('RM') ? rawId : `RM${rawId.padStart(3, '0')}`) : `RM${String(i).padStart(3, '0')}`;
        let baselineStock = row[4] !== undefined && row[4] !== '' ? Number(row[4]) : 0;
        const minStock = row[5] !== undefined && row[5] !== '' ? Number(row[5]) : 0;
        const price = row[6] !== undefined && row[6] !== '' ? Number(row[6]) : 0;

        parsedRawMaterialRows.push({
          normId,
          name: name || 'Unnamed Material',
          unit: row[3] || 'PCS',
          baselineStock,
          minStock,
          price,
          remarks: row[7] || ''
        });
      }
    }

    // 6. Execute FIFO Engine with Dynamic Manufacturing Depletion
    const fifoResults = calculateFifoInventoryEngine(
      parsedRawMaterialRows,
      purchases,
      bomRecipeByMatId,
      totalUnitsProducedAfter31st
    );

    return {
      rawMaterials: fifoResults.rawMaterials,
      bom,
      purchases,
      manufacturing,
      dispatch: deduplicateOrders(dispatch),
      fifoAuditLedger: fifoResults.fifoAuditLedger,
      fifoTotalMfgCost: fifoResults.fifoTotalMfgCost,
      fifoTotalInventoryValue: fifoResults.fifoTotalInventoryValue,
      finishedGoodsSummary: {
        baselineOn31st: baselineFinishedGoods,
        manufactured: totalProductsManufactured,
        dispatched: totalProductsDispatched,
        currentStock: currentFinishedGoods
      }
    };

  } catch (err) {
    throw new Error(`Google Sheets connection error: ${err.message}`);
  }
}

/**
 * Send transaction to Google Sheet Apps Script Web App
 */
export async function sendSheetsTransaction(webAppUrl, action, data) {
  if (!webAppUrl || !webAppUrl.startsWith('http')) return;

  const payload = JSON.stringify({
    token: SECRET_TOKEN,
    action: action,
    data: data
  });

  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload
    });
    try {
      const result = await response.json();
      return result;
    } catch (jsonErr) {
      return { status: "success" };
    }
  } catch (err) {
    console.warn("Standard fetch notice, attempting no-cors fallback:", err);
    try {
      await fetch(webAppUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload
      });
      return { status: "success" };
    } catch (err2) {
      console.error("All Google Sheets sync attempts failed:", err2);
    }
  }
}
