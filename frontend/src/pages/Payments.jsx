import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';
const today = () => new Date().toISOString().slice(0, 10);

const initialBill = {
  project_id: '', bill_date: today(), bill_number: '',
  progress_rate: '', bill_amount: '', supply_amount: '', tax_amount: '', notes: ''
};
const initialPayment = {
  project_id: '', progressbill_id: '', payment_date: today(),
  amount: '', payment_method: '계좌이체', is_received: false, due_date: '', notes: ''
};

export default function Payments() {
  const [activeTab, setActiveTab] = useState('bills');
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [receivables, setReceivables] = useState({ items: [], total: 0, within30: [], days31to60: [], days61to90: [], over90: [] });
  const [projects, setProjects] = useState([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [billForm, setBillForm] = useState(initialBill);
  const [paymentForm, setPaymentForm] = useState(initialPayment);
  const [editBillId, setEditBillId] = useState(null);
  const [editPaymentId, setEditPaymentId] = useState(null);

  useEffect(() => {
    axios.get('/api/projects').then(r => setProjects(r.data));
  }, []);

  const fetchBills = async () => {
    const params = filterProjectId ? { projectId: filterProjectId } : {};
    const res = await axios.get('/api/progressbills', { params });
    setBills(res.data);
  };

  const fetchPayments = async () => {
    const params = filterProjectId ? { projectId: filterProjectId } : {};
    const res = await axios.get('/api/payments', { params });
    setPayments(res.data);
  };

  const fetchReceivables = async () => {
    const res = await axios.get('/api/payments/receivables');
    setReceivables(res.data);
  };

  useEffect(() => {
    if (activeTab === 'bills') fetchBills();
    else if (activeTab === 'payments') fetchPayments();
    else if (activeTab === 'receivables') fetchReceivables();
  }, [activeTab, filterProjectId]);

  const handleAddBill = async (e) => {
    e.preventDefault();
    try {
      if (editBillId) {
        await axios.put(`/api/progressbills/${editBillId}`, billForm);
      } else {
        await axios.post('/api/progressbills', billForm);
      }
      setShowBillModal(false);
      fetchBills();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    try {
      if (editPaymentId) {
        await axios.put(`/api/payments/${editPaymentId}`, paymentForm);
      } else {
        await axios.post('/api/payments', paymentForm);
      }
      setShowPaymentModal(false);
      fetchPayments();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const openAddBill = () => {
    setEditBillId(null);
    setBillForm(initialBill);
    setShowBillModal(true);
  };
  const openEditBill = (b) => {
    setEditBillId(b.id);
    setBillForm({
      project_id: b.project_id, bill_date: b.bill_date, bill_number: b.bill_number || '',
      progress_rate: b.progress_rate, bill_amount: b.bill_amount,
      supply_amount: b.supply_amount, tax_amount: b.tax_amount, notes: b.notes || ''
    });
    setShowBillModal(true);
  };

  const openAddPayment = (bill) => {
    setEditPaymentId(null);
    setPaymentForm({
      ...initialPayment,
      project_id: bill?.project_id || '',
      progressbill_id: bill?.id || '',
      amount: bill ? bill.bill_amount - bill.received_amount : ''
    });
    setShowPaymentModal(true);
  };

  const totalBilled = bills.reduce((s, b) => s + b.bill_amount, 0);
  const totalReceived = bills.reduce((s, b) => s + b.received_amount, 0);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[['bills', '기성청구'], ['payments', '수금현황'], ['receivables', '미수금']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`tab-btn ${activeTab === key ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filter */}
      {activeTab !== 'receivables' && (
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">현장</label>
            <select value={filterProjectId} onChange={e => setFilterProjectId(e.target.value)} className="input-field w-44">
              <option value="">전체</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {activeTab === 'bills' && (
            <button onClick={openAddBill} className="btn-primary ml-auto">+ 기성청구 등록</button>
          )}
          {activeTab === 'payments' && (
            <button onClick={() => openAddPayment(null)} className="btn-primary ml-auto">+ 수금 등록</button>
          )}
        </div>
      )}

      {/* Bills Tab */}
      {activeTab === 'bills' && (
        <div className="card p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between text-sm text-gray-600">
            <span>청구합계: {formatWon(totalBilled)}</span>
            <span>수금: {formatWon(totalReceived)} | 잔액: <strong className="text-orange-600">{formatWon(totalBilled - totalReceived)}</strong></span>
          </div>
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">청구일</th>
                <th className="table-header">현장</th>
                <th className="table-header">청구서번호</th>
                <th className="table-header text-right">진행률</th>
                <th className="table-header text-right">청구금액</th>
                <th className="table-header text-right">수금액</th>
                <th className="table-header text-right">잔액</th>
                <th className="table-header">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bills.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">기성청구 내역이 없습니다</td></tr>
              ) : bills.map(b => {
                const balance = b.bill_amount - b.received_amount;
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="table-cell">{b.bill_date}</td>
                    <td className="table-cell">{b.project_name}</td>
                    <td className="table-cell text-gray-500">{b.bill_number || '-'}</td>
                    <td className="table-cell text-right">{b.progress_rate}%</td>
                    <td className="table-cell text-right">{formatWon(b.bill_amount)}</td>
                    <td className="table-cell text-right text-green-700">{formatWon(b.received_amount)}</td>
                    <td className={`table-cell text-right font-medium ${balance > 0 ? 'text-orange-600' : 'text-gray-500'}`}>{formatWon(balance)}</td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => openAddPayment(b)} className="text-xs text-green-600 hover:underline">수금</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => openEditBill(b)} className="text-xs text-blue-600 hover:underline">수정</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={async () => { if (confirm('삭제?')) { await axios.delete(`/api/progressbills/${b.id}`); fetchBills(); }}} className="text-xs text-red-500 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">수금일</th>
                <th className="table-header">현장</th>
                <th className="table-header">청구서</th>
                <th className="table-header text-right">수금액</th>
                <th className="table-header">결제방법</th>
                <th className="table-header">수금여부</th>
                <th className="table-header">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">수금 내역이 없습니다</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="table-cell">{p.payment_date || '-'}</td>
                  <td className="table-cell">{p.project_name}</td>
                  <td className="table-cell text-gray-500">{p.bill_number || '-'}</td>
                  <td className="table-cell text-right font-semibold">{formatWon(p.amount)}</td>
                  <td className="table-cell">{p.payment_method}</td>
                  <td className="table-cell">
                    <span className={p.is_received ? 'badge-green' : 'badge-yellow'}>
                      {p.is_received ? '수금완료' : '미수금'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <button onClick={async () => { if (confirm('삭제?')) { await axios.delete(`/api/payments/${p.id}`); fetchPayments(); }}} className="text-xs text-red-500 hover:underline">삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Receivables Tab */}
      {activeTab === 'receivables' && (
        <div className="space-y-4">
          {/* Aging Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: '30일 이내', items: receivables.within30, color: 'border-blue-200 bg-blue-50' },
              { label: '31~60일', items: receivables.days31to60, color: 'border-yellow-200 bg-yellow-50' },
              { label: '61~90일', items: receivables.days61to90, color: 'border-orange-200 bg-orange-50' },
              { label: '90일 초과', items: receivables.over90, color: 'border-red-200 bg-red-50' },
            ].map(({ label, items, color }) => (
              <div key={label} className={`rounded-xl border p-4 ${color}`}>
                <p className="text-sm font-medium text-gray-600">{label}</p>
                <p className="text-xl font-bold text-gray-800 mt-1">{formatWon(items.reduce((s, r) => s + r.outstanding, 0))}</p>
                <p className="text-xs text-gray-500 mt-0.5">{items.length}건</p>
              </div>
            ))}
          </div>

          {/* Receivables Table */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">
              총 미수금: <span className="text-orange-600 font-bold">{formatWon(receivables.total)}</span>
            </div>
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">현장</th>
                  <th className="table-header">발주처</th>
                  <th className="table-header">청구일</th>
                  <th className="table-header">청구번호</th>
                  <th className="table-header text-right">청구금액</th>
                  <th className="table-header text-right">수금액</th>
                  <th className="table-header text-right">미수금</th>
                  <th className="table-header text-right">경과일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {receivables.items?.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">미수금이 없습니다</td></tr>
                ) : receivables.items?.map((r, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${r.days_outstanding > 90 ? 'bg-red-50' : r.days_outstanding > 60 ? 'bg-orange-50/50' : ''}`}>
                    <td className="table-cell font-medium">{r.project_name}</td>
                    <td className="table-cell text-gray-600">{r.client}</td>
                    <td className="table-cell">{r.bill_date}</td>
                    <td className="table-cell text-gray-500">{r.bill_number || '-'}</td>
                    <td className="table-cell text-right">{formatWon(r.bill_amount)}</td>
                    <td className="table-cell text-right text-green-700">{formatWon(r.received_amount)}</td>
                    <td className="table-cell text-right font-bold text-orange-600">{formatWon(r.outstanding)}</td>
                    <td className={`table-cell text-right font-medium ${r.days_outstanding > 90 ? 'text-red-600' : r.days_outstanding > 60 ? 'text-orange-500' : 'text-gray-500'}`}>
                      {r.days_outstanding}일
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bill Modal */}
      {showBillModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBillModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editBillId ? '기성청구 수정' : '기성청구 등록'}</h3>
              <button onClick={() => setShowBillModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAddBill} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">현장 *</label>
                  <select required value={billForm.project_id} onChange={e => setBillForm({...billForm, project_id: e.target.value})} className="input-field">
                    <option value="">선택</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">청구일 *</label>
                  <input required type="date" value={billForm.bill_date} onChange={e => setBillForm({...billForm, bill_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">청구서번호</label>
                  <input value={billForm.bill_number} onChange={e => setBillForm({...billForm, bill_number: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">진행률 (%)</label>
                  <input type="number" min="0" max="100" value={billForm.progress_rate} onChange={e => setBillForm({...billForm, progress_rate: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">청구금액</label>
                  <input type="number" value={billForm.bill_amount} onChange={e => {
                    const total = parseInt(e.target.value) || 0;
                    const supply = Math.round(total / 1.1);
                    setBillForm({...billForm, bill_amount: total, supply_amount: supply, tax_amount: total - supply});
                  }} className="input-field" />
                </div>
                <div>
                  <label className="label">공급가액</label>
                  <input type="number" value={billForm.supply_amount} onChange={e => setBillForm({...billForm, supply_amount: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">부가세</label>
                  <input type="number" value={billForm.tax_amount} onChange={e => setBillForm({...billForm, tax_amount: e.target.value})} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="label">비고</label>
                  <input value={billForm.notes} onChange={e => setBillForm({...billForm, notes: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowBillModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editBillId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPaymentModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">수금 등록</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAddPayment} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">현장 *</label>
                  <select required value={paymentForm.project_id} onChange={e => setPaymentForm({...paymentForm, project_id: e.target.value})} className="input-field">
                    <option value="">선택</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">수금일</label>
                  <input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">만기일</label>
                  <input type="date" value={paymentForm.due_date} onChange={e => setPaymentForm({...paymentForm, due_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">수금액</label>
                  <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">결제방법</label>
                  <select value={paymentForm.payment_method} onChange={e => setPaymentForm({...paymentForm, payment_method: e.target.value})} className="input-field">
                    <option>계좌이체</option>
                    <option>현금</option>
                    <option>어음</option>
                    <option>카드</option>
                  </select>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="is_received" checked={paymentForm.is_received} onChange={e => setPaymentForm({...paymentForm, is_received: e.target.checked})} className="w-4 h-4 text-green-600" />
                  <label htmlFor="is_received" className="text-sm text-gray-700">수금 완료</label>
                </div>
                <div className="col-span-2">
                  <label className="label">비고</label>
                  <input value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">등록</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
