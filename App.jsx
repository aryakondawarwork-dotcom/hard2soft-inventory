import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MarketingDashboard from './pages/MarketingDashboard';
import RawMaterials from './pages/RawMaterials';
import BOM from './pages/BOM';
import Purchases from './pages/Purchases';
import Manufacturing from './pages/Manufacturing';
import Dispatch from './pages/Dispatch';
import Settings from './pages/Settings';
import BusinessAnalytics from './pages/BusinessAnalytics';
import { sendSheetsTransaction, fetchLiveSheetsData } from './services/googleSheets';
import { deduplicateOrders } from './utils/dateUtils';

import { 
  initialRawMaterials, 
  initialBOM,
  initialPurchases, 
  initialManufacturing, 
  initialDispatch, 
  initialOperatingExpenses,
  initialUsers,
  initialActivity,
  initialFifoAuditLedger
} from './mockData';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('hard2soft_current_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email) return parsed;
      } catch (e) {
        console.error("Error loading saved user:", e);
      }
    }
    return null;
  });

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const isAuth = localStorage.getItem('hard2soft_logged_in') === 'true';
    const savedUser = localStorage.getItem('hard2soft_current_user');
    return isAuth && !!savedUser;
  });

  const [currentPage, setCurrentPage] = useState(() => {
    return localStorage.getItem('hard2soft_current_page') || 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(true);

  // Persistent Operating Expenses in localStorage
  const [operatingExpenses, setOperatingExpenses] = useState(() => {
    const saved = localStorage.getItem('hard2soft_operating_expenses');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Error loading saved operating expenses:", e);
      }
    }
    return initialOperatingExpenses;
  });

  useEffect(() => {
    localStorage.setItem('hard2soft_operating_expenses', JSON.stringify(operatingExpenses));
  }, [operatingExpenses]);

  // Global Default Deployed Google Apps Script URL (hardcoded so ALL laptops sync automatically out-of-the-box)
  const DEFAULT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxrImAioStVu02o2fhT4HoAvbhO3CzpT7xsSiCItF9_ARTtX2sC8FUf39T-6qMq46sz/exec";

  // Deployed Google Apps Script URL stored persistently in localStorage or defaulting to DEFAULT_WEB_APP_URL
  const [webAppUrl, setWebAppUrlState] = useState(() => {
    return localStorage.getItem('hard2soft_web_app_url') || DEFAULT_WEB_APP_URL || '';
  });

  const setWebAppUrl = (url) => {
    setWebAppUrlState(url);
    if (url) {
      localStorage.setItem('hard2soft_web_app_url', url);
    } else {
      localStorage.removeItem('hard2soft_web_app_url');
    }
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Application Reactive Datasets with persistent localStorage backup
  const [materials, setMaterials] = useState(initialRawMaterials);
  const [bom, setBOM] = useState(initialBOM);

  const [purchases, setPurchases] = useState(() => {
    const saved = localStorage.getItem('hard2soft_purchases');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Error loading saved purchases:", e);
      }
    }
    return initialPurchases;
  });

  useEffect(() => {
    localStorage.setItem('hard2soft_purchases', JSON.stringify(purchases));
  }, [purchases]);

  const [manufacturing, setManufacturing] = useState(() => {
    const saved = localStorage.getItem('hard2soft_manufacturing');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const totalQty = parsed.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
          const hasB020 = parsed.some(m => String(m.batchNo || m.id).toUpperCase().includes('B020'));
          if (hasB020 && totalQty >= 239) {
            return parsed;
          }
        }
      } catch (e) {
        console.error("Error loading saved manufacturing:", e);
      }
    }
    localStorage.removeItem('hard2soft_manufacturing');
    return initialManufacturing;
  });

  useEffect(() => {
    const currentTotalMfg = (manufacturing || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    if (currentTotalMfg < 239) {
      setManufacturing(initialManufacturing);
      localStorage.setItem('hard2soft_manufacturing', JSON.stringify(initialManufacturing));
    } else {
      localStorage.setItem('hard2soft_manufacturing', JSON.stringify(manufacturing));
    }
  }, [manufacturing]);

  const [dispatch, setDispatch] = useState(() => {
    const saved = localStorage.getItem('hard2soft_dispatch');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 82) return deduplicateOrders(parsed);
      } catch (e) {
        console.error("Error loading saved dispatch:", e);
      }
    }
    localStorage.removeItem('hard2soft_dispatch');
    return deduplicateOrders(initialDispatch);
  });

  useEffect(() => {
    const currentDispatchCount = (dispatch || []).length;
    if (currentDispatchCount < 82) {
      setDispatch(deduplicateOrders(initialDispatch));
      localStorage.setItem('hard2soft_dispatch', JSON.stringify(deduplicateOrders(initialDispatch)));
    } else {
      localStorage.setItem('hard2soft_dispatch', JSON.stringify(dispatch));
    }
  }, [dispatch]);



  const [users, setUsers] = useState(initialUsers);
  const [notifications, setNotifications] = useState(initialActivity);
  const [fifoAuditLedger, setFifoAuditLedger] = useState(initialFifoAuditLedger);
  const [finishedGoodsSummary, setFinishedGoodsSummary] = useState({ baselineOn31st: 59, manufactured: 58, dispatched: 39, currentStock: 78 });

  // Bulletproof Dynamic Raw Material Calculation
  // Computes baselineStock + totalPurchased - totalConsumed and updates latest price and stock status reactively!
  const computedMaterials = useMemo(() => {
    // Build BOM map: { [materialId]: stdQtyPerProduct }
    const bomMap = {};
    (bom || []).forEach(b => {
      if (b.materialId) {
        bomMap[b.materialId] = Number(b.stdQtyPerProduct) || 0;
      }
    });

    return (materials || []).map(mat => {
      const matId = mat.id;
      const matName = String(mat.name || '').trim().toLowerCase();

      // 1. Calculate Total Purchased & Latest Purchase Price from Purchases
      let totalPurchased = 0;
      let latestPrice = mat.price;

      (purchases || []).forEach(po => {
        const poMatId = po.materialId;
        const poMatName = String(po.material || '').trim().toLowerCase();
        
        const isMatch = (poMatId && poMatId === matId) || (poMatName && (poMatName === matName || poMatName.includes(matName) || matName.includes(poMatName)));
        if (isMatch) {
          const qty = Number(po.qty) || 0;
          totalPurchased += qty;

          // Track latest price
          if (po.unitPrice && Number(po.unitPrice) > 0) {
            latestPrice = Number(po.unitPrice);
          }
        }
      });

      // 2. Calculate Total Consumed from Manufacturing Batches
      let totalConsumed = 0;
      const stdQty = bomMap[matId] !== undefined ? bomMap[matId] : (matId === 'RM001' || matId === 'RM002' ? 0.5 : matId === 'RM010' || matId === 'RM014' ? 2 : 1);

      (manufacturing || []).forEach(batch => {
        const batchQty = Number(batch.qty) || 0;
        if (batch.status !== 'No Production' && batchQty > 0) {
          if (batch.actualMaterials && batch.actualMaterials[matId] !== undefined) {
            totalConsumed += Number(batch.actualMaterials[matId]) || 0;
          } else {
            totalConsumed += batchQty * stdQty;
          }
        }
      });

      // Baseline warehouse stock as of 31/07
      const baseline = mat.baselineStock !== undefined ? Number(mat.baselineStock) : (Number(mat.currentStock) || 0);

      // Live Current Stock
      const currentStock = Math.max(0, baseline + totalPurchased - totalConsumed);

      // Status
      const min = Number(mat.minStock) || 0;
      let status = 'Healthy';
      if (currentStock <= min) status = 'Low';
      else if (currentStock <= min * 1.5) status = 'Medium';

      return {
        ...mat,
        baselineStock: baseline,
        totalPurchased,
        totalConsumed,
        currentStock,
        price: latestPrice,
        latestPrice,
        status
      };
    });
  }, [materials, purchases, manufacturing, bom]);

  // Toast Notifications State
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const pushPendingLocalEditsToSheets = (url) => {
    if (!url || !url.startsWith('http')) return;
    try {
      // 1. Push local manufacturing edits
      const savedMfg = localStorage.getItem('hard2soft_manufacturing_edited_map');
      if (savedMfg) {
        const mfgMap = JSON.parse(savedMfg);
        Object.values(mfgMap).forEach(batch => {
          sendSheetsTransaction(url, 'updateManufacturing', batch);
        });
        // Retain hard2soft_manufacturing_edited_map so local edits persist across all auto-sync cycles
      }

      // 2. Push local dispatch / sales edits
      const savedDispatch = localStorage.getItem('hard2soft_dispatch_local_map');
      if (savedDispatch) {
        const dispatchMap = JSON.parse(savedDispatch);
        Object.values(dispatchMap).forEach(order => {
          sendSheetsTransaction(url, 'updateSalesDispatch', order);
        });
      }
    } catch (e) {
      console.error("Error pushing pending local edits to sheets:", e);
    }
  };

  // Auto-sync live Google Sheets data on app load & auto-poll every 30s for multi-device sync
  useEffect(() => {
    const performSync = () => {
      const savedUrl = localStorage.getItem('hard2soft_web_app_url') || DEFAULT_WEB_APP_URL;
      setIsSyncingSheets(true);

      // Auto-push any local pending edits to Google Sheets Webhook
      pushPendingLocalEditsToSheets(savedUrl);

      fetchLiveSheetsData(savedUrl)
        .then(liveData => {
          handleSyncLiveData(liveData);
        })
        .catch(err => {
          console.warn("Auto-sync notice:", err);
        })
        .finally(() => {
          setIsSyncingSheets(false);
        });
    };

    performSync();
    // Auto-poll every 30 seconds so all employee phones & laptops stay in sync!
    const intervalId = setInterval(performSync, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const handleManualSync = () => {
    setIsSyncingSheets(true);
    const savedUrl = localStorage.getItem('hard2soft_web_app_url') || DEFAULT_WEB_APP_URL;

    // Push local pending edits to Google Sheets Webhook on manual sync
    pushPendingLocalEditsToSheets(savedUrl);

    fetchLiveSheetsData(savedUrl)
      .then(liveData => {
        handleSyncLiveData(liveData);
        addToast('Live Google Sheets data synchronized successfully!', 'success');
      })
      .catch(err => {
        console.error("Sync error:", err);
        addToast('Could not reach Google Sheets. Verified offline dataset loaded.', 'info');
      })
      .finally(() => {
        setIsSyncingSheets(false);
      });
  };

  // Login Handler with Role-Based Default Page Landing
  const handleLogin = (userData) => {
    setCurrentUser(userData);
    setIsLoggedIn(true);
    localStorage.setItem('hard2soft_current_user', JSON.stringify(userData));
    localStorage.setItem('hard2soft_logged_in', 'true');
    
    const targetPage = 'dashboard';
    setCurrentPage(targetPage);
    localStorage.setItem('hard2soft_current_page', targetPage);
    addToast(`Welcome, ${userData.name} (${userData.role})! Connected to Hard2Soft Workspace.`);
  };

  // Logout Handler - Completely clears session and forces login view
  const handleLogout = () => {
    localStorage.removeItem('hard2soft_current_user');
    localStorage.removeItem('hard2soft_logged_in');
    localStorage.removeItem('hard2soft_current_page');
    setCurrentUser(null);
    setIsLoggedIn(false);
    setCurrentPage('login');
    addToast('Logged out of Hard2Soft workspace.', 'info');
  };

  // Sync Live Data from Google Sheet with merge protection for user edits
  const handleSyncLiveData = (liveData) => {
    if (!liveData) return;
    if (liveData.rawMaterials && liveData.rawMaterials.length > 0) {
      setMaterials(liveData.rawMaterials);
    }
    if (liveData.bom && liveData.bom.length > 0) {
      setBOM(liveData.bom);
    }
    if (liveData.purchases && liveData.purchases.length > 0) {
      try {
        const editedMapStr = localStorage.getItem('hard2soft_purchases_edited_map');
        const editedMap = editedMapStr ? JSON.parse(editedMapStr) : {};
        
        const localSavedStr = localStorage.getItem('hard2soft_purchases');
        const localSaved = localSavedStr ? JSON.parse(localSavedStr) : [];

        // 1. Merge live sheet POs with user edits
        const mergedPurchases = liveData.purchases.map(p => {
          const key = p.id || p.poNo;
          if (editedMap[key]) {
            return { ...p, ...editedMap[key] };
          }
          return p;
        });

        // 2. Preserve any newly added POs from local storage that are not in the sheet yet
        const existingIds = new Set(mergedPurchases.map(p => String(p.id || '').toUpperCase()));

        if (Array.isArray(localSaved)) {
          localSaved.forEach(po => {
            const id = String(po.id || '').toUpperCase();
            if (id && !existingIds.has(id)) {
              mergedPurchases.unshift(po);
              existingIds.add(id);
            }
          });
        }

        Object.values(editedMap).forEach(po => {
          const id = String(po.id || '').toUpperCase();
          if (id && !existingIds.has(id)) {
            mergedPurchases.unshift(po);
            existingIds.add(id);
          }
        });

        setPurchases(mergedPurchases);
        localStorage.setItem('hard2soft_purchases', JSON.stringify(mergedPurchases));
      } catch (e) {
        console.error("Error merging purchases:", e);
        setPurchases(liveData.purchases);
      }
    }
    if (liveData.manufacturing && liveData.manufacturing.length > 0) {
      try {
        // Clear any old suppression keys from local storage so live sheet batches are never hidden
        localStorage.removeItem('hard2soft_manufacturing_deleted_ids');

        const savedEdited = localStorage.getItem('hard2soft_manufacturing_edited_map');
        const editedMap = savedEdited ? JSON.parse(savedEdited) : {};

        // Apply locally edited batches to live sheet batches
        const finalMfg = liveData.manufacturing.map(m => {
          // If Google Sheets already has custom raw material numbers written in Columns I..V, let Google Sheets be the single source of truth across all laptops!
          if (m.hasSheetCustomMix) {
            return m;
          }

          const mNo = String(m.batchNo || '').trim();
          const mId = String(m.id || '').trim();
          const mNorm = mNo.toUpperCase().replace(/O/g, '0');
          const mLower = mNorm.toLowerCase();
          const mDate = String(m.date || '').trim().toLowerCase();

          let localEdited = editedMap[mId] || editedMap[mNo] || (mNorm ? editedMap[mNorm] : null) || (mLower ? editedMap[mLower] : null) || (mDate ? editedMap[mDate] : null);

          if (!localEdited && editedMap) {
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
                localEdited = edit;
                break;
              }
            }
          }

          if (localEdited && localEdited.actualMaterials) {
            return {
              ...m,
              ...localEdited,
              actualMaterials: {
                ...m.actualMaterials,
                ...localEdited.actualMaterials
              }
            };
          }
          return m;
        });

        setManufacturing(finalMfg);
        localStorage.setItem('hard2soft_manufacturing', JSON.stringify(finalMfg));
      } catch (e) {
        console.error("Error merging live manufacturing data:", e);
        setManufacturing(liveData.manufacturing);
      }
    }
    if (liveData.dispatch && liveData.dispatch.length > 0) {
      try {
        const localSavedDispatch = localStorage.getItem('hard2soft_dispatch');
        const localSavedMap = localStorage.getItem('hard2soft_dispatch_local_map');
        const localMap = localSavedMap ? JSON.parse(localSavedMap) : {};
        const localList = localSavedDispatch ? JSON.parse(localSavedDispatch) : [];

        const sheetOrders = deduplicateOrders(liveData.dispatch);
        const mergedOrdersMap = {};

        sheetOrders.forEach(o => {
          const key = o.srNo ? `SR_${o.srNo}` : (o.orderId || o.id);
          mergedOrdersMap[key] = localMap[key] ? { ...o, ...localMap[key] } : o;
        });

        if (Array.isArray(localList)) {
          localList.forEach(locOrder => {
            const key = locOrder.srNo ? `SR_${locOrder.srNo}` : (locOrder.orderId || locOrder.id);
            if (key && !mergedOrdersMap[key]) {
              mergedOrdersMap[key] = locOrder;
            }
          });
        }

        const finalDispatch = deduplicateOrders(Object.values(mergedOrdersMap));
        setDispatch(finalDispatch);
        localStorage.setItem('hard2soft_dispatch', JSON.stringify(finalDispatch));
      } catch (e) {
        console.error("Error merging dispatch edits:", e);
        const cleanOrders = deduplicateOrders(liveData.dispatch);
        setDispatch(cleanOrders);
        localStorage.setItem('hard2soft_dispatch', JSON.stringify(cleanOrders));
      }
    }

    // Preserve local operating expenses across syncs
    const localSavedExp = localStorage.getItem('hard2soft_operating_expenses');
    if (localSavedExp) {
      try {
        const parsedExp = JSON.parse(localSavedExp);
        if (Array.isArray(parsedExp) && parsedExp.length > 0) {
          setOperatingExpenses(parsedExp);
        }
      } catch (e) {
        console.error("Error loading local operating expenses:", e);
      }
    }
    if (liveData.fifoAuditLedger && liveData.fifoAuditLedger.length > 0) {
      setFifoAuditLedger(liveData.fifoAuditLedger);
    }
    if (liveData.finishedGoodsSummary) {
      setFinishedGoodsSummary(liveData.finishedGoodsSummary);
    }
  };

  // Handlers for Operations
  const handleAddMaterial = (newMat) => {
    setMaterials(prev => [newMat, ...prev]);
    addToast(`Added raw material "${newMat.name}" (${newMat.id}).`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'addRawMaterial', newMat);
    }
  };

  const handleDeleteMaterial = (id) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
    addToast(`Deleted material ${id} from stock registry.`, 'error');
  };

  const handleAddPurchase = (newPO) => {
    setPurchases(prev => {
      const updated = [newPO, ...prev];
      localStorage.setItem('hard2soft_purchases', JSON.stringify(updated));
      return updated;
    });

    try {
      const existingEdited = localStorage.getItem('hard2soft_purchases_edited_map');
      const map = existingEdited ? JSON.parse(existingEdited) : {};
      map[newPO.id] = newPO;
      localStorage.setItem('hard2soft_purchases_edited_map', JSON.stringify(map));
    } catch (e) {
      console.error(e);
    }

    addToast(`Issued Purchase Order ${newPO.id} for ${newPO.supplier}.`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'addPurchase', newPO);
    }
  };

  const handleEditPurchase = (updatedPO) => {
    setPurchases(prev => {
      const updated = prev.map(p => p.id === updatedPO.id ? updatedPO : p);
      localStorage.setItem('hard2soft_purchases', JSON.stringify(updated));
      return updated;
    });

    // Save to edited map so that auto-sync on refresh does not override it
    try {
      const existingEdited = localStorage.getItem('hard2soft_purchases_edited_map');
      const map = existingEdited ? JSON.parse(existingEdited) : {};
      map[updatedPO.id] = updatedPO;
      localStorage.setItem('hard2soft_purchases_edited_map', JSON.stringify(map));
    } catch (e) {
      console.error("Error saving purchase edit map:", e);
    }

    addToast(`Updated Purchase Order ${updatedPO.id} (${updatedPO.supplier} - ${updatedPO.material}).`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'editPurchase', updatedPO);
    }
  };

  const handleDeletePurchase = (poId) => {
    setPurchases(prev => {
      const updated = prev.filter(p => p.id !== poId);
      localStorage.setItem('hard2soft_purchases', JSON.stringify(updated));
      return updated;
    });

    try {
      const saved = localStorage.getItem('hard2soft_purchases');
      const list = saved ? JSON.parse(saved) : [];
      const updated = list.filter(p => p.id !== poId);
      localStorage.setItem('hard2soft_purchases', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }

    addToast(`Deleted Purchase Order ${poId}.`, 'info');
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'deletePurchase', { id: poId });
    }
  };

  const handleDownloadFullLiveBackup = () => {
    try {
      const fullBackup = {
        purchases: localStorage.getItem('hard2soft_purchases') ? JSON.parse(localStorage.getItem('hard2soft_purchases')) : purchases,
        operatingExpenses: localStorage.getItem('hard2soft_operating_expenses') ? JSON.parse(localStorage.getItem('hard2soft_operating_expenses')) : operatingExpenses,
        manufacturing: localStorage.getItem('hard2soft_manufacturing') ? JSON.parse(localStorage.getItem('hard2soft_manufacturing')) : manufacturing,
        dispatch: localStorage.getItem('hard2soft_dispatch') ? JSON.parse(localStorage.getItem('hard2soft_dispatch')) : dispatch,
        dispatch_local_map: localStorage.getItem('hard2soft_dispatch_local_map') ? JSON.parse(localStorage.getItem('hard2soft_dispatch_local_map')) : {},
        purchases_edited_map: localStorage.getItem('hard2soft_purchases_edited_map') ? JSON.parse(localStorage.getItem('hard2soft_purchases_edited_map')) : {},
        materials: localStorage.getItem('hard2soft_materials') ? JSON.parse(localStorage.getItem('hard2soft_materials')) : computedMaterials
      };

      const jsonStr = JSON.stringify(fullBackup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `full_live_backup.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast('Saved full_live_backup.json to Downloads folder!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Failed to export backup JSON', 'error');
    }
  };

  const handleAddManufacturing = (newBatch) => {
    // Un-suppress batch from local deleted registry if re-added
    try {
      const savedDeleted = localStorage.getItem('hard2soft_manufacturing_deleted_ids');
      if (savedDeleted) {
        let deletedList = JSON.parse(savedDeleted);
        const normKey = String(newBatch.batchNo || newBatch.id).toUpperCase().replace(/O/g, '0');
        deletedList = deletedList.filter(d => {
          const dNo = String(typeof d === 'object' ? (d.batchNo || d.id || '') : d).toUpperCase().replace(/O/g, '0');
          return dNo !== normKey;
        });
        localStorage.setItem('hard2soft_manufacturing_deleted_ids', JSON.stringify(deletedList));
      }
    } catch (e) {
      console.error(e);
    }

    setManufacturing(prev => {
      const updated = [newBatch, ...prev.filter(m => m.id !== newBatch.id && m.batchNo !== newBatch.batchNo)];
      localStorage.setItem('hard2soft_manufacturing', JSON.stringify(updated));
      return updated;
    });

    try {
      const existingEdited = localStorage.getItem('hard2soft_manufacturing_edited_map');
      const map = existingEdited ? JSON.parse(existingEdited) : {};
      const normKey = String(newBatch.batchNo || newBatch.id).toUpperCase().replace(/O/g, '0');
      map[newBatch.id] = newBatch;
      map[normKey] = newBatch;
      if (newBatch.date) map[String(newBatch.date).toLowerCase()] = newBatch;
      localStorage.setItem('hard2soft_manufacturing_edited_map', JSON.stringify(map));
    } catch (e) {
      console.error("Error saving manufacturing edit map:", e);
    }

    addToast(`Logged manufacturing batch ${newBatch.batchNo || newBatch.id} with custom material consumption.`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'addManufacturing', newBatch);
    }
  };

  const handleUpdateManufacturing = (updatedBatch) => {
    setManufacturing(prev => {
      const updated = prev.map(m => {
        const normM = String(m.batchNo || m.id || '').toUpperCase().replace(/O/g, '0');
        const normUp = String(updatedBatch.batchNo || updatedBatch.id || '').toUpperCase().replace(/O/g, '0');
        const normOrig = updatedBatch.originalId ? String(updatedBatch.originalId).toUpperCase() : '';
        const isMatch = (
          m.id === updatedBatch.id ||
          (updatedBatch.originalId && m.id === updatedBatch.originalId) ||
          normM === normUp ||
          (normOrig && normM === normOrig) ||
          (m.date && updatedBatch.date && String(m.date).trim().toLowerCase() === String(updatedBatch.date).trim().toLowerCase())
        );
        return isMatch ? { ...m, ...updatedBatch } : m;
      });
      localStorage.setItem('hard2soft_manufacturing', JSON.stringify(updated));
      return updated;
    });

    try {
      const existingEdited = localStorage.getItem('hard2soft_manufacturing_edited_map');
      const map = existingEdited ? JSON.parse(existingEdited) : {};
      const normKey = String(updatedBatch.batchNo || updatedBatch.id).toUpperCase().replace(/O/g, '0');

      if (updatedBatch.id) map[updatedBatch.id] = updatedBatch;
      if (updatedBatch.originalId) map[updatedBatch.originalId] = updatedBatch;
      if (updatedBatch.batchNo) map[updatedBatch.batchNo] = updatedBatch;
      if (normKey) map[normKey] = updatedBatch;
      if (updatedBatch.date) map[String(updatedBatch.date).trim().toLowerCase()] = updatedBatch;

      localStorage.setItem('hard2soft_manufacturing_edited_map', JSON.stringify(map));
    } catch (e) {
      console.error("Error saving manufacturing edit map:", e);
    }

    addToast(`Saved custom material consumption for batch ${updatedBatch.batchNo || updatedBatch.id}.`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'updateManufacturing', updatedBatch);
    }
  };

  const handleDeleteManufacturing = (batchInput) => {
    const targetBatchNo = typeof batchInput === 'object' ? (batchInput.batchNo || batchInput.id) : batchInput;
    const targetId = typeof batchInput === 'object' ? (batchInput.id || batchInput.batchNo) : batchInput;
    const targetDate = typeof batchInput === 'object' ? batchInput.date : null;
    const normTarget = String(targetBatchNo || '').toUpperCase().replace(/O/g, '0');

    // 1. Save to local deleted registry so live sheet polling never restores it
    try {
      const savedDeleted = localStorage.getItem('hard2soft_manufacturing_deleted_ids');
      const deletedList = savedDeleted ? JSON.parse(savedDeleted) : [];
      deletedList.push({
        id: targetId,
        batchNo: targetBatchNo,
        date: targetDate
      });
      localStorage.setItem('hard2soft_manufacturing_deleted_ids', JSON.stringify(deletedList));
    } catch (e) {
      console.error("Error saving manufacturing deleted item:", e);
    }

    // 2. Filter out batch from reactive state and localStorage
    setManufacturing(prev => {
      const updated = prev.filter(m => {
        const mNo = String(m.batchNo || '').trim();
        const mId = String(m.id || '').trim();
        const mNorm = mNo.toUpperCase().replace(/O/g, '0');
        const mDate = String(m.date || '').trim();

        const isMatch = (mNo === String(targetBatchNo).trim() || mId === String(targetId).trim() || mNorm === normTarget);
        if (isMatch) {
          if (targetDate && mDate) return mDate !== String(targetDate).trim();
          return false;
        }
        return true;
      });
      localStorage.setItem('hard2soft_manufacturing', JSON.stringify(updated));
      return updated;
    });

    // 3. Remove from edit map
    try {
      const existingEdited = localStorage.getItem('hard2soft_manufacturing_edited_map');
      if (existingEdited) {
        const map = JSON.parse(existingEdited);
        delete map[targetId];
        delete map[targetBatchNo];
        delete map[normTarget];
        localStorage.setItem('hard2soft_manufacturing_edited_map', JSON.stringify(map));
      }
    } catch (e) {
      console.error("Error updating manufacturing edit map on delete:", e);
    }

    addToast(`Deleted Manufacturing Batch ${targetBatchNo || targetId}.`, 'info');
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'deleteManufacturing', { id: targetId, batchNo: targetBatchNo, date: targetDate });
    }
  };

  const handleAddDispatch = (newDispatch) => {
    setDispatch(prev => {
      const updated = deduplicateOrders([newDispatch, ...prev.filter(d => d.id !== newDispatch.id && d.srNo !== newDispatch.srNo && d.orderId !== newDispatch.orderId)]);
      localStorage.setItem('hard2soft_dispatch', JSON.stringify(updated));
      return updated;
    });

    try {
      const existingMap = localStorage.getItem('hard2soft_dispatch_local_map');
      const map = existingMap ? JSON.parse(existingMap) : {};
      const key = newDispatch.orderId || newDispatch.id || newDispatch.srNo;
      map[key] = newDispatch;
      map[newDispatch.srNo] = newDispatch;
      localStorage.setItem('hard2soft_dispatch_local_map', JSON.stringify(map));
    } catch (e) {
      console.error("Error saving local dispatch:", e);
    }

    addToast(`Recorded order ${newDispatch.orderId || newDispatch.srNo} for ${newDispatch.customer}.`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'addSalesDispatch', newDispatch);
    }
  };

  const handleUpdateDispatch = (updatedDispatch) => {
    setDispatch(prev => {
      const updated = deduplicateOrders(prev.map(d => (d.id === updatedDispatch.id || d.srNo === updatedDispatch.srNo || d.orderId === updatedDispatch.orderId) ? updatedDispatch : d));
      localStorage.setItem('hard2soft_dispatch', JSON.stringify(updated));
      return updated;
    });

    try {
      const existingMap = localStorage.getItem('hard2soft_dispatch_local_map');
      const map = existingMap ? JSON.parse(existingMap) : {};
      const key = updatedDispatch.orderId || updatedDispatch.id || updatedDispatch.srNo;
      map[key] = updatedDispatch;
      map[updatedDispatch.srNo] = updatedDispatch;
      localStorage.setItem('hard2soft_dispatch_local_map', JSON.stringify(map));
    } catch (e) {
      console.error("Error saving local dispatch edit:", e);
    }

    addToast(`Updated order ${updatedDispatch.orderId || updatedDispatch.srNo} (${updatedDispatch.customer}).`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'updateSalesDispatch', updatedDispatch);
    }
  };

  const handleDeleteDispatch = (orderId) => {
    setDispatch(prev => {
      const updated = prev.filter(d => d.id !== orderId && d.srNo !== orderId && d.orderId !== orderId);
      localStorage.setItem('hard2soft_dispatch', JSON.stringify(updated));
      return updated;
    });

    try {
      const existingMap = localStorage.getItem('hard2soft_dispatch_local_map');
      if (existingMap) {
        const map = JSON.parse(existingMap);
        delete map[orderId];
        localStorage.setItem('hard2soft_dispatch_local_map', JSON.stringify(map));
      }
    } catch (e) {
      console.error(e);
    }

    addToast(`Deleted order ${orderId} from Sales & Dispatch records.`, 'error');
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'deleteSalesDispatch', { id: orderId });
    }
  };

  const handleAddExpense = (newExpense) => {
    setOperatingExpenses(prev => {
      const updated = [newExpense, ...prev];
      localStorage.setItem('hard2soft_operating_expenses', JSON.stringify(updated));
      return updated;
    });
    addToast(`Logged operating expense ₹${newExpense.baseAmount} (${newExpense.category}).`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'addExpense', newExpense);
    }
  };

  const handleEditExpense = (updatedExpense) => {
    setOperatingExpenses(prev => {
      const updated = prev.map(e => e.id === updatedExpense.id ? updatedExpense : e);
      localStorage.setItem('hard2soft_operating_expenses', JSON.stringify(updated));
      return updated;
    });
    addToast(`Updated operating expense ₹${updatedExpense.baseAmount} (${updatedExpense.category}).`);
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'editExpense', updatedExpense);
    }
  };

  const handleDeleteExpense = (expenseId) => {
    setOperatingExpenses(prev => {
      const updated = prev.filter(e => e.id !== expenseId);
      localStorage.setItem('hard2soft_operating_expenses', JSON.stringify(updated));
      return updated;
    });
    addToast(`Deleted operating expense from ledger.`, 'error');
    if (webAppUrl) {
      sendSheetsTransaction(webAppUrl, 'deleteExpense', { id: expenseId });
    }
  };

  const handleAddUser = (newUser) => {
    setUsers(prev => [...prev, newUser]);
  };

  // Render Full Screen Login if on Login page or logged out or no active user
  if (!isLoggedIn || !currentUser || currentPage === 'login') {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toast toasts={toasts} removeToast={removeToast} />
      </>
    );
  }

  // Get Page Titles
  const getPageInfo = (page) => {
    switch (page) {
      case 'dashboard':
        if (isMarketing) {
          return { title: 'Commercial Growth & Sales Dashboard', subtitle: 'Live finished goods stock, revenue velocity, regional state demand, and customer orders.' };
        }
        return { title: 'Executive Overview', subtitle: 'Real-time inventory metrics, daily production yields, and logistics status.' };
      case 'raw-materials':
        return { title: 'Raw Materials Registry', subtitle: 'Monitor stock levels, safety thresholds, and unit costs.' };
      case 'bom':
        return { title: 'Bill of Materials (BOM)', subtitle: 'Standard raw material requirements and unit assembly recipe costs.' };
      case 'purchases':
        return { title: 'Supplier Procurement', subtitle: 'Manage active purchase orders, delivery statuses, and supplier invoices.' };
      case 'manufacturing':
        return { title: 'Factory Floor Operations', subtitle: 'Track batch production yields, shift allocations, and QA checks.' };
      case 'dispatch':
        return { title: 'Sales & Dispatch Order Management', subtitle: 'Unified customer orders, automated GST split, courier bags, and live inventory sync.' };
      case 'analytics':
        return { title: 'Business Analytics & Cost Intelligence', subtitle: 'Executive financial insights, FIFO valuation, P&L statements, and GST analytics.' };
      case 'settings':
        return { title: 'System Settings & Google Sheets', subtitle: 'Configure organization metadata, RBAC user access, Google Sheets, and alerts.' };
      default:
        return { title: 'Dashboard', subtitle: 'Hard2Soft Inventory' };
    }
  };

  const userRole = currentUser?.role || 'Administrator';
  const isAdmin = userRole === 'Administrator';
  const isMarketing = userRole === 'Marketing' || String(userRole).toLowerCase().includes('marketing');
  const isEmployee = userRole === 'Employee' || String(userRole).toLowerCase().includes('employee') || String(userRole).toLowerCase().includes('lead') || String(userRole).toLowerCase().includes('operator');

  // RBAC active page resolution
  let activePage = currentPage;
  if (isEmployee && currentPage !== 'dashboard' && currentPage !== 'manufacturing' && currentPage !== 'dispatch') {
    activePage = 'dashboard';
  } else if (isMarketing && currentPage !== 'dashboard' && currentPage !== 'dispatch' && currentPage !== 'analytics') {
    activePage = 'dashboard';
  }

  const { title, subtitle } = getPageInfo(activePage);

  return (
    <div className="app-container">
      {/* Floating Collapsible Glass Sidebar */}
      <Sidebar 
        currentPage={activePage}
        setCurrentPage={setCurrentPage}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        user={currentUser}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Sticky Glass Header */}
        <Header 
          pageTitle={title}
          pageSubtitle={subtitle}
          onQuickAction={() => setCurrentPage(isEmployee ? 'manufacturing' : 'dispatch')}
          notifications={notifications}
          setNotifications={setNotifications}
          isSyncing={isSyncingSheets}
          currentUser={currentUser}
          onLogout={handleLogout}
          onSyncSheets={handleManualSync}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
          isMobileMenuOpen={mobileMenuOpen}
          webAppUrl={webAppUrl}
          setWebAppUrl={setWebAppUrl}
        />

        {/* Prominent Backup Exporter Banner for Transferring Local State */}
        <div style={{
          marginBottom: '20px',
          padding: '16px 20px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #0F4C3A 0%, #16644d 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 4px 14px rgba(15, 76, 58, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>📦</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                Transfer Updated Browser Data to Official GitHub Website
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Click the green button on the right to download <code>full_live_backup.json</code> containing all 6 purchases, expenses & sales.
              </div>
            </div>
          </div>
          <button
            onClick={handleDownloadFullLiveBackup}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              background: '#22C55E',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          >
            📥 Download full_live_backup.json
          </button>
        </div>

        {/* Dynamic View Navigation with RBAC */}
        {activePage === 'dashboard' && (
          isMarketing ? (
            <MarketingDashboard 
              dispatch={dispatch}
              manufacturing={manufacturing}
              navigateTo={setCurrentPage}
            />
          ) : (
            <Dashboard 
              rawMaterials={computedMaterials}
              purchases={purchases}
              manufacturing={manufacturing}
              dispatch={dispatch}
              navigateTo={setCurrentPage}
              onQuickAdd={(type) => {
                if (type === 'purchase') {
                  if (isAdmin) setCurrentPage('purchases');
                  else addToast('Supplier Procurement is restricted to Administrator.', 'info');
                } else if (type === 'mfg') {
                  if (isAdmin || isEmployee) setCurrentPage('manufacturing');
                  else addToast('Manufacturing is restricted to Operations & Admin.', 'info');
                }
              }}
            />
          )
        )}

        {isAdmin && activePage === 'raw-materials' && (
          <RawMaterials 
            materials={computedMaterials}
            onAddMaterial={handleAddMaterial}
            onDeleteMaterial={handleDeleteMaterial}
          />
        )}

        {isAdmin && activePage === 'bom' && (
          <BOM bom={bom} rawMaterials={computedMaterials} />
        )}

        {isAdmin && activePage === 'purchases' && (
          <Purchases 
            purchases={purchases}
            materials={computedMaterials}
            onAddPurchase={handleAddPurchase}
            onEditPurchase={handleEditPurchase}
            onDeletePurchase={handleDeletePurchase}
          />
        )}

        {(isAdmin || isEmployee) && activePage === 'manufacturing' && (
          <Manufacturing 
            manufacturing={manufacturing}
            materials={computedMaterials}
            bom={bom}
            onAddManufacturing={handleAddManufacturing}
            onUpdateManufacturing={handleUpdateManufacturing}
            onDeleteManufacturing={handleDeleteManufacturing}
          />
        )}

        {(isAdmin || isEmployee || isMarketing) && activePage === 'dispatch' && (
          <Dispatch 
            dispatch={dispatch}
            onAddDispatch={handleAddDispatch}
            onUpdateDispatch={handleUpdateDispatch}
            onDeleteDispatch={handleDeleteDispatch}
            onSyncSheets={handleManualSync}
            isSyncing={isSyncingSheets}
          />
        )}

        {(isAdmin || isMarketing) && activePage === 'analytics' && (
          <BusinessAnalytics 
            userRole={currentUser?.role}
            rawMaterials={computedMaterials}
            bom={bom}
            purchases={purchases}
            manufacturing={manufacturing}
            dispatch={dispatch}
            finishedGoodsSummary={finishedGoodsSummary}
            operatingExpenses={operatingExpenses}
            onAddExpense={handleAddExpense}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
            fifoAuditLedger={fifoAuditLedger}
          />
        )}

        {isAdmin && activePage === 'settings' && (
          <Settings 
            users={users}
            onAddUser={handleAddUser}
            showToast={addToast}
            webAppUrl={webAppUrl}
            setWebAppUrl={setWebAppUrl}
            onSyncLiveData={handleSyncLiveData}
          />
        )}
      </main>

      {/* Toast Notification Container */}
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
