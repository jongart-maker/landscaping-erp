import React, { useState, useEffect } from 'react';
import axios from 'axios';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';

const initialVendor = {
  name: '', business_number: '', representative: '', address: '',
  phone: '', email: '', bank_name: '', bank_account: '', account_holder: '',
  vendor_type: '자재', notes: ''
};

const initialUnitPrice = { category: '인력', item_name: '', unit: '일', unit_price: '', description: '' };

export default function Settings() {
  const [activeTab, setActiveTab] = useState('vendors');
  const [vendors, setVendors] = useState([]);
  const [unitPrices, setUnitPrices] = useState([]);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showUPModal, setShowUPModal] = useState(false);
  const [vendorForm, setVendorForm] = useState(initialVendor);
  const [upForm, setUpForm] = useState(initialUnitPrice);
  const [editVendorId, setEditVendorId] = useState(null);
  const [editUPId, setEditUPId] = useState(null);
  const [vendorFilter, setVendorFilter] = useState('');
  const [vendorTypeFilter, setVendorTypeFilter] = useState('');

  useEffect(() => {
    fetchVendors();
    fetchUnitPrices();
  }, []);

  const fetchVendors = async () => {
    const res = await axios.get('/api/vendors');
    setVendors(res.data);
  };

  const fetchUnitPrices = async () => {
    const res = await axios.get('/api/unitprices');
    setUnitPrices(res.data);
  };

  const openAddVendor = () => {
    setEditVendorId(null);
    setVendorForm(initialVendor);
    setShowVendorModal(true);
  };

  const openEditVendor = (v) => {
    setEditVendorId(v.id);
    setVendorForm({ ...v });
    setShowVendorModal(true);
  };

  const handleVendorSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editVendorId) await axios.put(`/api/vendors/${editVendorId}`, vendorForm);
      else await axios.post('/api/vendors', vendorForm);
      setShowVendorModal(false);
      fetchVendors();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const handleDeleteVendor = async (id) => {
    if (!confirm('거래처를 삭제하시겠습니까?')) return;
    await axios.delete(`/api/vendors/${id}`);
    fetchVendors();
  };

  const openAddUP = () => {
    setEditUPId(null);
    setUpForm(initialUnitPrice);
    setShowUPModal(true);
  };

  const openEditUP = (up) => {
    setEditUPId(up.id);
    setUpForm({ ...up });
    setShowUPModal(true);
  };

  const handleUPSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editUPId) await axios.put(`/api/unitprices/${editUPId}`, upForm);
      else await axios.post('/api/unitprices', upForm);
      setShowUPModal(false);
      fetchUnitPrices();
    } catch (err) { alert(err.response?.data?.error || '저장 실패'); }
  };

  const handleDeleteUP = async (id) => {
    if (!confirm('단가를 삭제하시겠습니까?')) return;
    await axios.delete(`/api/unitprices/${id}`);
    fetchUnitPrices();
  };

  const filteredVendors = vendors.filter(v => {
    const matchText = v.name.includes(vendorFilter) || (v.representative || '').includes(vendorFilter);
    const matchType = vendorTypeFilter ? v.vendor_type === vendorTypeFilter : true;
    return matchText && matchType;
  });

  const tabs = [
    { key: 'vendors', label: '거래처관리' },
    { key: 'unitprices', label: '단가표' },
    { key: 'system', label: '시스템설정' },
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

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div className="space-y-3">
          <div className="card p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">검색</label>
              <input value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="input-field w-44" placeholder="거래처명, 대표자..." />
            </div>
            <div>
              <label className="label">유형</label>
              <select value={vendorTypeFilter} onChange={e => setVendorTypeFilter(e.target.value)} className="input-field w-32">
                <option value="">전체</option>
                <option>자재</option>
                <option>장비</option>
                <option>하도급</option>
                <option>기타</option>
              </select>
            </div>
            <button onClick={openAddVendor} className="btn-primary ml-auto">+ 거래처 등록</button>
          </div>

          <div className="card p-0 overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">거래처명</th>
                  <th className="table-header">유형</th>
                  <th className="table-header">사업자번호</th>
                  <th className="table-header">대표자</th>
                  <th className="table-header">연락처</th>
                  <th className="table-header">계좌정보</th>
                  <th className="table-header">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredVendors.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">거래처가 없습니다</td></tr>
                ) : filteredVendors.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{v.name}</td>
                    <td className="table-cell">
                      <span className={v.vendor_type === '자재' ? 'badge-green' : v.vendor_type === '장비' ? 'badge-blue' : 'badge-gray'}>{v.vendor_type}</span>
                    </td>
                    <td className="table-cell text-gray-600">{v.business_number || '-'}</td>
                    <td className="table-cell">{v.representative || '-'}</td>
                    <td className="table-cell">{v.phone || '-'}</td>
                    <td className="table-cell text-sm text-gray-500">
                      {v.bank_name ? `${v.bank_name} ${v.bank_account}` : '-'}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => openEditVendor(v)} className="text-xs text-blue-600 hover:underline">수정</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => handleDeleteVendor(v.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unit Prices Tab */}
      {activeTab === 'unitprices' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openAddUP} className="btn-primary">+ 단가 추가</button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {['인력', '장비'].map(category => (
              <div key={category} className="card">
                <h3 className="text-base font-semibold text-gray-700 mb-4">{category} 단가</h3>
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
                        <td className="table-cell pl-0 font-medium">{up.item_name}</td>
                        <td className="table-cell text-gray-500">{up.unit}</td>
                        <td className="table-cell text-right font-medium">{formatWon(up.unit_price)}</td>
                        <td className="table-cell">
                          <div className="flex gap-1">
                            <button onClick={() => openEditUP(up)} className="text-xs text-blue-600 hover:underline">수정</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={() => handleDeleteUP(up.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Settings Tab */}
      {activeTab === 'system' && (
        <div className="card max-w-lg">
          <h3 className="text-base font-semibold text-gray-700 mb-4">시스템 정보</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">시스템명</span>
              <span className="font-medium">조경회사 통합 경영관리 시스템</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">버전</span>
              <span className="font-medium">v1.0.0</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">백엔드</span>
              <span className="font-medium">Node.js + Express + SQLite</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">프론트엔드</span>
              <span className="font-medium">React 18 + Vite + Tailwind CSS</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">AI 파싱</span>
              <span className="font-medium">Claude API (claude-sonnet-4-20250514)</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">데이터베이스</span>
              <span className="font-medium">better-sqlite3</span>
            </div>
          </div>
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-sm font-medium text-yellow-800 mb-1">API 키 설정</p>
            <p className="text-xs text-yellow-700">Claude AI 파싱 기능을 사용하려면 backend/.env 파일에 ANTHROPIC_API_KEY를 설정하세요.</p>
          </div>
        </div>
      )}

      {/* Vendor Modal */}
      {showVendorModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowVendorModal(false)}>
          <div className="modal-content">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editVendorId ? '거래처 수정' : '거래처 등록'}</h3>
              <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleVendorSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">거래처명 *</label>
                  <input required value={vendorForm.name} onChange={e => setVendorForm({...vendorForm, name: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">유형</label>
                  <select value={vendorForm.vendor_type} onChange={e => setVendorForm({...vendorForm, vendor_type: e.target.value})} className="input-field">
                    <option>자재</option>
                    <option>장비</option>
                    <option>하도급</option>
                    <option>기타</option>
                  </select>
                </div>
                <div>
                  <label className="label">사업자번호</label>
                  <input value={vendorForm.business_number} onChange={e => setVendorForm({...vendorForm, business_number: e.target.value})} className="input-field" placeholder="000-00-00000" />
                </div>
                <div>
                  <label className="label">대표자</label>
                  <input value={vendorForm.representative} onChange={e => setVendorForm({...vendorForm, representative: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">연락처</label>
                  <input value={vendorForm.phone} onChange={e => setVendorForm({...vendorForm, phone: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">이메일</label>
                  <input type="email" value={vendorForm.email} onChange={e => setVendorForm({...vendorForm, email: e.target.value})} className="input-field" />
                </div>
                <div className="col-span-2">
                  <label className="label">주소</label>
                  <input value={vendorForm.address} onChange={e => setVendorForm({...vendorForm, address: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">은행</label>
                  <input value={vendorForm.bank_name} onChange={e => setVendorForm({...vendorForm, bank_name: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">계좌번호</label>
                  <input value={vendorForm.bank_account} onChange={e => setVendorForm({...vendorForm, bank_account: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">예금주</label>
                  <input value={vendorForm.account_holder} onChange={e => setVendorForm({...vendorForm, account_holder: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="label">비고</label>
                  <input value={vendorForm.notes} onChange={e => setVendorForm({...vendorForm, notes: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowVendorModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editVendorId ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unit Price Modal */}
      {showUPModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUPModal(false)}>
          <div className="modal-content max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold">{editUPId ? '단가 수정' : '단가 추가'}</h3>
              <button onClick={() => setShowUPModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleUPSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">분류</label>
                <select value={upForm.category} onChange={e => setUpForm({...upForm, category: e.target.value})} className="input-field">
                  <option>인력</option>
                  <option>장비</option>
                </select>
              </div>
              <div>
                <label className="label">품명 *</label>
                <input required value={upForm.item_name} onChange={e => setUpForm({...upForm, item_name: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="label">단위</label>
                <input value={upForm.unit} onChange={e => setUpForm({...upForm, unit: e.target.value})} className="input-field" />
              </div>
              <div>
                <label className="label">단가 (원)</label>
                <input required type="number" value={upForm.unit_price} onChange={e => setUpForm({...upForm, unit_price: e.target.value})} className="input-field" placeholder="0" />
              </div>
              <div>
                <label className="label">설명</label>
                <input value={upForm.description} onChange={e => setUpForm({...upForm, description: e.target.value})} className="input-field" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowUPModal(false)} className="btn-secondary">취소</button>
                <button type="submit" className="btn-primary">{editUPId ? '수정' : '추가'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
