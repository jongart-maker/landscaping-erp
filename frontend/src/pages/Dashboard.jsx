import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const formatWon = (v) => {
  if (!v && v !== 0) return '-';
  return '₩' + Number(v).toLocaleString('ko-KR');
};

const formatShortWon = (v) => {
  if (!v && v !== 0) return '0';
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(1) + '억';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + '만';
  return Number(v).toLocaleString();
};

function SummaryCard({ title, value, sub, color, icon }) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl text-2xl ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500">{title}</p>
        <p className={`text-xl font-bold mt-0.5 truncate ${
          typeof value === 'string' && value.startsWith('-') ? 'text-red-600' :
          color.includes('green') ? 'text-green-700' : 'text-gray-900'
        }`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ used, total, label, color }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-gray-700 truncate">{label}</span>
        <span className={`font-medium ${pct > 90 ? 'text-red-600' : pct > 75 ? 'text-orange-500' : 'text-green-600'}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>{formatShortWon(used)}</span>
        <span>{formatShortWon(total)}</span>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-sm">
          {p.name}: {formatShortWon(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/dashboard')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
    </div>
  );

  if (!data) return <div className="text-center text-gray-500 py-8">데이터를 불러올 수 없습니다</div>;

  const profitColor = data.monthlyProfit >= 0 ? 'text-green-700' : 'text-red-600';

  const trendData = data.monthlyTrend.map(t => ({
    month: t.month.slice(5) + '월',
    매출: t.revenue,
    원가: t.cost,
    이익: t.profit,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <SummaryCard
          title="이번달 매출"
          value={formatShortWon(data.monthlyRevenue)}
          sub="수금 기준"
          color="bg-blue-50"
          icon="📥"
        />
        <SummaryCard
          title="이번달 원가"
          value={formatShortWon(data.monthlyCosts)}
          sub="인건비+자재비"
          color="bg-orange-50"
          icon="💸"
        />
        <SummaryCard
          title="이번달 이익"
          value={formatShortWon(data.monthlyProfit)}
          sub={`이익률 ${data.monthlyRevenue > 0 ? ((data.monthlyProfit / data.monthlyRevenue) * 100).toFixed(1) : 0}%`}
          color={data.monthlyProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}
          icon={data.monthlyProfit >= 0 ? '📈' : '📉'}
        />
        <SummaryCard
          title="총 미수금"
          value={formatShortWon(data.totalReceivables)}
          sub="청구 미수령"
          color="bg-yellow-50"
          icon="🔔"
        />
        <SummaryCard
          title="미처리 하자"
          value={`${data.unpaidDefectsCount}건`}
          sub="완료 제외"
          color="bg-red-50"
          icon="🔧"
        />
        <SummaryCard
          title="이번달 급여"
          value={formatShortWon(data.expectedSalary)}
          sub="재직자 기준"
          color="bg-purple-50"
          icon="👥"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 card">
          <h3 className="text-base font-semibold text-gray-800 mb-4">월별 손익 추이 (최근 6개월)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatShortWon} tick={{ fontSize: 11 }} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="매출" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="원가" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="이익" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Budget Utilization */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-800 mb-4">현장별 예산 집행률</h3>
          {data.projectUtilization.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">진행중인 현장이 없습니다</p>
          ) : (
            <div className="space-y-1">
              {data.projectUtilization.map(p => (
                <ProgressBar
                  key={p.id}
                  label={p.name}
                  used={p.total_spent}
                  total={p.total_budget}
                  color="green"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Receivables */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-red-500">⚠️</span> 90일 초과 미수금
          </h3>
          {data.overdueReceivables.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">90일 초과 미수금이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {data.overdueReceivables.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.project_name}</p>
                    <p className="text-xs text-gray-500">{r.bill_date} 청구</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{formatShortWon(r.bill_amount)}</p>
                    <p className="text-xs text-red-500">{Math.floor(r.days_overdue)}일 경과</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Defect Deadlines */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-orange-500">⏰</span> 처리기한 임박 하자
          </h3>
          {data.upcomingDefects.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">임박한 하자 처리기한이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {data.upcomingDefects.map((d, i) => {
                const daysLeft = Math.ceil(d.days_until_due);
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
                    daysLeft <= 0 ? 'bg-red-50 border-red-100' : daysLeft <= 3 ? 'bg-orange-50 border-orange-100' : 'bg-yellow-50 border-yellow-100'
                  }`}>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{d.title}</p>
                      <p className="text-xs text-gray-500">{d.project_name}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        daysLeft <= 0 ? 'bg-red-100 text-red-700' :
                        daysLeft <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {daysLeft <= 0 ? `${Math.abs(daysLeft)}일 초과` : `D-${daysLeft}`}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{d.due_date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
