import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  Factory, 
  User, 
  CheckCircle2, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  Sliders, 
  Edit2, 
  Trash2,
  FileText, 
  AlertCircle, 
  Sparkles,
  RotateCcw,
  Check,
  PackageCheck
} from 'lucide-react';
import Modal from '../components/Modal';

export default function Manufacturing({ 
  manufacturing = [], 
  onAddManufacturing, 
  onUpdateManufacturing, 
  onDeleteManufacturing,
  materials = [], 
  bom = [] 
}) {
  const [search, setSearch] = useState('');
  const [filterVariance, setFilterVariance] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [deleteConfirmBatch, setDeleteConfirmBatch] = useState(null);

  const handlePromptDelete = (batch) => {
    setDeleteConfirmBatch(batch);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmBatch && onDeleteManufacturing) {
      onDeleteManufacturing(deleteConfirmBatch);
      setDeleteConfirmBatch(null);
    }
  };

  // Form state
  const [batchNo, setBatchNo] = useState('');
  const [batchDate, setBatchDate] = useState('');
  const [product, setProduct] = useState('Hard2Soft');
  const [qty, setQty] = useState('20');
  const [sleevesUsed, setSleevesUsed] = useState('20');
  const [operator, setOperator] = useState('MAYURI');
  const [status, setStatus] = useState('Completed');
  const [remarks, setRemarks] = useState('');

  // Per-Material Actual Consumption State map: { [matId]: actualQty }
  const [actualConsumption, setActualConsumption] = useState({});

  // Canonical BOM Recipe Reference with clear per-unit recipe standard (RM001 to RM014)
  const bomRecipe = useMemo(() => {
    if (bom && bom.length >= 14) return bom;
    const defaultList = [
      { materialId: 'RM001', material: 'ANTI-SCALANT BALLS', stdQtyPerProduct: 0.5, unit: 'KG' },
      { materialId: 'RM002', material: 'POLYPHOSPHATE', stdQtyPerProduct: 0.5, unit: 'KG' },
      { materialId: 'RM003', material: 'CLOTH BAG', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM004', material: 'WOVEN CLOTH', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM005', material: 'NON WOVEN CLOTH', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM006', material: 'CABLE TIE', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM007', material: 'BLUE CONTAINOR', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM008', material: 'BIG CAP', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM009', material: 'SMALL CAPS', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM010', material: 'STRING', stdQtyPerProduct: 2, unit: 'M' },
      { materialId: 'RM011', material: 'BROUCHER', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM012', material: 'PLASTIC SLEEVES', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM013', material: 'PACKAGING BOX', stdQtyPerProduct: 1, unit: 'PCS' },
      { materialId: 'RM014', material: 'ROUND STICKERS', stdQtyPerProduct: 2, unit: 'PCS' }
    ];

    if (!bom || bom.length === 0) return defaultList;

    // Merge incoming BOM with standard 14 list so no material is missing
    const bomMap = {};
    bom.forEach(b => { if (b.materialId) bomMap[b.materialId] = b; });
    return defaultList.map(item => bomMap[item.materialId] ? { ...item, ...bomMap[item.materialId] } : item);
  }, [bom]);

  // Compute Standard BOM Requirements for given Qty
  const computedBOM = useMemo(() => {
    const numUnits = Number(qty) || 0;
    return bomRecipe.map(item => {
      const perUnitStd = item.stdQtyPerProduct !== undefined ? Number(item.stdQtyPerProduct) : (item.materialId === 'RM001' || item.materialId === 'RM002' ? 0.5 : item.materialId === 'RM010' ? 2 : 1);
      const totalStdRequired = numUnits * perUnitStd;
      const currentActual = actualConsumption[item.materialId] !== undefined ? Number(actualConsumption[item.materialId]) : totalStdRequired;
      const actualPerUnit = numUnits > 0 ? (currentActual / numUnits) : perUnitStd;
      const variance = currentActual - totalStdRequired;

      return {
        ...item,
        perUnitStd, // Exact piece recipe (e.g. 0.5 KG / unit)
        totalStdRequired, // Batch requirement (e.g. 10 KG for 20 units)
        actualQty: currentActual,
        actualPerUnit,
        variance
      };
    });
  }, [qty, bomRecipe, actualConsumption]);

  // Overall Batch Material Variance Status
  const batchVarianceSummary = useMemo(() => {
    let totalStd = 0;
    let totalAct = 0;
    computedBOM.forEach(item => {
      totalStd += item.totalStdRequired;
      totalAct += item.actualQty;
    });

    const netDiff = totalAct - totalStd;
    if (Math.abs(netDiff) < 0.001) return { status: 'Exact BOM', badge: 'badge-healthy', label: 'Exact BOM Recipe (100% Target)' };
    if (netDiff > 0) return { status: 'Overconsumed', badge: 'badge-low', label: `+${netDiff.toFixed(2)} Extra Used (Scrap / Wastage)` };
    return { status: 'Material Saved', badge: 'badge-purple', label: `${Math.abs(netDiff).toFixed(2)} Saved (High Efficiency)` };
  }, [computedBOM]);

  // Open Modal for New Batch
  const handleOpenNewBatchModal = () => {
    setEditingBatch(null);
    const nextBatchNum = String(manufacturing.length + 1).padStart(3, '0');
    const autoBatchNo = `B${nextBatchNum}`;
    const todayDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
    
    setBatchNo(autoBatchNo);
    setBatchDate(todayDate);
    setProduct('Hard2Soft');
    setQty('20');
    setSleevesUsed('20');
    setOperator('MAYURI');
    setStatus('Completed');
    setRemarks('');

    // Pre-populate with standard BOM
    const initialMap = {};
    bomRecipe.forEach(item => {
      const perUnit = item.stdQtyPerProduct !== undefined ? Number(item.stdQtyPerProduct) : (item.materialId === 'RM001' || item.materialId === 'RM002' ? 0.5 : item.materialId === 'RM010' ? 2 : 1);
      initialMap[item.materialId] = 20 * perUnit;
    });
    setActualConsumption(initialMap);
    setIsModalOpen(true);
  };

  // Open Modal for Editing Batch
  const handleStartEdit = (mfg) => {
    setEditingBatch(mfg);
    setBatchNo(mfg.batchNo || mfg.id || 'B001');
    setBatchDate(mfg.date || '');
    setProduct(mfg.product || 'Hard2Soft');
    const currentQty = String(mfg.qty || 20);
    setQty(currentQty);
    setSleevesUsed(String(mfg.sleevesUsed || mfg.qty || 20));
    setOperator(mfg.operator || 'MAYURI');
    setStatus(mfg.status || 'Completed');
    setRemarks(mfg.remarks || '');

    // Set actual consumption map from record or calculate
    if (mfg.actualMaterials && Object.keys(mfg.actualMaterials).length > 0) {
      setActualConsumption(mfg.actualMaterials);
    } else {
      const initialMap = {};
      const numUnits = Number(currentQty) || 0;
      bomRecipe.forEach(item => {
        const perUnit = item.stdQtyPerProduct !== undefined ? Number(item.stdQtyPerProduct) : (item.materialId === 'RM001' || item.materialId === 'RM002' ? 0.5 : item.materialId === 'RM010' ? 2 : 1);
        initialMap[item.materialId] = numUnits * perUnit;
      });
      setActualConsumption(initialMap);
    }
    setIsModalOpen(true);
  };

  // Reset actual consumption to exact standard BOM
  const handleResetToStandardBOM = () => {
    const numUnits = Number(qty) || 0;
    const standardMap = {};
    bomRecipe.forEach(item => {
      const perUnit = item.stdQtyPerProduct !== undefined ? Number(item.stdQtyPerProduct) : (item.materialId === 'RM001' || item.materialId === 'RM002' ? 0.5 : item.materialId === 'RM010' ? 2 : 1);
      standardMap[item.materialId] = numUnits * perUnit;
    });
    setActualConsumption(standardMap);
    setSleevesUsed(String(numUnits));
  };

  // Handle Material Actual Input Change
  const handleMaterialActualChange = (matId, val) => {
    setActualConsumption(prev => ({
      ...prev,
      [matId]: Number(val)
    }));
    if (matId === 'RM014') {
      setSleevesUsed(String(val));
    }
  };

  // Submit Manufacturing Batch
  const handleSubmit = (e) => {
    e.preventDefault();
    const finalBatchNo = batchNo || `B${String(manufacturing.length + 1).padStart(3, '0')}`;
    const numUnits = Number(qty || 0);

    const newBatch = {
      id: editingBatch?.id || finalBatchNo,
      originalId: editingBatch?.id,
      batchNo: finalBatchNo,
      date: batchDate || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-'),
      product,
      qty: numUnits,
      sleevesUsed: Number(sleevesUsed || actualConsumption['RM014'] || numUnits),
      operator: operator || 'MAYURI',
      status,
      remarks,
      actualMaterials: actualConsumption,
      varianceStatus: batchVarianceSummary.status,
      varianceLabel: batchVarianceSummary.label
    };

    if (editingBatch && onUpdateManufacturing) {
      onUpdateManufacturing(newBatch);
      setEditingBatch(null);
    } else {
      onAddManufacturing(newBatch);
    }

    setIsModalOpen(false);
  };

  // Parse date string into timestamp for strict chronological sorting
  const parseDateTimestamp = (dateStr) => {
    if (!dateStr) return 0;
    const parts = String(dateStr).trim().split(/[-./ ]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      const mStr = parts[1].toLowerCase().slice(0, 3);
      const month = months[mStr] !== undefined ? months[mStr] : (parseInt(parts[1], 10) - 1);
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day).getTime();
    }
    const d = new Date(dateStr).getTime();
    return isNaN(d) ? 0 : d;
  };

  // Filtered & Strictly Date-wise Ordered Manufacturing list (Pure Date Sequence)
  const filteredMfg = useMemo(() => {
    return (manufacturing || [])
      .filter(m => {
        if (!m) return false;
        const date = String(m.date || '').toLowerCase();
        const bNo = String(m.batchNo || m.id || '').toLowerCase();
        const prod = String(m.product || '').toLowerCase();
        const op = String(m.operator || '').toLowerCase();
        const varStat = String(m.varianceStatus || 'Exact BOM').toLowerCase();

        const matchesSearch = date.includes(search.toLowerCase()) || 
                              bNo.includes(search.toLowerCase()) || 
                              prod.includes(search.toLowerCase()) || 
                              op.includes(search.toLowerCase());

        const matchesVariance = filterVariance === 'All' || 
                                (filterVariance === 'Overconsumed' && varStat.includes('overconsumed')) ||
                                (filterVariance === 'Saved' && varStat.includes('saved')) ||
                                (filterVariance === 'Exact' && varStat.includes('exact'));

        return matchesSearch && matchesVariance;
      })
      .sort((a, b) => parseDateTimestamp(a.date) - parseDateTimestamp(b.date));
  }, [manufacturing, search, filterVariance]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Executive Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px'
      }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Finished Goods Yield</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F4C3A', marginTop: '4px' }}>
            {manufacturing.reduce((acc, m) => acc + (Number(m.qty) || 0), 0)} Units
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>
            Hard2Soft Production Run
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Plastic Sleeves Consumed</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
            {manufacturing.reduce((acc, m) => acc + (Number(m.sleevesUsed) || Number(m.qty) || 0), 0)} PCS
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>
            Actual Shop-Floor Sleeve Usage
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Production Operator</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#7C3AED', marginTop: '4px' }}>
            MAYURI
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>
            Lead Manufacturing Specialist
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Dynamic Material Tracking</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16A34A', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={20} /> Active
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>
            0.5 KG/unit standard + Actual Scrap
          </div>
        </div>
      </div>

      {/* Production & Material Variance Guidance Banner */}
      <div style={{
        padding: '16px 20px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(15, 76, 58, 0.06) 0%, rgba(37, 99, 235, 0.05) 100%)',
        border: '1px solid rgba(15, 76, 58, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '8px', background: '#0F4C3A', borderRadius: '10px', color: '#ffffff' }}>
            <Layers size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0F4C3A', fontSize: '0.9rem' }}>
              Standard BOM Formula (0.5 KG Antiscalant Balls / Unit) vs Actual Consumption
            </div>
            <div style={{ fontSize: '0.775rem', color: '#64748B' }}>
              Standard unit recipe is <strong>0.5 KG per piece</strong>. When you produce 20 units, standard requirement is 10 KG. You can type the actual quantity used if more or less was consumed.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 700 }}>
          <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(22, 163, 74, 0.12)', color: '#15803D' }}>🟢 High Yield</span>
          <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', color: '#B91C1C' }}>🔴 Extra Scrap</span>
          <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(124, 58, 237, 0.12)', color: '#7C3AED' }}>🟣 Exact BOM</span>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="action-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search date, Batch ID (B001), operator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select 
            className="form-control" 
            style={{ width: 'auto', padding: '10px 14px', borderRadius: '14px', fontSize: '0.85rem' }}
            value={filterVariance}
            onChange={(e) => setFilterVariance(e.target.value)}
          >
            <option value="All">All Material Usages</option>
            <option value="Exact">Exact Standard BOM (0.5 KG/unit)</option>
            <option value="Overconsumed">Overconsumed (Extra Scrap)</option>
            <option value="Saved">Material Saved (High Yield)</option>
          </select>
        </div>

        <button
          onClick={handleOpenNewBatchModal}
          className="btn btn-primary"
          style={{ borderRadius: '14px' }}
        >
          <Plus size={18} /> + Add Manufacturing Batch
        </button>
      </div>

      {/* Main Manufacturing Table */}
      <div className="table-container">
        <table className="modern-table" style={{ minWidth: '1200px' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Batch No. (ID)</th>
              <th>Product Name</th>
              <th>Qty Manufactured</th>
              <th>Plastic Sleeves Used</th>
              <th>Material Consumption Variance</th>
              <th>Manufactured By (Operator)</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', paddingRight: '20px', position: 'sticky', right: 0, background: '#F8FAF9', zIndex: 12, boxShadow: '-4px 0 8px rgba(0, 0, 0, 0.05)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMfg.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
                  No daily manufacturing records found matching criteria.
                </td>
              </tr>
            ) : (
              filteredMfg.map((mfg) => {
                const varLabel = mfg.varianceLabel || 'Exact BOM Recipe (100% Target)';
                const isOver = varLabel.toLowerCase().includes('extra') || varLabel.toLowerCase().includes('over');
                const isSaved = varLabel.toLowerCase().includes('saved');

                return (
                  <tr key={mfg.batchNo || mfg.id || Math.random()}>
                    {/* Date */}
                    <td style={{ color: '#0F172A', fontWeight: 700 }}>{mfg.date || '-'}</td>

                    {/* Batch No */}
                    <td style={{ fontWeight: 800, color: '#0F4C3A' }}>{mfg.batchNo || mfg.id || 'B001'}</td>

                    {/* Product */}
                    <td style={{ fontWeight: 700, color: '#0F172A' }}>{mfg.product || 'Hard2Soft'}</td>

                    {/* Qty Manufactured */}
                    <td style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                      {(mfg.qty || 0).toLocaleString()} units
                    </td>

                    {/* Plastic Sleeves Used */}
                    <td style={{ fontWeight: 600, color: '#2563EB' }}>
                      {(mfg.sleevesUsed || mfg.qty || 0).toLocaleString()} PCS
                    </td>

                    {/* Material Consumption Variance Badge */}
                    <td>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: mfg.isReturnBatch || mfg.batchNo === 'RETURN BATCH' ? 'rgba(124, 58, 237, 0.15)' : isOver ? 'rgba(239, 68, 68, 0.12)' : isSaved ? 'rgba(124, 58, 237, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                        color: mfg.isReturnBatch || mfg.batchNo === 'RETURN BATCH' ? '#6D28D9' : isOver ? '#B91C1C' : isSaved ? '#7C3AED' : '#15803D',
                        fontWeight: 700,
                        fontSize: '0.775rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        {mfg.isReturnBatch || mfg.batchNo === 'RETURN BATCH' ? <RotateCcw size={14} /> : isOver ? <TrendingDown size={14} /> : isSaved ? <TrendingUp size={14} /> : <CheckCircle2 size={14} />}
                        {varLabel}
                      </span>
                    </td>

                    {/* Operator */}
                    <td style={{ fontWeight: 700, color: '#0F4C3A' }}>{mfg.operator || 'MAYURI'}</td>

                    {/* Status */}
                    <td>
                      <span className={`badge ${
                        mfg.isReturnBatch || mfg.status === 'Return Restocked' ? 'badge-purple' : mfg.status === 'Completed' ? 'badge-healthy' : 'badge-low'
                      }`}>
                        {mfg.status || (mfg.qty > 0 ? 'Completed' : 'No Production')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right', paddingRight: '20px', whiteSpace: 'nowrap', position: 'sticky', right: 0, background: '#ffffff', zIndex: 5, boxShadow: '-4px 0 8px rgba(0, 0, 0, 0.05)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleStartEdit(mfg)}
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
                            gap: '4px'
                          }}
                          title="Edit Batch & Materials Consumed"
                        >
                          <Edit2 size={14} /> Edit
                        </button>

                        <button
                          onClick={() => handlePromptDelete(mfg)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#DC2626',
                            cursor: 'pointer',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Delete Manufacturing Batch"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE / EDIT MANUFACTURING BATCH MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBatch ? `Edit Batch ${batchNo} & Material Consumption` : "Log Daily Manufacturing Batch"}
        icon={Factory}
      >
        <form onSubmit={handleSubmit}>
          
          <div className="form-row">
            <div className="form-group">
              <label>Batch No. (ID)</label>
              <input
                type="text"
                className="form-control"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Manufacturing Date</label>
              <input
                type="text"
                className="form-control"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Product Name</label>
              <input
                type="text"
                className="form-control"
                value={product}
                disabled
                style={{ background: '#F1F5F9', fontWeight: 700 }}
              />
            </div>

            <div className="form-group">
              <label>Units Manufactured (Total Batch Size)</label>
              <input
                type="number"
                className="form-control"
                value={qty}
                onChange={(e) => {
                  const val = e.target.value;
                  setQty(val);
                  const num = Number(val) || 0;
                  const newMap = {};
                  bomRecipe.forEach(item => {
                    const perUnit = item.stdQtyPerProduct !== undefined ? Number(item.stdQtyPerProduct) : (item.materialId === 'RM001' || item.materialId === 'RM002' ? 0.5 : item.materialId === 'RM010' ? 2 : 1);
                    newMap[item.materialId] = num * perUnit;
                  });
                  setActualConsumption(newMap);
                  setSleevesUsed(String(num));
                }}
                required
              />
            </div>
          </div>

          {/* DYNAMIC RAW MATERIAL CONSUMPTION BREAKDOWN */}
          <div style={{
            margin: '20px 0',
            padding: '20px',
            borderRadius: '16px',
            background: 'rgba(15, 76, 58, 0.04)',
            border: '1px solid rgba(15, 76, 58, 0.12)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0F4C3A', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sliders size={16} /> Actual Raw Materials Consumed For This Batch
                </div>
                <div style={{ fontSize: '0.775rem', color: '#64748B' }}>
                  Each unit standard is <strong>0.5 KG</strong>. For <strong>{qty || 0} units</strong>, total standard is <strong>{((Number(qty) || 0) * 0.5).toFixed(1)} KG</strong>. Adjust below if more/less was used.
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetToStandardBOM}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border-light)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  color: '#0F4C3A',
                  fontWeight: 700,
                  fontSize: '0.775rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Reset all fields to theoretical BOM standard"
              >
                <RotateCcw size={12} /> Reset to 0.5 KG/unit Standard
              </button>
            </div>

            {/* Material Consumption Mini Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {computedBOM.map((item) => {
                const isOver = item.variance > 0.001;
                const isSaved = item.variance < -0.001;

                return (
                  <div key={item.materialId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: '#ffffff',
                    border: '1px solid rgba(15, 76, 58, 0.08)',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    {/* Material Title and Standard Recipe */}
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.875rem' }}>
                        {item.material}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>ID: <strong style={{ color: '#2563EB' }}>{item.materialId}</strong></span>
                        <span>• Standard Recipe: <strong style={{ color: '#0F4C3A' }}>{item.perUnitStd} {item.unit} / unit</strong></span>
                        <span>• Batch Standard: <strong>{item.totalStdRequired.toFixed(1)} {item.unit}</strong> (for {qty || 0} units)</span>
                      </div>
                    </div>

                    {/* Actual Quantity Consumed Input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>
                          Actual Total Used ({item.unit})
                        </div>
                        <input
                          type="number"
                          step="any"
                          className="form-control"
                          style={{ width: '110px', padding: '6px 10px', height: '34px', fontSize: '0.875rem', fontWeight: 800, textAlign: 'right' }}
                          value={item.actualQty}
                          onChange={(e) => handleMaterialActualChange(item.materialId, e.target.value)}
                          required
                        />
                      </div>

                      {/* Variance & Actual Per-Unit Indicator */}
                      <div style={{ minWidth: '135px', textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                          {Math.abs(item.variance) < 0.001 ? (
                            <span style={{ color: '#16A34A' }}>✓ 0.50 {item.unit}/unit (Exact)</span>
                          ) : isOver ? (
                            <span style={{ color: '#DC2626' }}>+{item.variance.toFixed(2)} {item.unit} (Scrap)</span>
                          ) : (
                            <span style={{ color: '#7C3AED' }}>-{Math.abs(item.variance).toFixed(2)} {item.unit} (Saved)</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                          Rate: {item.actualPerUnit.toFixed(3)} {item.unit}/unit
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Net Batch Summary Badge */}
            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem', borderTop: '1px solid rgba(15, 76, 58, 0.08)', paddingTop: '10px' }}>
              <span style={{ color: '#64748B', fontWeight: 600 }}>Batch Variance Status:</span>
              <span style={{
                fontWeight: 800,
                color: batchVarianceSummary.status === 'Overconsumed' ? '#DC2626' : batchVarianceSummary.status === 'Material Saved' ? '#7C3AED' : '#16A34A'
              }}>
                {batchVarianceSummary.label}
              </span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Manufactured By (Operator)</label>
              <input
                type="text"
                className="form-control"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Production Status</label>
              <select
                className="form-control"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="Completed">Completed & Verified</option>
                <option value="In Progress">In Progress (Floor Assembly)</option>
                <option value="Quality Inspection">Under Quality Inspection</option>
              </select>
            </div>
          </div>

          <div className="modal-footer" style={{ margin: '20px -28px -28px -28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {editingBatch && (
                <button
                  type="button"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#DC2626',
                    cursor: 'pointer',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onClick={() => {
                    setIsModalOpen(false);
                    handlePromptDelete(editingBatch);
                  }}
                >
                  <Trash2 size={16} /> Delete Batch
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                {editingBatch ? 'Save Batch & Consumption' : 'Log Manufacturing Batch'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={!!deleteConfirmBatch}
        onClose={() => setDeleteConfirmBatch(null)}
        title="Confirm Delete Manufacturing Batch"
        icon={AlertCircle}
      >
        <div style={{ padding: '10px 0' }}>
          <p style={{ fontSize: '0.95rem', color: '#0F172A', lineHeight: 1.6 }}>
            Are you sure you want to delete manufacturing batch <strong>{deleteConfirmBatch?.batchNo || deleteConfirmBatch?.id}</strong> ({deleteConfirmBatch?.qty} units produced on {deleteConfirmBatch?.date})?
          </p>
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirmBatch(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ background: '#DC2626', borderColor: '#DC2626' }} onClick={handleConfirmDelete}>
              Delete Batch
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
