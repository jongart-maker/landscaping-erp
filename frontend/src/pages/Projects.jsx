import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';

const STATUS_COLORS = {
  '진행중': 'badge-green',
  '완료': 'badge-blue',
  '보류': 'badge-yellow',
  '취소': 'badge-red',
};

const initialForm = {
  name: '', client: '', location: '', start_date: '', end_date: '',
  contract_amount: '', status: '진행중', description: ''
};

const initialContract = {
  contract_type: '본계약', contract_date: '', amount: '',
  labor_budget: '', equipment_budget: '', material_budget: '', overhead_budget: '', notes: ''
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [contractForm, setContractForm] = useState(initialContract);
  const [editId, setEditId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchProjects = async () => {
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await axios.get('/api/projects', { params });
      setProjects(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, [statusFilter]);

  const openAdd = () => {
    setEditId(null);
    setForm(initialForm);
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      name: p.name || '', client: p.client || '', location: p.location || '',
      start_date: p.start_date || '', end_date: p.end_date || '',
      contract_amount: p.contract_amount || '', status: p.status || '진행중',
      description: p.description || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await axios.put(`/api/projects/${editId}`, form);
      } else {
        await axios.post('/api/projects', form);
      }
      setShowModal(false);
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.error || '오류가 발생했습니다');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await axios.delete(`/api/projects/${id}`);
      fetchProjects();
    } catch (err) {
      alert('삭제 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const openContracts = async (p) => {
    setSelectedProject(p);
    try {
      const res = await axios.get(`/api/projects/${p.id}/contracts`);
      setContracts(res.data);
    } catch (err) {
      console.error(err);
    }
    setShowContractModal(true);
  };

  const handleAddContract = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/projects/${selectedProject.id}/contracts`, contractForm);
      const res = await axios.get(`/api/projects/${selectedProject.id}/contracts`);
      setContracts(res.data);
      setContractForm(initialContract);
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.error || '오류가 발생했습니다');
    }
  };

  const filtered = projects.filter(p =>
    p.name.includes(filter) || p.client.includes(filter) || (p.location || '').includes(filter)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="현장명, 발주처 검색..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="input-field w-48"
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-36">
            <option value="">전체 상태</option>
            <option value="진행중">진행중</option>
            <option value="완료">완료</option>
            <option value="보류">보류</option>
            <option value="취소">취소</option>
          </select>
        </div>
        <button onClick={openAdd} className="btn-primary whitespace-nowrap">+ 현장 등록</button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">현장명</th>
              <th className="table-header">발주처</th>
              <th className="table-header">위치</th>
              <th className="table-header">기간</th>
              <th className="table-header text-right">계약금액</th>
              <th className="table-header text-right">총원가</th>
              <th className="table-header text-right">수금</th>
              <th className="table-header">상태</th>
              <th className="table-header">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">로딩 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">현장이 없습니다</td></tr>
            ) : filtered.map(p => {
              const budgetPct = p.contract_amount > 0 ? ((p.total_cost / p.contract_amount) * 100) : 0;
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell font-medium">{p.name}</td>
                  <td className="table-cell text-gray-600">{p.client}</td>
                  <td className="table-cell text-gray-600">{p.location || '-'}</td>
                  <td className="table-cell text-gray-500 text-xs">
                    {p.start_date || '-'}<br/>{p.end_date || '-'}
                  </td>
                  <td className="table-cell text-right">{formatWon(p.contract_amount)}</td>
                  <td className={`table-cell text-right font-medium ${budgetPct > 100 ? 'text-red-600' : budgetPct > 90 ? 'text-orange-500' : ''}`}>
                    {formatWon(p.total_cost)}
                    {p.contract_amount > 0 && (
                      <span className="text-xs ml-1 text-gray-400">({budgetPct.toFixed(0)}%)</span>
                    )}
                  </td>
                  <td className="table-cell text-right text-green-700">{formatWon(p.total_received)}</td>
                  <td className="table-cell">
                    <span className={STATUS_COLORS[p.status] || 'badge-gray'}>{p.status}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button onClick={() => openContracts(p)} className="text-xs text-blue-600 hover:underline">계약</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => openEdit(p)} className="text-xs text-gray-600 hover:underline">수정</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Project Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">{editId ? '현장 수정' : '현장 등록'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">현장명 *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" placeholder="현장명 입력" />
                </div>
                <div>
                  <label className="label">발주처 *</label>
                  <input required value={form.client} onChange={e => setForm({...form, client: e.target.value})} className="input-field" placeholder="발주처명" />
                </div>
                <div>
                  <label className="label">위치</label>
                  <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="input-field" placeholder="현장 주소" />
                </div>
                <div>
                  <label className="label">착공일</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">준공일</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">계약금액 (원)</label>
                  <input type="number" value={form.contract_amount} onChange={e => setForm({...form, contract_amount: e.target.value})} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">상태</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                    <option>진행중</option>
                    <option>완료</option>
                    <option>보류</option>
                    <option>취소</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">비고</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className="input-field" placeholder="현장 설명" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract Modal */}
      {showContractModal && selectedProject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowContractModal(false)}>
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">{selectedProject.name} - 계약 관리</h3>
              <button onClick={() => setShowContractModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Contract List */}
              {contracts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">등록된 계약</h4>
                  <div className="space-y-2">
                    {contracts.map(c => (
                      <div key={c.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">{c.contract_type}</span>
                          <span className="text-gray-500">{c.contract_date}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span>계약금액: {formatWon(c.amount)}</span>
                          <span>노무비: {formatWon(c.labor_budget)}</span>
                          <span>장비비: {formatWon(c.equipment_budget)}</span>
                          <span>자재비: {formatWon(c.material_budget)}</span>
                          <span>경비: {formatWon(c.overhead_budget)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Contract Form */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">계약 추가</h4>
                <form onSubmit={handleAddContract} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">계약유형</label>
                      <select value={contractForm.contract_type} onChange={e => setContractForm({...contractForm, contract_type: e.target.value})} className="input-field">
                        <option>본계약</option>
                        <option>추가계약</option>
                        <option>변경계약</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">계약일</label>
                      <input type="date" value={contractForm.contract_date} onChange={e => setContractForm({...contractForm, contract_date: e.target.value})} className="input-field" />
                    </div>
                    <div>
                      <label className="label">계약금액 (원)</label>
                      <input type="number" value={contractForm.amount} onChange={e => setContractForm({...contractForm, amount: e.target.value})} className="input-field" placeholder="0" />
                    </div>
                    <div>
                      <label className="label">노무비 예산</label>
                      <input type="number" value={contractForm.labor_budget} onChange={e => setContractForm({...contractForm, labor_budget: e.target.value})} className="input-field" placeholder="0" />
                    </div>
                    <div>
                      <label className="label">장비비 예산</label>
                      <input type="number" value={contractForm.equipment_budget} onChange={e => setContractForm({...contractForm, equipment_budget: e.target.value})} className="input-field" placeholder="0" />
                    </div>
                    <div>
                      <label className="label">자재비 예산</label>
                      <input type="number" value={contractForm.material_budget} onChange={e => setContractForm({...contractForm, material_budget: e.target.value})} className="input-field" placeholder="0" />
                    </div>
                    <div>
                      <label className="label">경비 예산</label>
                      <input type="number" value={contractForm.overhead_budget} onChange={e => setContractForm({...contractForm, overhead_budget: e.target.value})} className="input-field" placeholder="0" />
                    </div>
                    <div>
                      <label className="label">비고</label>
                      <input value={contractForm.notes} onChange={e => setContractForm({...contractForm, notes: e.target.value})} className="input-field" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" className="btn-primary">계약 추가</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
