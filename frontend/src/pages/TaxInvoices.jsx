import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_MAP = {
  '발행완료': 'badge-green',
  '미발행': 'badge-yellow',
  '취소': 'badge-red',
};

const initialForm = {
  invoice_type: '매출', project_id: '', vendor_id: '', issue_date: today(),
  supply_amount: '', tax_amount: '', total_amount: '', status: '미발행',
  invoice_number: '', notes: ''
};

export default function TaxInvoices() {
  const [activeTab, setActiveTab] = useState('sales');
  const [invoices, setInvoices] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [filter, setFilter] = useState({ status: '', month: '' });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  const [summary, setSummary] = useState([]);

  const invoiceType = activeTab === 'sales' ? '매출' : '매입';

  const fetchInvoices = async () => {
    try {
      const params = { type: invoiceType };
      if (filter.status) params.status = filter.status;
      if (filter.month) params.month = filter.month;
      const res = await axios.get('/api/taxinvoices', { params });
      setInvoices(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchSummary = async () => {
    try {
      const res = await axios.get('/api/taxinvoices/summary');
      setSummary(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    Promise.all([
      axios.get('/api/projects'),
      axios.get('/api/vendors'),
    ]).then(([p, v]) => {
      setProjects(p.data);
      setVendors(v.data);
    });
    fetchSummary();
  }, []);

  useEffect(() => { fetchInvoices(); }, [activeTab, filter]);

  const openAdd = () => {
    setEditId(null);
    setForm({ ...initialForm, invoice_type: invoiceType });
    setShowModal(true);
  };

  const openEdit = (inv) => {
    setEditId(inv.id);
    setForm({
      invoice_type: inv.invoice_type, project_id: inv.project_id || '',
      vendor_id: inv.vendor_id || '', issue_date: inv.issue_date || today(),
      supply_amount: inv.supply_amount, tax_amount: inv.tax_amount,
      total_amount: inv.total_amount, status: inv.status,
      invoice_number: inv.invoice_number || '', notes: inv.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await axios.put(`/api/taxinvoices/${editId}`, form);
      } else {
        await axios.post('/api/taxinvoices', form);
      }
      setShowModal(false);
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      alert(err.response?.data?.error || '저장 실패');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await axios.delete(`/api/taxinvoices/${id}`);
    fetchInvoices();
    fetchSummary();
  };

  const monthlySales = summary.filter(s => s.invoice_type === '매출');
  const monthlyPurchase = summary.filter(s => s.invoice_type === '매입');

  const salesTotal = invoices.reduce((s, i) => s + i.total_amount, 0);
  const supplyTotal = invoices.reduce((s, i) => s + i.supply_amount, 0);
  const taxTotal = invoices.reduce((s, i) => s + i.tax_amount, 0);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setActiveTab('sales')}
          className={`tab-btn ${activeTab === 'sales' ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
          매출계산서
        </button>
        <button onClick={() => setActiveTab('purchase')}
          className={`tab-btn ${activeTab === 'purchase' ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
          매입계산서
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">상태</label>
          <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="input-field w-32">
            <option value="">전체</option>
            <option>발행완료</option>
            <option>미발행</option>
            <option>취소</option>
          </select>
        </div>
        <div>
          <label className="label">월</label>
          <input type="month" value={filter.month} onChange={e => setFilter({...filter, month: e.target.value})} className="input-field" />
        </div>
        <button onClick={fetchInvoices} className="btn-secondary">조회</button>
        <button onClick={openAdd} className="btn-primary ml-auto">+ {invoiceType}계산서 등록</button>
      </div>

      {/* Monthly Summary */}
      {(monthlySales.length > 0 || monthlyPurchase.length > 0) && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">월별 합계</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header pl-0">월</th>
                  <th className="table-header text-right">건수</th>
                  <th className="table-header text-right">공급가</th>
                  <th className="table-header text-right">부가세</th>
                  <th className="table-header text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(activeTab === 'sales' ? monthlySales : monthlyPurchase).map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="table-cell pl-0">{s.month}</td>
                    <td className="table-cell text-right">{s.count}건</td>
                    <td className="table-cell text-right">{formatWon(s.total_supply)}</td>
                    <td className="table-cell text-right">{formatWon(s.total_tax)}</td>
                    <td className="table-cell text-right font-semibold">{formatWon(s.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="card p-0 overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center text-sm text-gray-600">
          <span>총 {invoices.length}건</span>
          <span>공급가 {formatWon(supplyTotal)} / 부가세 {formatWon(taxTotal)} / 합계 <strong>{formatWon(salesTotal)}</strong></span>
        </div>
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">발행일</th>
              <th className="table-header">{activeTab === 'sales' ? '현장' : '거래처'}</th>
              <th className="table-header">계산서번호</th>
              <th className="table-header text-right">공급가액</th>
              <th className="table-header text-right">부가세</th>
              <th className="table-header text-right">합계금액</th>
              <th className="table-header">상태</th>
              <th className="table-header">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {invoices.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">세금계산서가 없습니다</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className={`hover:bg-gray-50 ${inv.status === '미발행' ? 'bg-yellow-50/50' : ''}`}>
                <td className="table-cell">{inv.issue_date || '-'}</td>
                <td className="table-cell">{activeTab === 'sales' ? (inv.project_name || '-') : (inv.vendor_name || '-')}</td>
                <td className="table-cell text-gray-500">{inv.invoice_number || '-'}</td>
                <td className="table-cell text-right">{formatWon(inv.supply_amount)}</td>
                <td className="table-cell text-right">{formatWon(inv.tax_amount)}</td>
                <td className="table-cell text-right font-semibold">{formatWon(inv.total_amount)}</td>
                <td className="table-cell">
                  <span className={STATUS_MAP[inv.status] || 'badge-gray'}>{inv.status}</span>
                </td>
                <td className="table-cell">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(inv)} className="text-xs text-blue-600 hover:underline">수정</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => handleDelete(inv.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editId ? '계산서 수정' : `${invoiceType}계산서 등록`}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">현장</label>
                  <select value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="input-field">
                    <option value="">선택 안함</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">거래처</label>
                  <select value={form.vendor_id} onChange={e => setForm({...form, vendor_id: e.target.value})} className="input-field">
                    <option value="">선택 안함</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">발행일</label>
                  <input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">계산서번호</label>
                  <input value={form.invoice_number} onChange={e => setForm({...form, invoice_number: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">공급가액</label>
                  <input type="number" value={form.supply_amount} onChange={e => {
                    const supply = parseInt(e.target.value) || 0;
                    const tax = Math.round(supply * 0.1);
                    setForm({...form, supply_amount: supply, tax_amount: tax, total_amount: supply + tax});
                  }} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">부가세</label>
                  <input type="number" value={form.tax_amount} onChange={e => setForm({...form, tax_amount: e.target.value})} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">합계금액</label>
                  <input type="number" value={form.total_amount} onChange={e => {
                    const total = parseInt(e.target.value) || 0;
                    const supply = Math.round(total / 1.1);
                    setForm({...form, total_amount: total, supply_amount: supply, tax_amount: total - supply});
                  }} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">상태</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                    <option>미발행</option>
                    <option>발행완료</option>
                    <option>취소</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">비고</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
