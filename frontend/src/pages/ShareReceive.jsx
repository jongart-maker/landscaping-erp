import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function ShareReceive() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState('parsing'); // parsing | success | error | empty
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [assigning, setAssigning] = useState(false);

  const text = searchParams.get('text') || searchParams.get('url') || '';
  const title = searchParams.get('title') || '';

  useEffect(() => {
    if (!text && !title) {
      setStatus('empty');
      return;
    }

    const combined = [title, text].filter(Boolean).join('\n');

    (async () => {
      try {
        const res = await axios.post('/api/share/kakao', { text: combined });
        setResult(res.data);
        setStatus('success');
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        setStatus('error');
      }
    })();

    axios.get('/api/projects').then((r) => setProjects(r.data || [])).catch(() => {});
  }, []);

  const handleAssignProject = async () => {
    if (!selectedProject || !result?.id) return;
    setAssigning(true);
    try {
      // 저장된 로그에 프로젝트 할당
      const log = await axios.get(`/api/dailylogs/${result.id}`);
      await axios.put(`/api/dailylogs/${result.id}`, {
        ...log.data,
        project_id: selectedProject,
        labor: log.data.labor,
        equipment: log.data.equipment,
      });
      setResult((prev) => ({ ...prev, project_id: Number(selectedProject) }));
    } catch (err) {
      alert('프로젝트 할당 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setAssigning(false);
    }
  };

  if (status === 'empty') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">📭</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">공유된 내용이 없습니다</h2>
          <p className="text-sm text-gray-500 mb-6">카카오톡에서 텍스트를 공유해주세요.</p>
          <Link to="/" className="btn-primary inline-block">홈으로</Link>
        </div>
      </div>
    );
  }

  if (status === 'parsing') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="animate-spin text-5xl mb-4">🌿</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">AI 파싱 중...</h2>
          <p className="text-sm text-gray-500">카카오톡 메시지를 분석하고 저장하고 있습니다.</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">파싱 실패</h2>
          <p className="text-sm text-red-500 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(-1)} className="btn-secondary">뒤로</button>
            <Link to="/dailylogs" className="btn-primary inline-block">일지 목록</Link>
          </div>
        </div>
      </div>
    );
  }

  // success
  const assignedProject = projects.find((p) => p.id === result.project_id);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="bg-green-600 rounded-2xl p-5 text-white mb-4 shadow">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">✅</span>
            <h1 className="text-lg font-bold">저장 완료!</h1>
          </div>
          <p className="text-green-100 text-sm">일지 #{result.id}이 생성되었습니다.</p>
        </div>

        {/* 파싱 결과 */}
        <div className="bg-white rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>📋</span> 파싱 결과
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">날짜</p>
              <p className="font-semibold text-gray-800">{result.log_date}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">날씨</p>
              <p className="font-semibold text-gray-800">{result.weather}</p>
            </div>
          </div>

          {result.work_description && (
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">작업내용</p>
              <p className="text-sm text-gray-700">{result.work_description}</p>
            </div>
          )}

          {/* 인력 */}
          {result.labor && result.labor.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">투입 인력</p>
              <div className="space-y-1.5">
                {result.labor.map((l, i) => (
                  <div key={i} className="flex justify-between items-center bg-blue-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{l.worker_type} × {l.count}명</span>
                    <span className="text-sm font-semibold text-blue-700">
                      {(l.total_price || 0).toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 장비 */}
          {result.equipment && result.equipment.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">투입 장비</p>
              <div className="space-y-1.5">
                {result.equipment.map((e, i) => (
                  <div key={i} className="flex justify-between items-center bg-orange-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{e.equipment_type} × {e.count}대</span>
                    <span className="text-sm font-semibold text-orange-700">
                      {(e.total_price || 0).toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 합계 */}
          <div className="border-t pt-3 mt-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-600">총 비용</span>
            <span className="text-base font-bold text-green-700">
              {((result.total_labor_cost || 0) + (result.total_equipment_cost || 0)).toLocaleString()}원
            </span>
          </div>
        </div>

        {/* 프로젝트 할당 */}
        <div className="bg-white rounded-2xl shadow p-5 mb-4">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>🏗️</span> 현장 연결
            {result.project_id && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-auto">
                {assignedProject?.name || `현장 #${result.project_id}`}
              </span>
            )}
          </h2>

          {!result.project_id ? (
            <div className="flex gap-2">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="input-field flex-1 text-sm"
              >
                <option value="">현장 선택...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={handleAssignProject}
                disabled={!selectedProject || assigning}
                className="btn-primary text-sm px-4 disabled:opacity-50"
              >
                {assigning ? '...' : '연결'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">현장이 연결되었습니다.</p>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-3">
          <Link
            to={`/dailylogs`}
            className="flex-1 btn-primary text-center text-sm py-3 rounded-xl"
          >
            일지 목록 보기
          </Link>
          <Link
            to="/"
            className="flex-1 btn-secondary text-center text-sm py-3 rounded-xl"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
