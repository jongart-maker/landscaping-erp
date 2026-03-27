import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const formatWon = (v) => v ? '₩' + Number(v).toLocaleString('ko-KR') : '₩0';
const formatShort = (v) => {
  if (!v) return '0';
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + '만';
  return v.toLocaleString();
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {formatShort(p.value)}</p>)}
    </div>
  );
};

export default function ProfitReport() {
  const [projects, setProjects] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, dashRes] = await Promise.all([
        axios.get('/api/projects'),
        axios.get('/api/dashboard'),
      ]);
      setProjects(projRes.data);
      setDashboard(dashRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const data = projects.map(p => ({
        '현장명': p.name,
        '발주처': p.client,
        '상태': p.status,
        '계약금액': p.contract_amount,
        '총원가': p.total_cost,
        '수금액': p.total_received,
        '이익(추정)': (p.total_received || 0) - (p.total_cost || 0),
        '이익률': p.total_received > 0
          ? (((p.total_received - p.total_cost) / p.total_received) * 100).toFixed(1) + '%'
          : '-',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '손익보고서');
      XLSX.writeFile(wb, `손익보고서_${selectedYear}.xlsx`);
    } catch (err) {
      alert('Excel 내보내기 실패: ' + err.message);
    }
  };

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text('손익 보고서', 14, 20);
      doc.setFontSize(10);
      doc.text(`작성일: ${new Date().toLocaleDateString('ko-KR')}`, 14, 28);

      autoTable(doc, {
        startY: 35,
        head: [['현장명', '발주처', '상태', '계약금액', '총원가', '수금액', '이익(추정)', '이익률']],
        body: projects.map(p => {
          const profit = (p.total_received || 0) - (p.total_cost || 0);
          return [
            p.name, p.client, p.status,
            formatWon(p.contract_amount),
            formatWon(p.total_cost),
            formatWon(p.total_received),
            formatWon(profit),
            p.total_received > 0 ? ((profit / p.total_received) * 100).toFixed(1) + '%' : '-'
          ];
        }),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [22, 163, 74] },
      });
      doc.save(`손익보고서_${selectedYear}.pdf`);
    } catch (err) {
      alert('PDF 내보내기 실패: ' + err.message);
    }
  };

  const monthlyChartData = dashboard?.monthlyTrend.map(t => ({
    month: t.month.slice(5) + '월',
    매출: t.revenue,
    원가: t.cost,
    이익: t.profit,
  })) || [];

  const totalRevenue = projects.reduce((s, p) => s + (p.total_received || 0), 0);
  const totalCost = projects.reduce((s, p) => s + (p.total_cost || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const profitRate = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '총 수금액', value: formatShort(totalRevenue), color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: '총 원가', value: formatShort(totalCost), color: 'text-orange-700', bg: 'bg-orange-50' },
          { label: '총 이익', value: formatShort(totalProfit), color: totalProfit >= 0 ? 'text-green-700' : 'text-red-700', bg: totalProfit >= 0 ? 'bg-green-50' : 'bg-red-50' },
          { label: '평균 이익률', value: `${profitRate}%`, color: parseFloat(profitRate) >= 0 ? 'text-green-700' : 'text-red-700', bg: 'bg-purple-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-xl p-4 ${bg}`}>
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Monthly Trend Chart */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-800 mb-4">월별 손익 추이 (최근 6개월)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} width={65} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="매출" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="원가" fill="#f97316" radius={[3, 3, 0, 0]} />
            <Bar dataKey="이익" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Project Profit Table */}
      <div className="card p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">현장별 손익 현황</h3>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="btn-outline text-sm py-1.5 px-3">Excel</button>
            <button onClick={exportPDF} className="btn-secondary text-sm py-1.5 px-3">PDF</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">현장명</th>
                <th className="table-header">발주처</th>
                <th className="table-header">상태</th>
                <th className="table-header text-right">계약금액</th>
                <th className="table-header text-right">총원가</th>
                <th className="table-header text-right">수금액</th>
                <th className="table-header text-right">이익(추정)</th>
                <th className="table-header text-right">이익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {projects.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">데이터가 없습니다</td></tr>
              ) : projects.map(p => {
                const profit = (p.total_received || 0) - (p.total_cost || 0);
                const rate = p.total_received > 0 ? ((profit / p.total_received) * 100).toFixed(1) : null;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{p.name}</td>
                    <td className="table-cell text-gray-600">{p.client}</td>
                    <td className="table-cell">
                      <span className={p.status === '진행중' ? 'badge-green' : p.status === '완료' ? 'badge-blue' : 'badge-gray'}>{p.status}</span>
                    </td>
                    <td className="table-cell text-right">{formatWon(p.contract_amount)}</td>
                    <td className="table-cell text-right">{formatWon(p.total_cost)}</td>
                    <td className="table-cell text-right text-blue-700">{formatWon(p.total_received)}</td>
                    <td className={`table-cell text-right font-semibold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatWon(profit)}</td>
                    <td className={`table-cell text-right font-medium ${!rate ? 'text-gray-400' : parseFloat(rate) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {rate ? `${rate}%` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200">
              <tr className="bg-gray-50 font-semibold">
                <td className="table-cell" colSpan={3}>합계</td>
                <td className="table-cell text-right">{formatWon(projects.reduce((s, p) => s + (p.contract_amount || 0), 0))}</td>
                <td className="table-cell text-right">{formatWon(totalCost)}</td>
                <td className="table-cell text-right text-blue-700">{formatWon(totalRevenue)}</td>
                <td className={`table-cell text-right ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatWon(totalProfit)}</td>
                <td className={`table-cell text-right ${parseFloat(profitRate) >= 0 ? 'text-green-700' : 'text-red-600'}`}>{profitRate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
