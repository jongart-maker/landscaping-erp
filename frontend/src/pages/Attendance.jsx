import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';
const currentYearMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

const ATTENDANCE_TYPES = ['정상', '반차', '결근', '휴가', '출장', '조퇴'];

const initialEmployee = {
  name: '', employee_number: '', position: '', department: '',
  hire_date: '', birth_date: '', phone: '', address: '',
  bank_name: '', bank_account: '', base_salary: '',
  employment_type: '정규직', status: '재직', notes: ''
};

const initialAttendance = {
  employee_id: '', project_id: '', work_date: today(),
  check_in: '08:00', check_out: '17:00',
  work_hours: 8, overtime_hours: 0,
  attendance_type: '정상', notes: ''
};

export default function Attendance() {
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [attendanceList, setAttendanceList] = useState([]);
  const [salaryList, setSalaryList] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth());
  const [filterEmpId, setFilterEmpId] = useState('');
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showAttModal, setShowAttModal] = useState(false);
  const [empForm, setEmpForm] = useState(initialEmployee);
  const [attForm, setAttForm] = useState(initialAttendance);
  const [editEmpId, setEditEmpId] = useState(null);
  const [editAttId, setEditAttId] = useState(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    fetchEmployees();
    axios.get('/api/projects').then(r => setProjects(r.data));
  }, []);

  const fetchEmployees = async () => {
    const res = await axios.get('/api/employees');
    setEmployees(res.data);
  };

  const fetchAttendance = async () => {
    const params = { month: selectedMonth };
    if (filterEmpId) params.employeeId = filterEmpId;
    const res = await axios.get('/api/attendance', { params });
    setAttendanceList(res.data);
  };

  const fetchSalary = async () => {
    const res = await axios.get('/api/salary', { params: { yearMonth: selectedMonth } });
    setSalaryList(res.data);
  };

  const fetchMonthlySummary = async () => {
    const res = await axios.get('/api/attendance/summary/monthly', { params: { month: selectedMonth } });
    setMonthlySummary(res.data);
  };

  useEffect(() => {
    if (activeTab === 'attendance') fetchAttendance();
    else if (activeTab === 'salary') fetchSalary();
    else if (activeTab === 'report') fetchMonthlySummary();
  }, [activeTab, selectedMonth, filterEmpId]);

  const openAddEmp = () => {
    setEditEmpId(null);
    setEmpForm(initialEmployee);
    setShowEmpModal(true);
  };

  const openEditEmp = (emp) => {
    setEditEmpId(emp.id);
    setEmpForm({ ...emp, base_salary: emp.base_salary || '' });
    setShowEmpModal(true);
  };

  const handleEmpSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editEmpId) await axios.put(`/api/employees/${editEmpId}`, empForm);
      else await axios.post('/api/employees', empForm);
      setShowEmpModal(false);
      fetchEmployees();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const openAddAtt = () => {
    setEditAttId(null);
    setAttForm({ ...initialAttendance, employee_id: employees[0]?.id || '' });
    setShowAttModal(true);
  };

  const openEditAtt = (a) => {
    setEditAttId(a.id);
    setAttForm({
      employee_id: a.employee_id, project_id: a.project_id || '',
      work_date: a.work_date, check_in: a.check_in || '',
      check_out: a.check_out || '', work_hours: a.work_hours,
      overtime_hours: a.overtime_hours, attendance_type: a.attendance_type,
      notes: a.notes || ''
    });
    setShowAttModal(true);
  };

  const handleAttSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editAttId) await axios.put(`/api/attendance/${editAttId}`, attForm);
      else await axios.post('/api/attendance', attForm);
      setShowAttModal(false);
      fetchAttendance();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const handleCalculateSalary = async () => {
    setCalculating(true);
    try {
      const res = await axios.post('/api/salary/calculate', { yearMonth: selectedMonth });
      alert(`급여 계산 완료: ${res.data.results.length}명`);
      fetchSalary();
    } catch (err) { alert(err.response?.data?.error || '계산 실패'); }
    finally { setCalculating(false); }
  };

  const tabs = [
    { key: 'employees', label: '직원등록' },
    { key: 'attendance', label: '출퇴근기록' },
    { key: 'salary', label: '급여계산' },
    { key: 'report', label: '근태리포트' },
  ];

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

      {/* Month Selector */}
      {activeTab !== 'employees' && (
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">년월</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="input-field" />
          </div>
          {activeTab === 'attendance' && (
            <>
              <div>
                <label className="label">직원</label>
                <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)} className="input-field w-40">
                  <option value="">전체</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <button onClick={openAddAtt} className="btn-primary ml-auto">+ 출결 등록</button>
            </>
          )}
          {activeTab === 'salary' && (
            <button onClick={handleCalculateSalary} disabled={calculating} className="btn-primary ml-auto">
              {calculating ? '계산 중...' : '급여 자동계산'}
            </button>
          )}
        </div>
      )}

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openAddEmp} className="btn-primary">+ 직원 등록</button>
          </div>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">이름</th>
                  <th className="table-header">직위</th>
                  <th className="table-header">부서</th>
                  <th className="table-header">고용형태</th>
                  <th className="table-header">입사일</th>
                  <th className="table-header">연락처</th>
                  <th className="table-header text-right">기본급</th>
                  <th className="table-header">상태</th>
                  <th className="table-header">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {employees.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">등록된 직원이 없습니다</td></tr>
                ) : employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{emp.name}</td>
                    <td className="table-cell">{emp.position || '-'}</td>
                    <td className="table-cell">{emp.department || '-'}</td>
                    <td className="table-cell">{emp.employment_type}</td>
                    <td className="table-cell">{emp.hire_date || '-'}</td>
                    <td className="table-cell">{emp.phone || '-'}</td>
                    <td className="table-cell text-right">{formatWon(emp.base_salary)}</td>
                    <td className="table-cell">
                      <span className={emp.status === '재직' ? 'badge-green' : 'badge-gray'}>{emp.status}</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => openEditEmp(emp)} className="text-xs text-blue-600 hover:underline">수정</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={async () => {
                          if (confirm('삭제하시겠습니까?')) { await axios.delete(`/api/employees/${emp.id}`); fetchEmployees(); }
                        }} className="text-xs text-red-500 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">날짜</th>
                <th className="table-header">직원</th>
                <th className="table-header">현장</th>
                <th className="table-header">출근</th>
                <th className="table-header">퇴근</th>
                <th className="table-header text-right">근무시간</th>
                <th className="table-header text-right">연장</th>
                <th className="table-header">구분</th>
                <th className="table-header">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {attendanceList.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">출결 기록이 없습니다</td></tr>
              ) : attendanceList.map(a => (
                <tr key={a.id} className={`hover:bg-gray-50 ${a.attendance_type === '결근' ? 'bg-red-50/50' : a.attendance_type === '휴가' ? 'bg-blue-50/50' : ''}`}>
                  <td className="table-cell">{a.work_date}</td>
                  <td className="table-cell font-medium">{a.employee_name}</td>
                  <td className="table-cell text-gray-500">{a.project_name || '-'}</td>
                  <td className="table-cell">{a.check_in || '-'}</td>
                  <td className="table-cell">{a.check_out || '-'}</td>
                  <td className="table-cell text-right">{a.work_hours}h</td>
                  <td className="table-cell text-right">{a.overtime_hours > 0 ? <span className="text-orange-600">+{a.overtime_hours}h</span> : '-'}</td>
                  <td className="table-cell">
                    <span className={
                      a.attendance_type === '정상' ? 'badge-green' :
                      a.attendance_type === '결근' ? 'badge-red' :
                      a.attendance_type === '휴가' ? 'badge-blue' : 'badge-yellow'
                    }>{a.attendance_type}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button onClick={() => openEditAtt(a)} className="text-xs text-blue-600 hover:underline">수정</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={async () => { if (confirm('삭제?')) { await axios.delete(`/api/attendance/${a.id}`); fetchAttendance(); }}} className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Salary Tab */}
      {activeTab === 'salary' && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">직원</th>
                <th className="table-header">직위</th>
                <th className="table-header text-right">근무일수</th>
                <th className="table-header text-right">기본급</th>
                <th className="table-header text-right">연장수당</th>
                <th className="table-header text-right">총지급액</th>
                <th className="table-header text-right">공제합계</th>
                <th className="table-header text-right">실지급액</th>
                <th className="table-header">지급여부</th>
                <th className="table-header">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {salaryList.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">급여 자동계산 버튼을 누르세요</td></tr>
              ) : salaryList.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{s.employee_name}</td>
                  <td className="table-cell text-gray-500">{s.position}</td>
                  <td className="table-cell text-right">{s.work_days}일</td>
                  <td className="table-cell text-right">{formatWon(s.base_salary)}</td>
                  <td className="table-cell text-right">{s.overtime_pay > 0 ? <span className="text-orange-600">{formatWon(s.overtime_pay)}</span> : '-'}</td>
                  <td className="table-cell text-right font-medium">{formatWon(s.total_gross)}</td>
                  <td className="table-cell text-right text-red-600">{formatWon(s.total_deductions)}</td>
                  <td className="table-cell text-right font-bold text-green-700">{formatWon(s.net_salary)}</td>
                  <td className="table-cell">
                    <span className={s.payment_status === '지급완료' ? 'badge-green' : 'badge-yellow'}>{s.payment_status}</span>
                  </td>
                  <td className="table-cell">
                    <button onClick={async () => {
                      const status = prompt('지급상태 변경 (미지급/지급완료)', s.payment_status);
                      if (status) {
                        await axios.put(`/api/salary/${s.id}`, { ...s, payment_status: status });
                        fetchSalary();
                      }
                    }} className="text-xs text-blue-600 hover:underline">변경</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {salaryList.length > 0 && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr className="font-semibold">
                  <td className="table-cell" colSpan={5}>합계</td>
                  <td className="table-cell text-right">{formatWon(salaryList.reduce((s, r) => s + r.total_gross, 0))}</td>
                  <td className="table-cell text-right text-red-600">{formatWon(salaryList.reduce((s, r) => s + r.total_deductions, 0))}</td>
                  <td className="table-cell text-right text-green-700">{formatWon(salaryList.reduce((s, r) => s + r.net_salary, 0))}</td>
                  <td className="table-cell" colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Report Tab */}
      {activeTab === 'report' && (
        <div className="card p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{selectedMonth} 근태 리포트</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">직원명</th>
                <th className="table-header">직위</th>
                <th className="table-header text-right">정상</th>
                <th className="table-header text-right">반차</th>
                <th className="table-header text-right">휴가</th>
                <th className="table-header text-right">결근</th>
                <th className="table-header text-right">연장시간</th>
                <th className="table-header text-right">기본급</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthlySummary.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">데이터가 없습니다</td></tr>
              ) : monthlySummary.map(s => (
                <tr key={s.employee_id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{s.employee_name}</td>
                  <td className="table-cell text-gray-500">{s.position}</td>
                  <td className="table-cell text-right">{s.normal_days}일</td>
                  <td className="table-cell text-right">{s.half_days > 0 ? `${s.half_days}일` : '-'}</td>
                  <td className="table-cell text-right text-blue-600">{s.vacation_days > 0 ? `${s.vacation_days}일` : '-'}</td>
                  <td className="table-cell text-right text-red-600">{s.absent_days > 0 ? `${s.absent_days}일` : '-'}</td>
                  <td className="table-cell text-right">{s.total_overtime > 0 ? <span className="text-orange-600">{s.total_overtime}h</span> : '-'}</td>
                  <td className="table-cell text-right">{formatWon(s.base_salary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee Modal */}
      {showEmpModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEmpModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editEmpId ? '직원 수정' : '직원 등록'}</h3>
              <button onClick={() => setShowEmpModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleEmpSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">이름 *</label>
                  <input required value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">사번</label>
                  <input value={empForm.employee_number} onChange={e => setEmpForm({...empForm, employee_number: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">직위</label>
                  <input value={empForm.position} onChange={e => setEmpForm({...empForm, position: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">부서</label>
                  <input value={empForm.department} onChange={e => setEmpForm({...empForm, department: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">입사일</label>
                  <input type="date" value={empForm.hire_date} onChange={e => setEmpForm({...empForm, hire_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">생년월일</label>
                  <input type="date" value={empForm.birth_date} onChange={e => setEmpForm({...empForm, birth_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">연락처</label>
                  <input value={empForm.phone} onChange={e => setEmpForm({...empForm, phone: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">기본급 (원)</label>
                  <input type="number" value={empForm.base_salary} onChange={e => setEmpForm({...empForm, base_salary: e.target.value})} className="input-field" placeholder="0" />
                </div>
                <div>
                  <label className="label">고용형태</label>
                  <select value={empForm.employment_type} onChange={e => setEmpForm({...empForm, employment_type: e.target.value})} className="input-field">
                    <option>정규직</option>
                    <option>계약직</option>
                    <option>일용직</option>
                    <option>파트타임</option>
                  </select>
                </div>
                <div>
                  <label className="label">재직상태</label>
                  <select value={empForm.status} onChange={e => setEmpForm({...empForm, status: e.target.value})} className="input-field">
                    <option>재직</option>
                    <option>퇴직</option>
                    <option>휴직</option>
                  </select>
                </div>
                <div>
                  <label className="label">은행</label>
                  <input value={empForm.bank_name} onChange={e => setEmpForm({...empForm, bank_name: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">계좌번호</label>
                  <input value={empForm.bank_account} onChange={e => setEmpForm({...empForm, bank_account: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEmpModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editEmpId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance Modal */}
      {showAttModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAttModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editAttId ? '출결 수정' : '출결 등록'}</h3>
              <button onClick={() => setShowAttModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleAttSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">직원 *</label>
                  <select required value={attForm.employee_id} onChange={e => setAttForm({...attForm, employee_id: e.target.value})} className="input-field">
                    <option value="">선택</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">현장</label>
                  <select value={attForm.project_id} onChange={e => setAttForm({...attForm, project_id: e.target.value})} className="input-field">
                    <option value="">선택 안함</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">날짜 *</label>
                  <input required type="date" value={attForm.work_date} onChange={e => setAttForm({...attForm, work_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">구분</label>
                  <select value={attForm.attendance_type} onChange={e => setAttForm({...attForm, attendance_type: e.target.value})} className="input-field">
                    {ATTENDANCE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">출근시간</label>
                  <input type="time" value={attForm.check_in} onChange={e => setAttForm({...attForm, check_in: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">퇴근시간</label>
                  <input type="time" value={attForm.check_out} onChange={e => setAttForm({...attForm, check_out: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">근무시간</label>
                  <input type="number" step="0.5" value={attForm.work_hours} onChange={e => setAttForm({...attForm, work_hours: parseFloat(e.target.value)})} className="input-field" />
                </div>
                <div>
                  <label className="label">연장시간</label>
                  <input type="number" step="0.5" value={attForm.overtime_hours} onChange={e => setAttForm({...attForm, overtime_hours: parseFloat(e.target.value)})} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="label">비고</label>
                  <input value={attForm.notes} onChange={e => setAttForm({...attForm, notes: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAttModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editAttId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
