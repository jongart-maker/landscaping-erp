import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import DailyLogs from './pages/DailyLogs';
import CostManagement from './pages/CostManagement';
import TaxInvoices from './pages/TaxInvoices';
import Payments from './pages/Payments';
import ProfitReport from './pages/ProfitReport';
import Attendance from './pages/Attendance';
import Defects from './pages/Defects';
import Settings from './pages/Settings';
import ShareReceive from './pages/ShareReceive';
import InstallGuide from './pages/InstallGuide';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://landscaping-erp-api.jji8321.workers.dev';
axios.defaults.baseURL = API_URL;

const menuItems = [
  { path: '/', label: '대시보드', icon: '📊', exact: true },
  { path: '/projects', label: '현장관리', icon: '🏗️' },
  { path: '/dailylogs', label: '일일업무일지', icon: '📋' },
  { path: '/costs', label: '원가관리', icon: '💰' },
  { path: '/taxinvoices', label: '세금계산서', icon: '🧾', badge: 'uninvoiced' },
  { path: '/payments', label: '수금관리', icon: '💳' },
  { path: '/profit', label: '손익보고서', icon: '📈' },
  { path: '/attendance', label: '근태/급여', icon: '👥' },
  { path: '/defects', label: '하자관리', icon: '🔧', badge: 'defects' },
  { path: '/settings', label: '설정', icon: '⚙️' },
  { path: '/install', label: '앱 설치 안내', icon: '📲' },
];

function Sidebar({ isOpen, onClose, badges }) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-30 transform transition-transform duration-300
        lg:translate-x-0 lg:static lg:z-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-green-400">조경 ERP</h1>
              <p className="text-xs text-gray-400 mt-0.5">통합 경영관리 시스템</p>
            </div>
            <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white p-1">✕</button>
          </div>
        </div>
        <nav className="mt-2 px-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors duration-150
                ${isActive ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`
              }
            >
              <span className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                {item.label}
              </span>
              {item.badge === 'uninvoiced' && badges.uninvoiced > 0 && (
                <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-0.5 min-w-5 text-center">
                  {badges.uninvoiced}
                </span>
              )}
              {item.badge === 'defects' && badges.defects > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-5 text-center">
                  {badges.defects}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">v1.0.0 &copy; 2025</p>
        </div>
      </aside>
    </>
  );
}

function Header({ onMenuClick, title }) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="text-sm text-gray-500">
        {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
      </div>
    </header>
  );
}

function PageTitle() {
  const location = useLocation();
  const current = menuItems.find(item => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  });
  return current?.label || '조경 ERP';
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [badges, setBadges] = useState({ uninvoiced: 0, defects: 0 });

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const [invoicesRes, defectsRes] = await Promise.all([
          axios.get('/api/taxinvoices?status=미발행'),
          axios.get('/api/defects?status=접수'),
        ]);
        setBadges({
          uninvoiced: invoicesRes.data.length,
          defects: defectsRes.data.length,
        });
      } catch (err) {
        console.error('Failed to fetch badges:', err);
      }
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, []);

  const title = <PageTitle />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badges={badges}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/dailylogs" element={<DailyLogs />} />
            <Route path="/costs" element={<CostManagement />} />
            <Route path="/taxinvoices" element={<TaxInvoices />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/profit" element={<ProfitReport />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/defects" element={<Defects />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/install" element={<InstallGuide />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 공유 수신 페이지는 레이아웃 없이 독립 렌더링 */}
        <Route path="/share-receive" element={<ShareReceive />} />
        {/* 나머지는 사이드바+헤더 레이아웃 */}
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Router>
  );
}
