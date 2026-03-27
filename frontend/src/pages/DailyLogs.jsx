import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';
const today = () => new Date().toISOString().slice(0, 10);

const WEATHER_OPTIONS = ['맑음', '흐림', '비', '눈', '흐리고 비'];

const emptyLabor = () => ({ worker_type: '조경공', count: 1, unit_price: 200000, notes: '' });
const emptyEquip = () => ({ equipment_type: '굴삭기03', count: 1, unit_price: 400000, notes: '' });

export default function DailyLogs() {
  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [unitPrices, setUnitPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState({ projectId: '', startDate: '', endDate: '' });
  const [kakaoText, setKakaoText] = useState('');
  const [parsing, setParsing] = useState(false);

  const [form, setForm] = useState({
    project_id: '', log_date: today(), weather: '맑음',
    work_description: '', notes: '',
    labor: [emptyLabor()],
    equipment: []
  });

  const fetchData = async () => {
    try {
      const [logsRes, projRes, upRes] = await Promise.all([
        axios.get('/api/dailylogs', { params: filter }),
        axios.get('/api/projects'),
        axios.get('/api/unitprices'),
      ]);
      setLogs(logsRes.data);
      setProjects(projRes.data);
      setUnitPrices(upRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const getLaborPrices = () => unitPrices.filter(u => u.category === '인력');
  const getEquipPrices = () => unitPrices.filter(u => u.category === '장비');

  const openAdd = () => {
    setEditId(null);
    setForm({
      project_id: projects[0]?.id || '',
      log_date: today(), weather: '맑음',
      work_description: '', notes: '',
      labor: [emptyLabor()],
      equipment: []
    });
    setShowModal(true);
  };

  const openEdit = async (id) => {
    try {
      const res = await axios.get(`/api/dailylogs/${id}`);
      const d = res.data;
      setForm({
        project_id: d.project_id, log_date: d.log_date,
        weather: d.weather, work_description: d.work_description || '',
        notes: d.notes || '',
        labor: d.labor?.length > 0 ? d.labor : [emptyLabor()],
        equipment: d.equipment || []
      });
      setEditId(id);
      setShowModal(true);
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        labor: form.labor.filter(l => l.worker_type),
        equipment: form.equipment.filter(eq => eq.equipment_type)
      };
      if (editId) {
        await axios.put(`/api/dailylogs/${editId}`, payload);
      } else {
        await axios.post('/api/dailylogs', payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || '저장 실패');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await axios.delete(`/api/dailylogs/${id}`);
    fetchData();
  };

  const handleParse = async () => {
    if (!kakaoText.trim()) return alert('텍스트를 입력하세요');
    setParsing(true);
    try {
      const res = await axios.post('/api/dailylogs/parse', {
        text: kakaoText,
        projectId: form.project_id
      });
      const parsed = res.data;
      setForm(prev => ({
        ...prev,
        log_date: parsed.log_date || prev.log_date,
        weather: parsed.weather || prev.weather,
        work_description: parsed.work_description || prev.work_description,
        labor: parsed.labor?.length > 0 ? parsed.labor : prev.labor,
        equipment: parsed.equipment?.length > 0 ? parsed.equipment : prev.equipment,
      }));
      setKakaoText('');
    } catch (err) {
      alert('파싱 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setParsing(false);
    }
  };

  const addLabor = () => setForm(f => ({ ...f, labor: [...f.labor, emptyLabor()] }));
  const removeLabor = (i) => setForm(f => ({ ...f, labor: f.labor.filter((_, idx) => idx !== i) }));
  const updateLabor = (i, field, val) => {
    setForm(f => {
      const labor = [...f.labor];
      labor[i] = { ...labor[i], [field]: val };
      if (field === 'worker_type') {
        const up = unitPrices.find(u => u.item_name === val);
        if (up) labor[i].unit_price = up.unit_price;
      }
      labor[i].total_price = (labor[i].count || 0) * (labor[i].unit_price || 0);
      return { ...f, labor };
    });
  };

  const addEquip = () => setForm(f => ({ ...f, equipment: [...f.equipment, emptyEquip()] }));
  const removeEquip = (i) => setForm(f => ({ ...f, equipment: f.equipment.filter((_, idx) => idx !== i) }));
  const updateEquip = (i, field, val) => {
    setForm(f => {
      const equipment = [...f.equipment];
      equipment[i] = { ...equipment[i], [field]: val };
      if (field === 'equipment_type') {
        const up = unitPrices.find(u => u.item_name === val);
        if (up) equipment[i].unit_price = up.unit_price;
      }
      equipment[i].total_price = (equipment[i].count || 0) * (equipment[i].unit_price || 0);
      return { ...f, equipment };
    });
  };

  const totalLaborCost = form.labor.reduce((s, l) => s + (l.count || 0) * (l.unit_price || 0), 0);
  const totalEquipCost = form.equipment.reduce((s, e) => s + (e.count || 0) * (e.unit_price || 0), 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">현장</label>
            <select value={filter.projectId} onChange={e => setFilter({...filter, projectId: e.target.value})} className="input-field w-44">
              <option value="">전체 현장</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">시작일</label>
            <input type="date" value={filter.startDate} onChange={e => setFilter({...filter, startDate: e.target.value})} className="input-field" />
          </div>
          <div>
            <label className="label">종료일</label>
            <input type="date" value={filter.endDate} onChange={e => setFilter({...filter, endDate: e.target.value})} className="input-field" />
          </div>
          <button onClick={fetchData} className="btn-secondary">조회</button>
          <button onClick={openAdd} className="btn-primary ml-auto">+ 일지 작성</button>
        </div>
      </div>

      {/* Log List */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="table-header">날짜</th>
              <th className="table-header">현장명</th>
              <th className="table-header">날씨</th>
              <th className="table-header">작업내용</th>
              <th className="table-header text-right">노무비</th>
              <th className="table-header text-right">장비비</th>
              <th className="table-header text-right">합계</th>
              <th className="table-header">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">로딩 중...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">일지가 없습니다</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="table-cell font-medium">{log.log_date}</td>
                <td className="table-cell">{log.project_name}</td>
                <td className="table-cell">
                  {log.weather === '맑음' ? '☀️' : log.weather === '흐림' ? '☁️' : log.weather === '비' ? '🌧️' : log.weather === '눈' ? '❄️' : '🌦️'} {log.weather}
                </td>
                <td className="table-cell max-w-xs truncate text-gray-600">{log.work_description}</td>
                <td className="table-cell text-right">{formatWon(log.total_labor_cost)}</td>
                <td className="table-cell text-right">{formatWon(log.total_equipment_cost)}</td>
                <td className="table-cell text-right font-medium">{formatWon(log.total_labor_cost + log.total_equipment_cost)}</td>
                <td className="table-cell">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(log.id)} className="text-xs text-blue-600 hover:underline">수정</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => handleDelete(log.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily Log Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold">{editId ? '일지 수정' : '일지 작성'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-5">
              {/* KakaoTalk Parser */}
              <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                <h4 className="text-sm font-semibold text-yellow-800 mb-2">🤖 카카오톡 AI 파싱</h4>
                <textarea
                  value={kakaoText}
                  onChange={e => setKakaoText(e.target.value)}
                  rows={4}
                  className="input-field text-sm"
                  placeholder="카카오톡 현장 메시지를 붙여넣으세요&#10;예) 2024.03.15 맑음&#10;조경공 3명, 인부 2명 투입&#10;굴삭기 1대&#10;식재작업 진행"
                />
                <button
                  onClick={handleParse}
                  disabled={parsing}
                  className="btn-primary mt-2 text-sm flex items-center gap-2"
                >
                  {parsing && <span className="inline-block animate-spin">⟳</span>}
                  {parsing ? 'AI 파싱 중...' : 'AI 파싱'}
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">현장 *</label>
                    <select required value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="input-field">
                      <option value="">현장 선택</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">날짜 *</label>
                    <input required type="date" value={form.log_date} onChange={e => setForm({...form, log_date: e.target.value})} className="input-field" />
                  </div>
                  <div>
                    <label className="label">날씨</label>
                    <select value={form.weather} onChange={e => setForm({...form, weather: e.target.value})} className="input-field">
                      {WEATHER_OPTIONS.map(w => <option key={w}>{w}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label">작업내용</label>
                    <textarea value={form.work_description} onChange={e => setForm({...form, work_description: e.target.value})} rows={2} className="input-field" placeholder="작업 내용 입력" />
                  </div>
                </div>

                {/* Labor */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">투입 인력</h4>
                    <button type="button" onClick={addLabor} className="text-xs text-green-600 hover:underline">+ 추가</button>
                  </div>
                  <div className="space-y-2">
                    {form.labor.map((l, i) => (
                      <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                        <select value={l.worker_type} onChange={e => updateLabor(i, 'worker_type', e.target.value)} className="input-field flex-1 bg-white">
                          {getLaborPrices().map(up => <option key={up.id}>{up.item_name}</option>)}
                          <option value="">직접입력</option>
                        </select>
                        <input type="number" step="0.5" min="0" value={l.count} onChange={e => updateLabor(i, 'count', parseFloat(e.target.value))} className="input-field w-16 text-center bg-white" placeholder="인원" />
                        <span className="text-gray-400 text-xs">명</span>
                        <input type="number" value={l.unit_price} onChange={e => updateLabor(i, 'unit_price', parseInt(e.target.value))} className="input-field w-28 bg-white" placeholder="단가" />
                        <span className="text-sm text-green-700 font-medium w-24 text-right">
                          {formatWon((l.count || 0) * (l.unit_price || 0))}
                        </span>
                        <button type="button" onClick={() => removeLabor(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                  <p className="text-right text-sm font-medium text-gray-700 mt-1">노무비 합계: <span className="text-green-700">{formatWon(totalLaborCost)}</span></p>
                </div>

                {/* Equipment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">투입 장비</h4>
                    <button type="button" onClick={addEquip} className="text-xs text-green-600 hover:underline">+ 추가</button>
                  </div>
                  <div className="space-y-2">
                    {form.equipment.map((eq, i) => (
                      <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                        <select value={eq.equipment_type} onChange={e => updateEquip(i, 'equipment_type', e.target.value)} className="input-field flex-1 bg-white">
                          {getEquipPrices().map(up => <option key={up.id}>{up.item_name}</option>)}
                        </select>
                        <input type="number" step="0.5" min="0" value={eq.count} onChange={e => updateEquip(i, 'count', parseFloat(e.target.value))} className="input-field w-16 text-center bg-white" placeholder="대수" />
                        <span className="text-gray-400 text-xs">대</span>
                        <input type="number" value={eq.unit_price} onChange={e => updateEquip(i, 'unit_price', parseInt(e.target.value))} className="input-field w-28 bg-white" placeholder="단가" />
                        <span className="text-sm text-green-700 font-medium w-24 text-right">
                          {formatWon((eq.count || 0) * (eq.unit_price || 0))}
                        </span>
                        <button type="button" onClick={() => removeEquip(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                  {form.equipment.length > 0 && (
                    <p className="text-right text-sm font-medium text-gray-700 mt-1">장비비 합계: <span className="text-green-700">{formatWon(totalEquipCost)}</span></p>
                  )}
                </div>

                <div className="bg-green-50 rounded-lg p-3 text-right">
                  <p className="text-base font-bold text-green-800">
                    일일 합계: {formatWon(totalLaborCost + totalEquipCost)}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">취소</button>
                  <button type="submit" className="btn-primary">{editId ? '수정' : '저장'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
