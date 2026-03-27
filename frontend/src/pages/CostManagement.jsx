import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';

const initialPurchase = {
  project_id: '', vendor_id: '', purchase_date: new Date().toISOString().slice(0, 10),
  item_name: '', quantity: 1, unit: '식', unit_price: '', total_amount: '',
  tax_amount: '', supply_amount: '', payment_status: '미결제', notes: ''
};

export default function CostManagement() {
  const [activeTab, setActiveTab] = useState('labor');
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [unitPrices, setUnitPrices] = useState([]);
  const [laborSummary, setLaborSummary] = useState([]);
  const [filter, setFilter] = useState({ projectId: '', vendorId: '', month: '' });
  const [showModal, setShowModal] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState(initialPurchase);
  const [editPurchaseId, setEditPurchaseId] = useState(null);
  const [editUnitPrice, setEditUnitPrice] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [projRes, vendorRes, upRes] = await Promise.all([
        axios.get('/api/projects'),
        axios.get('/api/vendors'),
        axios.get('/api/unitprices'),
      ]);
      setProjects(projRes.data);
      setVendors(vendorRes.data);
      setUnitPrices(upRes.data);
    } catch (err) { console.error(err); }
  };

  const fetchPurchases = async () => {
    try {
      const params = {};
      if (filter.projectId) params.projectId = filter.projectId;
      if (filter.vendorId) params.vendorId = filter.vendorId;
      if (filter.month) params.month = filter.month;
      const res = await axios.get('/api/purchases', { params });
      setPurchases(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchLaborSummary = async () => {
    try {
      const params = {};
      if (filter.projectId) params.projectId = filter.projectId;
      const url = filter.projectId
        ? `/api/dailylogs?projectId=${filter.projectId}`
        : '/api/dailylogs';
      const res = await axios.get(url);
      // Aggregate by project
      const summary = {};
      res.data.forEach(log => {
        const key = log.project_id;
        if (!summary[key]) summary[key] = { project_name: log.project_name, labor_cost: 0, equipment_cost: 0, days: 0 };
        summary[key].labor_cost += log.total_labor_cost;
        summary[key].equipment_cost += log.total_equipment_cost;
        summary[key].days += 1;
      });
      setLaborSummary(Object.values(summary));
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (activeTab === 'purchases') fetchPurchases();
    if (activeTab === 'labor') fetchLaborSummary();
  }, [activeTab, filter]);

  const openAddPurchase = () => {
    setEditPurchaseId(null);
    setPurchaseForm(initialPurchase);
    setShowModal(true);
  };

  const openEditPurchase = (p) => {
    setEditPurchaseId(p.id);
    setPurchaseForm({
      project_id: p.project_id || '', vendor_id: p.vendor_id || '',
      purchase_date: p.purchase_date, item_name: p.item_name,
      quantity: p.quantity, unit: p.unit, unit_price: p.unit_price,
      total_amount: p.total_amount, tax_amount: p.tax_amount,
      supply_amount: p.supply_amount, payment_status: p.payment_status,
      notes: p.notes || ''
    });
    setShowModal(true);
  };

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...purchaseForm };
      if (!data.total_amount && data.unit_price && data.quantity) {
        data.total_amount = data.unit_price * data.quantity;
        data.supply_amount = Math.round(data.total_amount / 1.1);
        data.tax_amount = data.total_amount - data.supply_amount;
      }
      if (editPurchaseId) {
        await axios.put(`/api/purchases/${editPurchaseId}`, data);
      } else {
        await axios.post('/api/purchases', data);
      }
      setShowModal(false);
      fetchPurchases();
    } catch (err) {
      alert(err.response?.data?.error || '저장 실패');
    }
  };

  const handleDeletePurchase = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await axios.delete(`/api/purchases/${id}`);
    fetchPurchases();
  };

  const handleUpdateUnitPrice = async (up) => {
    try {
      await axios.put(`/api/unitprices/${up.id}`, up);
      setEditUnitPrice(null);
      fetchAll();
    } catch (err) { alert('저장 실패'); }
  };

  const tabs = [
    { key: 'labor', label: '투입인원/장비' },
    { key: 'purchases', label: '매입자료' },
    { key: 'unitprices', label: '단가표' },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`tab-btn ${activeTab === t.key ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {(activeTab === 'labor' || activeTab === 'purchases') && (
        <div className="card p-4 flex flex-wrap gap-3">
          <div>
            <label className="label">현장</label>
            <select value={filter.projectId} onChange={e => setFilter({...filter, projectId: e.target.value})} className="input-field w-44">
              <option value="">전체</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {activeTab === 'purchases' && (
            <>
              <div>
                <label className="label">거래처</label>
                <select value={filter.vendorId} onChange={e => setFilter({...filter, vendorId: e.target.value})} className="input-field w-40">
                  <option value="">전체</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">월</label>
                <input type="month" value={filter.month} onChange={e => setFilter({...filter, month: e.target.value})} className="input-field" />
              </div>
            </>
          )}
          <div className="flex items-end gap-2">
            <button onClick={() => {
              if (activeTab === 'purchases') fetchPurchases();
              if (activeTab === 'labor') fetchLaborSummary();
            }} className="btn-secondary">조회</button>
            {activeTab === 'purchases' && (
              <button onClick={openAddPurchase} className="btn-primary">+ 매입 등록</button>
            )}
          </div>
        </div>
      )}

      {/* Labor/Equipment Tab */}
      {activeTab === 'labor' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">현장명</th>
                <th className="table-header text-right">노무비</th>
                <th className="table-header text-right">장비비</th>
                <th className="table-header text-right">합계</th>
                <th className="table-header text-right">일지수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {laborSummary.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">데이터가 없습니다</td></tr>
              ) : laborSummary.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{s.project_name}</td>
                  <td className="table-cell text-right">{formatWon(s.labor_cost)}</td>
                  <td className="table-cell text-right">{formatWon(s.equipment_cost)}</td>
                  <td className="table-cell text-right font-semibold">{formatWon(s.labor_cost + s.equipment_cost)}</td>
                  <td className="table-cell text-right text-gray-500">{s.days}일</td>
                </tr>
              ))}
            </tbody>
            {laborSummary.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t">
                  <td className="table-cell">합계</td>
                  <td className="table-cell text-right text-green-700">{formatWon(laborSummary.reduce((s, r) => s + r.labor_cost, 0))}</td>
                  <td className="table-cell text-right text-green-700">{formatWon(laborSummary.reduce((s, r) => s + r.equipment_cost, 0))}</td>
                  <td className="table-cell text-right text-green-700">{formatWon(laborSummary.reduce((s, r) => s + r.labor_cost + r.equipment_cost, 0))}</td>
                  <td className="table-cell text-right text-gray-500">{laborSummary.reduce((s, r) => s + r.days, 0)}일</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Purchases Tab */}
      {activeTab === 'purchases' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">날짜</th>
                <th className="table-header">현장</th>
                <th className="table-header">거래처</th>
                <th className="table-header">품목</th>
                <th className="table-header text-right">수량</th>
                <th className="table-header text-right">공급가</th>
                <th className="table-header text-right">부가세</th>
                <th className="table-header text-right">합계</th>
                <th className="table-header">결제</th>
                <th className="table-header">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {purchases.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">매입 내역이 없습니다</td></tr>
              ) : purchases.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="table-cell">{p.purchase_date}</td>
                  <td className="table-cell text-sm">{p.project_name || '-'}</td>
                  <td className="table-cell text-sm">{p.vendor_name || '-'}</td>
                  <td className="table-cell font-medium">{p.item_name}</td>
                  <td className="table-cell text-right">{p.quantity} {p.unit}</td>
                  <td className="table-cell text-right">{formatWon(p.supply_amount)}</td>
                  <td className="table-cell text-right">{formatWon(p.tax_amount)}</td>
                  <td className="table-cell text-right font-semibold">{formatWon(p.total_amount)}</td>
                  <td className="table-cell">
                    <span className={p.payment_status === '결제완료' ? 'badge-green' : 'badge-yellow'}>{p.payment_status}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button onClick={() => openEditPurchase(p)} className="text-xs text-blue-600 hover:underline">수정</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => handleDeletePurchase(p.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unit Prices Tab */}
      {activeTab === 'unitprices' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {['인력', '장비'].map(category => (
            <div key={category} className="card">
              <h3 className="text-base font-semibold mb-3">{category} 단가표</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="table-header pl-0">품명</th>
                    <th className="table-header">단위</th>
                    <th className="table-header text-right">단가</th>
                    <th className="table-header">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {unitPrices.filter(u => u.category === category).map(up => (
                    <tr key={up.id} className="hover:bg-gray-50">
                      {editUnitPrice?.id === up.id ? (
                        <>
                          <td className="table-cell pl-0">
                            <input value={editUnitPrice.item_name} onChange={e => setEditUnitPrice({...editUnitPrice, item_name: e.target.value})} className="input-field w-full" />
                          </td>
                          <td className="table-cell">
                            <input value={editUnitPrice.unit} onChange={e => setEditUnitPrice({...editUnitPrice, unit: e.target.value})} className="input-field w-16" />
                          </td>
                          <td className="table-cell text-right">
                            <input type="number" value={editUnitPrice.unit_price} onChange={e => setEditUnitPrice({...editUnitPrice, unit_price: parseInt(e.target.value)})} className="input-field w-28 text-right" />
                          </td>
                          <td className="table-cell">
                            <div className="flex gap-1">
                              <button onClick={() => handleUpdateUnitPrice(editUnitPrice)} className="text-xs text-green-600 hover:underline">저장</button>
                              <span className="text-gray-300">|</span>
                              <button onClick={() => setEditUnitPrice(null)} className="text-xs text-gray-500 hover:underline">취소</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="table-cell pl-0 font-medium">{up.item_name}</td>
                          <td className="table-cell text-gray-500">{up.unit}</td>
                          <td className="table-cell text-right font-medium">{formatWon(up.unit_price)}</td>
                          <td className="table-cell">
                            <button onClick={() => setEditUnitPrice({...up})} className="text-xs text-blue-600 hover:underline">수정</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editPurchaseId ? '매입 수정' : '매입 등록'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handlePurchaseSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">현장</label>
                  <select value={purchaseForm.project_id} onChange={e => setPurchaseForm({...purchaseForm, project_id: e.target.value})} className="input-field">
                    <option value="">선택 안함</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">거래처</label>
                  <select value={purchaseForm.vendor_id} onChange={e => setPurchaseForm({...purchaseForm, vendor_id: e.target.value})} className="input-field">
                    <option value="">선택 안함</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">매입일 *</label>
                  <input required type="date" value={purchaseForm.purchase_date} onChange={e => setPurchaseForm({...purchaseForm, purchase_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">결제상태</label>
                  <select value={purchaseForm.payment_status} onChange={e => setPurchaseForm({...purchaseForm, payment_status: e.target.value})} className="input-field">
                    <option>미결제</option>
                    <option>결제완료</option>
                    <option>부분결제</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">품목명 *</label>
                  <input required value={purchaseForm.item_name} onChange={e => setPurchaseForm({...purchaseForm, item_name: e.target.value})} className="input-field" placeholder="품목명 입력" />
                </div>
                <div>
                  <label className="label">수량</label>
                  <input type="number" step="0.01" value={purchaseForm.quantity} onChange={e => setPurchaseForm({...purchaseForm, quantity: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">단위</label>
                  <input value={purchaseForm.unit} onChange={e => setPurchaseForm({...purchaseForm, unit: e.target.value})} className="input-field" placeholder="식, 개, m² ..." />
                </div>
                <div>
                  <label className="label">공급가액</label>
                  <input type="number" value={purchaseForm.supply_amount} onChange={e => {
                    const supply = parseInt(e.target.value) || 0;
                    const tax = Math.round(supply * 0.1);
                    setPurchaseForm({...purchaseForm, supply_amount: supply, tax_amount: tax, total_amount: supply + tax});
                  }} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">부가세</label>
                  <input type="number" value={purchaseForm.tax_amount} onChange={e => setPurchaseForm({...purchaseForm, tax_amount: e.target.value})} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">합계금액</label>
                  <input type="number" value={purchaseForm.total_amount} onChange={e => {
                    const total = parseInt(e.target.value) || 0;
                    const supply = Math.round(total / 1.1);
                    setPurchaseForm({...purchaseForm, total_amount: total, supply_amount: supply, tax_amount: total - supply});
                  }} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">비고</label>
                  <input value={purchaseForm.notes} onChange={e => setPurchaseForm({...purchaseForm, notes: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editPurchaseId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
