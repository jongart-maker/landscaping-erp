import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_COLORS = {
  '접수': 'badge-yellow',
  '검토중': 'badge-blue',
  '처리중': 'badge-blue',
  '완료': 'badge-green',
  '보류': 'badge-gray',
};

const TYPE_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6', '#ef4444'];

const initialForm = {
  project_id: '', defect_type: '식재', title: '', description: '',
  location: '', reported_date: today(), due_date: '',
  status: '접수', priority: '보통', assigned_to: '', reporter: '', notes: ''
};

export default function Defects() {
  const [activeTab, setActiveTab] = useState('list');
  const [defects, setDefects] = useState([]);
  const [stats, setStats] = useState({ byType: [], byStatus: [], byProject: [], overdueDefects: [] });
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState({ projectId: '', status: '', defect_type: '' });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => {
    axios.get('/api/projects').then(r => setProjects(r.data));
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'list' || activeTab === 'history') fetchDefects();
    if (activeTab === 'stats') fetchStats();
  }, [activeTab, filter]);

  const fetchDefects = async () => {
    const params = {};
    if (filter.projectId) params.projectId = filter.projectId;
    if (filter.status) params.status = filter.status;
    if (filter.defect_type) params.defect_type = filter.defect_type;
    const res = await axios.get('/api/defects', { params });
    setDefects(res.data);
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/defects/stats');
      setStats(res.data);
    } catch (err) { console.error(err); }
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...initialForm, project_id: projects[0]?.id || '' });
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditId(d.id);
    setForm({
      project_id: d.project_id, defect_type: d.defect_type,
      title: d.title, description: d.description || '',
      location: d.location || '', reported_date: d.reported_date,
      due_date: d.due_date || '', status: d.status,
      priority: d.priority, assigned_to: d.assigned_to || '',
      reporter: d.reporter || '', notes: d.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) await axios.put(`/api/defects/${editId}`, form);
      else await axios.post('/api/defects', form);
      setShowModal(false);
      fetchDefects();
      fetchStats();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await axios.delete(`/api/defects/${id}`);
    fetchDefects();
    fetchStats();
  };

  const handleStatusChange = async (id, newStatus) => {
    const defect = defects.find(d => d.id === id);
    if (!defect) return;
    try {
      await axios.put(`/api/defects/${id}`, {
        ...defect,
        status: newStatus,
        resolved_date: newStatus === '완료' ? today() : defect.resolved_date
      });
      fetchDefects();
      fetchStats();
    } catch (err) { alert('상태 변경 실패'); }
  };

  const pendingDefects = defects.filter(d => d.status !== '완료');
  const completedDefects = defects.filter(d => d.status === '완료');

  const tabs = [
    { key: 'list', label: '하자접수' },
    { key: 'status', label: '처리현황' },
    { key: 'history', label: '하자이력' },
    { key: 'stats', label: '현장별통계' },
  ];

  const defectsToShow = activeTab === 'history' ? completedDefects :
    activeTab === 'status' ? pendingDefects : defects;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`tab-btn ${activeTab === t.key ? 'tab-btn-active' : 'tab-btn-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {activeTab !== 'stats' && (
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">현장</label>
            <select value={filter.projectId} onChange={e => setFilter({...filter, projectId: e.target.value})} className="input-field w-44">
              <option value="">전체</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">상태</label>
            <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="input-field w-32">
              <option value="">전체</option>
              {['접수', '검토중', '처리중', '완료', '보류'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">유형</label>
            <select value={filter.defect_type} onChange={e => setFilter({...filter, defect_type: e.target.value})} className="input-field w-32">
              <option value="">전체</option>
              {['식재', '시설물', '포장', '배수', '기타'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {activeTab === 'list' && (
            <button onClick={openAdd} className="btn-primary ml-auto">+ 하자 접수</button>
          )}
        </div>
      )}

      {/* Status overview */}
      {(activeTab === 'list' || activeTab === 'status') && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: '접수', color: 'bg-yellow-50 border-yellow-200', textColor: 'text-yellow-700' },
            { label: '검토중', color: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700' },
            { label: '처리중', color: 'bg-indigo-50 border-indigo-200', textColor: 'text-indigo-700' },
            { label: '완료', color: 'bg-green-50 border-green-200', textColor: 'text-green-700' },
            { label: '보류', color: 'bg-gray-50 border-gray-200', textColor: 'text-gray-700' },
          ].map(({ label, color, textColor }) => {
            const count = (stats.byStatus || []).find(s => s.status === label)?.count || 0;
            return (
              <div key={label} className={`rounded-xl border p-3 ${color}`}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold ${textColor}`}>{count}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Defect List */}
      {activeTab !== 'stats' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">접수일</th>
                <th className="table-header">현장</th>
                <th className="table-header">유형</th>
                <th className="table-header">제목</th>
                <th className="table-header">위치</th>
                <th className="table-header">처리기한</th>
                <th className="table-header">담당자</th>
                <th className="table-header">우선순위</th>
                <th className="table-header">상태</th>
                <th className="table-header">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {defectsToShow.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">하자 내역이 없습니다</td></tr>
              ) : defectsToShow.map(d => {
                const daysUntilDue = d.due_date
                  ? Math.ceil((new Date(d.due_date) - new Date()) / (1000 * 60 * 60 * 24))
                  : null;
                const isOverdue = daysUntilDue !== null && daysUntilDue < 0 && d.status !== '완료';
                return (
                  <tr key={d.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="table-cell">{d.reported_date}</td>
                    <td className="table-cell text-sm">{d.project_name}</td>
                    <td className="table-cell">
                      <span className={`badge-${d.defect_type === '식재' ? 'green' : d.defect_type === '시설물' ? 'blue' : 'gray'}`}>{d.defect_type}</span>
                    </td>
                    <td className="table-cell font-medium max-w-xs truncate">{d.title}</td>
                    <td className="table-cell text-gray-500 text-sm">{d.location || '-'}</td>
                    <td className={`table-cell ${isOverdue ? 'text-red-600 font-medium' : daysUntilDue !== null && daysUntilDue <= 3 ? 'text-orange-500' : ''}`}>
                      {d.due_date || '-'}
                      {isOverdue && <span className="text-xs ml-1">({Math.abs(daysUntilDue)}일 초과)</span>}
                    </td>
                    <td className="table-cell text-sm">{d.assigned_to || '-'}</td>
                    <td className="table-cell">
                      <span className={d.priority === '긴급' ? 'badge-red' : d.priority === '높음' ? 'badge-yellow' : 'badge-gray'}>{d.priority}</span>
                    </td>
                    <td className="table-cell">
                      <select
                        value={d.status}
                        onChange={e => handleStatusChange(d.id, e.target.value)}
                        className={`text-xs rounded-full px-2 py-1 border-0 cursor-pointer font-medium ${
                          d.status === '완료' ? 'bg-green-100 text-green-800' :
                          d.status === '접수' ? 'bg-yellow-100 text-yellow-800' :
                          d.status === '처리중' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {['접수', '검토중', '처리중', '완료', '보류'].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(d)} className="text-xs text-blue-600 hover:underline">수정</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => handleDelete(d.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Type Chart */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">유형별 하자 현황</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byType} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="defect_type" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="전체" radius={[3, 3, 0, 0]}>
                    {stats.byType.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Overdue Defects */}
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">처리기한 초과 하자</h3>
              {stats.overdueDefects?.length === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">초과 하자가 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {stats.overdueDefects?.map((d, i) => (
                    <div key={i} className="flex items-center justify-between bg-red-50 rounded-lg p-3 border border-red-100">
                      <div>
                        <p className="text-sm font-medium">{d.title}</p>
                        <p className="text-xs text-gray-500">{d.project_name}</p>
                      </div>
                      <div className="text-right">
                        <span className="badge-red">{d.days_overdue}일 초과</span>
                        <p className="text-xs text-gray-400 mt-1">{d.due_date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* By Project Table */}
          <div className="card p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">현장별 하자 통계</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">현장명</th>
                  <th className="table-header text-right">전체</th>
                  <th className="table-header text-right">처리완료</th>
                  <th className="table-header text-right">미처리</th>
                  <th className="table-header text-right">완료율</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.byProject?.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">데이터가 없습니다</td></tr>
                ) : stats.byProject?.map((p, i) => {
                  const rate = p.total_defects > 0 ? ((p.resolved / p.total_defects) * 100).toFixed(0) : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{p.project_name}</td>
                      <td className="table-cell text-right">{p.total_defects}</td>
                      <td className="table-cell text-right text-green-700">{p.resolved}</td>
                      <td className="table-cell text-right text-red-600">{p.pending}</td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-sm font-medium">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editId ? '하자 수정' : '하자 접수'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">현장 *</label>
                  <select required value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="input-field">
                    <option value="">선택</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">제목 *</label>
                  <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" placeholder="하자 제목" />
                </div>
                <div>
                  <label className="label">유형</label>
                  <select value={form.defect_type} onChange={e => setForm({...form, defect_type: e.target.value})} className="input-field">
                    {['식재', '시설물', '포장', '배수', '기타'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">우선순위</label>
                  <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} className="input-field">
                    {['긴급', '높음', '보통', '낮음'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">접수일 *</label>
                  <input required type="date" value={form.reported_date} onChange={e => setForm({...form, reported_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">처리기한</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">담당자</label>
                  <input value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">접수자</label>
                  <input value={form.reporter} onChange={e => setForm({...form, reporter: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">위치</label>
                  <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">상태</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                    {['접수', '검토중', '처리중', '완료', '보류'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">내용</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} className="input-field" placeholder="하자 내용 상세 설명" />
                </div>
                <div className="col-span-2">
                  <label className="label">처리내역</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="input-field" placeholder="처리 내역" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editId ? '수정' : '접수'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
