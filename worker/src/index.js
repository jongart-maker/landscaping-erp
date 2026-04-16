// =============================================================================
// Landscaping ERP – Cloudflare Worker
// Express + pg → Cloudflare Workers + Supabase REST API
// =============================================================================

// ── CORS ─────────────────────────────────────────────────────────────────────

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function err(message, status = 500, corsHeaders = {}) {
  return json({ error: message }, status, corsHeaders);
}

// ── Supabase REST helper ──────────────────────────────────────────────────────
// sb(env, path, opts)
//   path    : 'tablename?select=*&filter=eq.x' or 'tablename'
//   opts    : { method, body, prefer, headers }
// Returns parsed JSON (array or object). Throws on HTTP error.

async function sb(env, path, opts = {}) {
  const base = `${env.SUPABASE_URL}/rest/v1`;
  const url = path.startsWith('http') ? path : `${base}/${path}`;
  const method = opts.method || 'GET';

  const preferDefault = method === 'GET' ? '' : 'return=representation';
  const prefer = opts.prefer !== undefined ? opts.prefer : preferDefault;

  const headers = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
    ...(opts.headers || {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || errBody.error || res.statusText);
  }
  // DELETE with no content
  if (res.status === 204) return null;
  return res.json();
}

// Convenience: aggregate an array of objects by a key using a numeric field
function sumBy(arr, keyField, valueField) {
  return arr.reduce((acc, row) => {
    const k = row[keyField];
    acc[k] = (acc[k] || 0) + (Number(row[valueField]) || 0);
    return acc;
  }, {});
}

// YYYY-MM range helpers
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: nextMonth };
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Route helpers ─────────────────────────────────────────────────────────────

function match(method, url, pattern) {
  if (url.method !== method) return null;
  const patParts = pattern.split('/');
  const urlParts = url.pathname.split('/');
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// ═════════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═════════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function handleDashboard(env, cors) {
  const ym = currentYM();
  const { start, end } = monthRange(ym);

  const [
    monthPayments,
    monthDailylogs,
    monthPurchases,
    allProgressbills,
    allPayments,
    defects,
    employees,
    taxinvoices,
    activeProjects,
  ] = await Promise.all([
    sb(env, `payments?is_received=eq.1&payment_date=gte.${start}&payment_date=lt.${end}&select=amount`),
    sb(env, `dailylogs?log_date=gte.${start}&log_date=lt.${end}&select=total_labor_cost,total_equipment_cost`),
    sb(env, `purchases?purchase_date=gte.${start}&purchase_date=lt.${end}&select=total_amount`),
    sb(env, `progressbills?select=id,project_id,bill_amount,bill_date`),
    sb(env, `payments?is_received=eq.1&select=project_id,progressbill_id,amount`),
    sb(env, `defects?status=neq.완료&select=id`),
    sb(env, `employees?status=eq.재직&select=base_salary`),
    sb(env, `taxinvoices?status=eq.미발행&select=id`),
    sb(env, `projects?status=eq.진행중&select=id,name,contract_amount`),
  ]);

  const monthlyRevenue = monthPayments.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const monthlyCosts =
    monthDailylogs.reduce((s, r) => s + (Number(r.total_labor_cost) || 0) + (Number(r.total_equipment_cost) || 0), 0) +
    monthPurchases.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  // Receivables: progressbills minus received payments
  const receivedByBill = allPayments.reduce((acc, p) => {
    if (p.progressbill_id) acc[p.progressbill_id] = (acc[p.progressbill_id] || 0) + Number(p.amount);
    return acc;
  }, {});
  const totalReceivables = allProgressbills.reduce((s, pb) => {
    const received = receivedByBill[pb.id] || 0;
    return s + Math.max(0, Number(pb.bill_amount) - received);
  }, 0);

  // Project utilization – fetch dailylogs+purchases per active project
  const projectUtilization = await Promise.all(
    activeProjects.slice(0, 10).map(async (p) => {
      const [logs, purch] = await Promise.all([
        sb(env, `dailylogs?project_id=eq.${p.id}&select=total_labor_cost,total_equipment_cost`),
        sb(env, `purchases?project_id=eq.${p.id}&select=total_amount`),
      ]);
      const spent =
        logs.reduce((s, l) => s + (Number(l.total_labor_cost) || 0) + (Number(l.total_equipment_cost) || 0), 0) +
        purch.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      return { ...p, total_budget: Number(p.contract_amount) || 0, total_spent: spent };
    })
  );

  // Overdue receivables (>90 days)
  const today = new Date().toISOString().slice(0, 10);
  const overdueReceivables = allProgressbills
    .map((pb) => {
      const received = receivedByBill[pb.id] || 0;
      const outstanding = Number(pb.bill_amount) - received;
      const days = Math.floor((new Date(today) - new Date(pb.bill_date)) / 86400000);
      return { ...pb, outstanding, days_overdue: days };
    })
    .filter((r) => r.outstanding > 0 && r.days_overdue > 90)
    .sort((a, b) => b.days_overdue - a.days_overdue)
    .slice(0, 5);

  // Monthly trend (last 6 months)
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const tYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const { start: ts, end: te } = monthRange(tYm);
    const [tPay, tLogs, tPurch] = await Promise.all([
      sb(env, `payments?is_received=eq.1&payment_date=gte.${ts}&payment_date=lt.${te}&select=amount`),
      sb(env, `dailylogs?log_date=gte.${ts}&log_date=lt.${te}&select=total_labor_cost,total_equipment_cost`),
      sb(env, `purchases?purchase_date=gte.${ts}&purchase_date=lt.${te}&select=total_amount`),
    ]);
    const rev = tPay.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const cost =
      tLogs.reduce((s, r) => s + (Number(r.total_labor_cost) || 0) + (Number(r.total_equipment_cost) || 0), 0) +
      tPurch.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    monthlyTrend.push({ month: tYm, revenue: rev, cost, profit: rev - cost });
  }

  return json(
    {
      monthlyRevenue,
      monthlyCosts,
      monthlyProfit: monthlyRevenue - monthlyCosts,
      totalReceivables,
      unpaidDefectsCount: defects.length,
      expectedSalary: employees.reduce((s, e) => s + (Number(e.base_salary) || 0), 0),
      uninvoicedCount: taxinvoices.length,
      projectUtilization,
      monthlyTrend,
      overdueReceivables,
    },
    200,
    cors
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────

async function handleProjects(request, url, env, cors) {
  // GET /api/projects
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const status = url.searchParams.get('status');
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
    const projects = await sb(env, `projects?select=*&order=created_at.desc${filter}`);

    // Attach total_cost and total_received per project
    const [allLogs, allPurchases, allPayments] = await Promise.all([
      sb(env, `dailylogs?select=project_id,total_labor_cost,total_equipment_cost`),
      sb(env, `purchases?select=project_id,total_amount`),
      sb(env, `payments?is_received=eq.1&select=project_id,amount`),
    ]);
    const laborCostByProject = allLogs.reduce((acc, r) => {
      acc[r.project_id] = (acc[r.project_id] || 0) + (Number(r.total_labor_cost) || 0) + (Number(r.total_equipment_cost) || 0);
      return acc;
    }, {});
    const purchaseCostByProject = sumBy(allPurchases, 'project_id', 'total_amount');
    const receivedByProject = sumBy(allPayments, 'project_id', 'amount');

    const result = projects.map((p) => ({
      ...p,
      total_cost: (laborCostByProject[p.id] || 0) + (purchaseCostByProject[p.id] || 0),
      total_received: receivedByProject[p.id] || 0,
    }));
    return json(result, 200, cors);
  }

  // POST /api/projects
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const body = await request.json();
    const { name, client, location, start_date, end_date, contract_amount, status, description } = body;
    if (!name || !client) return err('프로젝트명과 발주처는 필수입니다', 400, cors);
    const rows = await sb(env, 'projects?select=id', {
      method: 'POST',
      body: { name, client, location, start_date, end_date, contract_amount: contract_amount || 0, status: status || '진행중', description },
    });
    return json({ id: rows[0]?.id, message: '프로젝트가 생성되었습니다' }, 200, cors);
  }

  const params = match('GET', url, '/api/projects/:id') ||
    match('PUT', url, '/api/projects/:id') ||
    match('DELETE', url, '/api/projects/:id');

  if (params) {
    const { id } = params;
    if (request.method === 'GET') {
      const rows = await sb(env, `projects?id=eq.${id}&select=*`);
      if (!rows.length) return err('프로젝트를 찾을 수 없습니다', 404, cors);
      return json(rows[0], 200, cors);
    }
    if (request.method === 'PUT') {
      const body = await request.json();
      const { name, client, location, start_date, end_date, contract_amount, status, description } = body;
      await sb(env, `projects?id=eq.${id}`, {
        method: 'PATCH',
        body: { name, client, location, start_date, end_date, contract_amount, status, description },
        prefer: 'return=minimal',
      });
      return json({ message: '프로젝트가 수정되었습니다' }, 200, cors);
    }
    if (request.method === 'DELETE') {
      await sb(env, `projects?id=eq.${id}`, { method: 'DELETE' });
      return json({ message: '프로젝트가 삭제되었습니다' }, 200, cors);
    }
  }

  // Contracts sub-resource
  const contractsGet = match('GET', url, '/api/projects/:id/contracts');
  if (contractsGet) {
    const rows = await sb(env, `contracts?project_id=eq.${contractsGet.id}&select=*&order=created_at.desc`);
    return json(rows, 200, cors);
  }

  const contractsPost = match('POST', url, '/api/projects/:id/contracts');
  if (contractsPost) {
    const body = await request.json();
    const { contract_type, contract_date, amount, labor_budget, equipment_budget, material_budget, overhead_budget, notes } = body;
    const rows = await sb(env, 'contracts?select=id', {
      method: 'POST',
      body: {
        project_id: contractsPost.id, contract_type: contract_type || '본계약',
        contract_date, amount: amount || 0, labor_budget: labor_budget || 0,
        equipment_budget: equipment_budget || 0, material_budget: material_budget || 0,
        overhead_budget: overhead_budget || 0, notes,
      },
    });
    if (amount) {
      const allContracts = await sb(env, `contracts?project_id=eq.${contractsPost.id}&select=amount`);
      const total = allContracts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      await sb(env, `projects?id=eq.${contractsPost.id}`, { method: 'PATCH', body: { contract_amount: total }, prefer: 'return=minimal' });
    }
    return json({ id: rows[0]?.id, message: '계약이 추가되었습니다' }, 200, cors);
  }

  const contractDel = match('DELETE', url, '/api/projects/:projectId/contracts/:contractId');
  if (contractDel) {
    await sb(env, `contracts?id=eq.${contractDel.contractId}&project_id=eq.${contractDel.projectId}`, { method: 'DELETE' });
    return json({ message: '계약이 삭제되었습니다' }, 200, cors);
  }

  return null;
}

// ── Daily Logs ────────────────────────────────────────────────────────────────

async function handleDailylogs(request, url, env, cors) {
  // POST /api/dailylogs/parse  (must be before /:id)
  if (request.method === 'POST' && url.pathname === '/api/dailylogs/parse') {
    const body = await request.json();
    const { text, projectId } = body;
    if (!text) return err('파싱할 텍스트가 없습니다', 400, cors);

    const unitPrices = await sb(env, 'unitprices?select=item_name,unit_price');
    const unitPriceMap = unitPrices.reduce((acc, u) => { acc[u.item_name] = u.unit_price; return acc; }, {});

    const systemPrompt = `당신은 조경회사 현장 카카오톡 메시지를 파싱하는 전문가입니다.
주어진 카카오톡 대화 내용에서 현장 일지 정보를 추출하여 JSON 형식으로 반환하세요.

추출할 정보:
- 날짜 (YYYY-MM-DD 형식, 없으면 오늘 날짜)
- 날씨 (맑음/흐림/비/눈 중 하나)
- 작업 내용 설명
- 투입 인력 목록 (직종, 인원수)
- 투입 장비 목록 (장비종류, 대수)

단가표:
${JSON.stringify(unitPriceMap, null, 2)}

응답 형식 (JSON만 반환):
{
  "log_date": "YYYY-MM-DD",
  "weather": "맑음",
  "work_description": "작업 내용",
  "labor": [{"worker_type": "조경공", "count": 3, "unit_price": 200000}],
  "equipment": [{"equipment_type": "굴삭기03", "count": 1, "unit_price": 400000}]
}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: `다음 카카오톡 메시지를 파싱해주세요:\n\n${text}` }],
      }),
    });
    if (!aiRes.ok) return err('AI API 호출 실패', 500, cors);
    const aiData = await aiRes.json();
    const rawText = aiData.content[0].text;

    let parsed;
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : JSON.parse(rawText);
    } catch {
      return err('AI 응답을 파싱할 수 없습니다', 400, cors);
    }

    parsed.log_date = parsed.log_date || new Date().toISOString().slice(0, 10);
    if (parsed.labor) {
      parsed.labor = parsed.labor.map((l) => ({
        ...l,
        unit_price: l.unit_price || unitPriceMap[l.worker_type] || 0,
        total_price: (l.count || 1) * (l.unit_price || unitPriceMap[l.worker_type] || 0),
      }));
    }
    if (parsed.equipment) {
      parsed.equipment = parsed.equipment.map((e) => ({
        ...e,
        unit_price: e.unit_price || unitPriceMap[e.equipment_type] || 0,
        total_price: (e.count || 1) * (e.unit_price || unitPriceMap[e.equipment_type] || 0),
      }));
    }
    if (projectId) parsed.project_id = projectId;
    return json(parsed, 200, cors);
  }

  // GET /api/dailylogs
  if (request.method === 'GET' && url.pathname === '/api/dailylogs') {
    const projectId = url.searchParams.get('projectId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    let filter = '';
    if (projectId) filter += `&project_id=eq.${projectId}`;
    if (startDate) filter += `&log_date=gte.${startDate}`;
    if (endDate) filter += `&log_date=lte.${endDate}`;

    const logs = await sb(env, `dailylogs?select=*,projects(name)&order=log_date.desc${filter}`);

    const withDetails = await Promise.all(
      logs.map(async (log) => {
        const [labor, equipment] = await Promise.all([
          sb(env, `labor?dailylog_id=eq.${log.id}&select=*`),
          sb(env, `equipment?dailylog_id=eq.${log.id}&select=*`),
        ]);
        const { projects, ...rest } = log;
        return { ...rest, project_name: projects?.name, labor, equipment };
      })
    );
    return json(withDetails, 200, cors);
  }

  // POST /api/dailylogs
  if (request.method === 'POST' && url.pathname === '/api/dailylogs') {
    const body = await request.json();
    const { project_id, log_date, weather, work_description, notes, labor: laborItems, equipment: equipmentItems } = body;
    if (!project_id || !log_date) return err('프로젝트와 날짜는 필수입니다', 400, cors);

    let totalLaborCost = 0;
    let totalEquipmentCost = 0;
    (laborItems || []).forEach((l) => { totalLaborCost += (l.count * l.unit_price) || 0; });
    (equipmentItems || []).forEach((e) => { totalEquipmentCost += (e.count * e.unit_price) || 0; });

    const logRows = await sb(env, 'dailylogs?select=id', {
      method: 'POST',
      body: { project_id, log_date, weather: weather || '맑음', work_description, total_labor_cost: totalLaborCost, total_equipment_cost: totalEquipmentCost, notes },
    });
    const logId = logRows[0]?.id;

    const laborInserts = (laborItems || []).map((l) =>
      sb(env, 'labor', {
        method: 'POST',
        body: { dailylog_id: logId, worker_type: l.worker_type, count: l.count || 1, unit_price: l.unit_price || 0, total_price: (l.count || 1) * (l.unit_price || 0), notes: l.notes },
        prefer: 'return=minimal',
      })
    );
    const equipInserts = (equipmentItems || []).map((e) =>
      sb(env, 'equipment', {
        method: 'POST',
        body: { dailylog_id: logId, equipment_type: e.equipment_type, count: e.count || 1, unit_price: e.unit_price || 0, total_price: (e.count || 1) * (e.unit_price || 0), notes: e.notes },
        prefer: 'return=minimal',
      })
    );
    await Promise.all([...laborInserts, ...equipInserts]);
    return json({ id: logId, message: '일지가 생성되었습니다' }, 200, cors);
  }

  // GET /api/dailylogs/:id
  const getOne = match('GET', url, '/api/dailylogs/:id');
  if (getOne) {
    const rows = await sb(env, `dailylogs?id=eq.${getOne.id}&select=*,projects(name)`);
    if (!rows.length) return err('일지를 찾을 수 없습니다', 404, cors);
    const log = rows[0];
    const [labor, equipment] = await Promise.all([
      sb(env, `labor?dailylog_id=eq.${getOne.id}&select=*`),
      sb(env, `equipment?dailylog_id=eq.${getOne.id}&select=*`),
    ]);
    const { projects, ...rest } = log;
    return json({ ...rest, project_name: projects?.name, labor, equipment }, 200, cors);
  }

  // PUT /api/dailylogs/:id
  const putOne = match('PUT', url, '/api/dailylogs/:id');
  if (putOne) {
    const body = await request.json();
    const { project_id, log_date, weather, work_description, notes, labor: laborItems, equipment: equipmentItems } = body;
    let totalLaborCost = 0;
    let totalEquipmentCost = 0;
    (laborItems || []).forEach((l) => { totalLaborCost += (l.count * l.unit_price) || 0; });
    (equipmentItems || []).forEach((e) => { totalEquipmentCost += (e.count * e.unit_price) || 0; });

    await sb(env, `dailylogs?id=eq.${putOne.id}`, {
      method: 'PATCH',
      body: { project_id, log_date, weather, work_description, total_labor_cost: totalLaborCost, total_equipment_cost: totalEquipmentCost, notes },
      prefer: 'return=minimal',
    });

    await Promise.all([
      sb(env, `labor?dailylog_id=eq.${putOne.id}`, { method: 'DELETE' }),
      sb(env, `equipment?dailylog_id=eq.${putOne.id}`, { method: 'DELETE' }),
    ]);

    const laborInserts = (laborItems || []).map((l) =>
      sb(env, 'labor', { method: 'POST', body: { dailylog_id: putOne.id, worker_type: l.worker_type, count: l.count || 1, unit_price: l.unit_price || 0, total_price: (l.count || 1) * (l.unit_price || 0), notes: l.notes }, prefer: 'return=minimal' })
    );
    const equipInserts = (equipmentItems || []).map((e) =>
      sb(env, 'equipment', { method: 'POST', body: { dailylog_id: putOne.id, equipment_type: e.equipment_type, count: e.count || 1, unit_price: e.unit_price || 0, total_price: (e.count || 1) * (e.unit_price || 0), notes: e.notes }, prefer: 'return=minimal' })
    );
    await Promise.all([...laborInserts, ...equipInserts]);
    return json({ message: '일지가 수정되었습니다' }, 200, cors);
  }

  // DELETE /api/dailylogs/:id
  const delOne = match('DELETE', url, '/api/dailylogs/:id');
  if (delOne) {
    await sb(env, `dailylogs?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '일지가 삭제되었습니다' }, 200, cors);
  }

  return null;
}

// ── Employees ─────────────────────────────────────────────────────────────────

async function handleEmployees(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/employees') {
    const status = url.searchParams.get('status');
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : '';
    const rows = await sb(env, `employees?select=*&order=name${filter}`);
    return json(rows, 200, cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/employees') {
    const body = await request.json();
    const { name } = body;
    if (!name) return err('직원명은 필수입니다', 400, cors);
    const rows = await sb(env, 'employees?select=id', {
      method: 'POST',
      body: { ...body, base_salary: body.base_salary || 0, employment_type: body.employment_type || '정규직', status: body.status || '재직' },
    });
    return json({ id: rows[0]?.id, message: '직원이 등록되었습니다' }, 200, cors);
  }
  const getOne = match('GET', url, '/api/employees/:id');
  if (getOne) {
    const rows = await sb(env, `employees?id=eq.${getOne.id}&select=*`);
    if (!rows.length) return err('직원을 찾을 수 없습니다', 404, cors);
    return json(rows[0], 200, cors);
  }
  const putOne = match('PUT', url, '/api/employees/:id');
  if (putOne) {
    const body = await request.json();
    await sb(env, `employees?id=eq.${putOne.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    return json({ message: '직원 정보가 수정되었습니다' }, 200, cors);
  }
  const delOne = match('DELETE', url, '/api/employees/:id');
  if (delOne) {
    await sb(env, `employees?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '직원이 삭제되었습니다' }, 200, cors);
  }
  return null;
}

// ── Attendance ────────────────────────────────────────────────────────────────

async function handleAttendance(request, url, env, cors) {
  // GET /api/attendance/summary/monthly  (before /:id)
  if (request.method === 'GET' && url.pathname === '/api/attendance/summary/monthly') {
    const month = url.searchParams.get('month');
    if (!month) return err('월을 지정해주세요', 400, cors);
    const [employees, attendance] = await Promise.all([
      sb(env, `employees?status=eq.재직&select=id,name,position,base_salary`),
      sb(env, `attendance?work_date=gte.${month}-01&work_date=lt.${monthRange(month).end}&select=employee_id,attendance_type,overtime_hours`),
    ]);
    const result = employees.map((e) => {
      const records = attendance.filter((a) => a.employee_id === e.id);
      return {
        employee_id: e.id,
        employee_name: e.name,
        position: e.position,
        base_salary: e.base_salary,
        normal_days: records.filter((a) => a.attendance_type === '정상').length,
        half_days: records.filter((a) => a.attendance_type === '반차').length,
        absent_days: records.filter((a) => a.attendance_type === '결근').length,
        vacation_days: records.filter((a) => a.attendance_type === '휴가').length,
        total_overtime: records.reduce((s, a) => s + (Number(a.overtime_hours) || 0), 0),
        total_records: records.length,
      };
    });
    return json(result, 200, cors);
  }

  if (request.method === 'GET' && url.pathname === '/api/attendance') {
    const employeeId = url.searchParams.get('employeeId');
    const projectId = url.searchParams.get('projectId');
    const month = url.searchParams.get('month');
    let filter = '';
    if (employeeId) filter += `&employee_id=eq.${employeeId}`;
    if (projectId) filter += `&project_id=eq.${projectId}`;
    if (month) filter += `&work_date=gte.${month}-01&work_date=lt.${monthRange(month).end}`;
    const rows = await sb(env, `attendance?select=*,employees(name,position),projects(name)&order=work_date.desc${filter}`);
    const mapped = rows.map(({ employees: e, projects: p, ...rest }) => ({
      ...rest, employee_name: e?.name, position: e?.position, project_name: p?.name,
    }));
    return json(mapped, 200, cors);
  }

  if (request.method === 'POST' && url.pathname === '/api/attendance') {
    const body = await request.json();
    if (!body.employee_id || !body.work_date) return err('직원과 날짜는 필수입니다', 400, cors);
    const rows = await sb(env, 'attendance?select=id', {
      method: 'POST',
      body: { ...body, work_hours: body.work_hours || 8, overtime_hours: body.overtime_hours || 0, attendance_type: body.attendance_type || '정상' },
    });
    return json({ id: rows[0]?.id, message: '출결이 등록되었습니다' }, 200, cors);
  }

  const putOne = match('PUT', url, '/api/attendance/:id');
  if (putOne) {
    const body = await request.json();
    await sb(env, `attendance?id=eq.${putOne.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    return json({ message: '출결이 수정되었습니다' }, 200, cors);
  }

  const delOne = match('DELETE', url, '/api/attendance/:id');
  if (delOne) {
    await sb(env, `attendance?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '출결이 삭제되었습니다' }, 200, cors);
  }
  return null;
}

// ── Salary ────────────────────────────────────────────────────────────────────

async function handleSalary(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/salary') {
    const employeeId = url.searchParams.get('employeeId');
    const yearMonth = url.searchParams.get('yearMonth');
    let filter = '';
    if (employeeId) filter += `&employee_id=eq.${employeeId}`;
    if (yearMonth) filter += `&year_month=eq.${yearMonth}`;
    const rows = await sb(env, `salary?select=*,employees(name,position,department)&order=year_month.desc${filter}`);
    const mapped = rows.map(({ employees: e, ...rest }) => ({
      ...rest, employee_name: e?.name, position: e?.position, department: e?.department,
    }));
    return json(mapped, 200, cors);
  }

  if (request.method === 'GET') {
    const summaryMatch = match('GET', url, '/api/salary/summary/:yearMonth');
    if (summaryMatch) {
      const rows = await sb(env, `salary?year_month=eq.${summaryMatch.yearMonth}&select=total_gross,total_deductions,net_salary,national_pension,health_insurance,employment_insurance,income_tax,local_income_tax`);
      const s = rows.reduce(
        (acc, r) => {
          acc.employee_count++;
          acc.total_gross += Number(r.total_gross) || 0;
          acc.total_deductions += Number(r.total_deductions) || 0;
          acc.total_net += Number(r.net_salary) || 0;
          acc.total_pension += Number(r.national_pension) || 0;
          acc.total_health += Number(r.health_insurance) || 0;
          acc.total_employment += Number(r.employment_insurance) || 0;
          acc.total_tax += (Number(r.income_tax) || 0) + (Number(r.local_income_tax) || 0);
          return acc;
        },
        { employee_count: 0, total_gross: 0, total_deductions: 0, total_net: 0, total_pension: 0, total_health: 0, total_employment: 0, total_tax: 0 }
      );
      return json(s, 200, cors);
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/salary/calculate') {
    const body = await request.json();
    const { yearMonth } = body;
    if (!yearMonth) return err('연월은 필수입니다 (YYYY-MM)', 400, cors);

    const { start, end } = monthRange(yearMonth);
    const [employees, attendance] = await Promise.all([
      sb(env, `employees?status=eq.재직&select=*`),
      sb(env, `attendance?work_date=gte.${start}&work_date=lt.${end}&select=employee_id,attendance_type,overtime_hours`),
    ]);

    const calcInsurance = (salary) => {
      const nationalPension = Math.round(salary * 0.045);
      const healthInsurance = Math.round(salary * 0.03545);
      const longTermCare = Math.round(healthInsurance * 0.1281);
      const employmentInsurance = Math.round(salary * 0.009);
      const incomeTax = Math.round(salary * 0.033);
      const localIncomeTax = Math.round(incomeTax * 0.1);
      return { nationalPension, healthInsurance: healthInsurance + longTermCare, employmentInsurance, incomeTax, localIncomeTax };
    };

    const results = [];
    for (const emp of employees) {
      const records = attendance.filter((a) => a.employee_id === emp.id);
      const normalDays = records.filter((a) => a.attendance_type === '정상').length;
      const halfDays = records.filter((a) => a.attendance_type === '반차').length;
      const totalOvertime = records.reduce((s, a) => s + (Number(a.overtime_hours) || 0), 0);
      const workDays = normalDays + halfDays * 0.5;
      const baseDailyRate = (emp.base_salary || 0) / 22;
      const basePay = Math.round(baseDailyRate * workDays);
      const overtimePay = Math.round((baseDailyRate / 8) * 1.5 * totalOvertime);
      const grossSalary = basePay + overtimePay;
      const ins = calcInsurance(grossSalary);
      const totalDeductions = ins.nationalPension + ins.healthInsurance + ins.employmentInsurance + ins.incomeTax + ins.localIncomeTax;
      const netSalary = grossSalary - totalDeductions;

      const salaryBody = {
        employee_id: emp.id, year_month: yearMonth, base_salary: basePay, overtime_pay: overtimePay,
        total_gross: grossSalary, national_pension: ins.nationalPension, health_insurance: ins.healthInsurance,
        employment_insurance: ins.employmentInsurance, income_tax: ins.incomeTax, local_income_tax: ins.localIncomeTax,
        total_deductions: totalDeductions, net_salary: netSalary, work_days: workDays, overtime_total: totalOvertime,
      };

      // Upsert: check existing
      const existing = await sb(env, `salary?employee_id=eq.${emp.id}&year_month=eq.${yearMonth}&select=id`);
      let resultId;
      if (existing.length > 0) {
        await sb(env, `salary?id=eq.${existing[0].id}`, { method: 'PATCH', body: salaryBody, prefer: 'return=minimal' });
        resultId = existing[0].id;
        results.push({ employee_id: emp.id, name: emp.name, id: resultId, action: 'updated' });
      } else {
        const inserted = await sb(env, 'salary?select=id', { method: 'POST', body: salaryBody });
        resultId = inserted[0]?.id;
        results.push({ employee_id: emp.id, name: emp.name, id: resultId, action: 'created' });
      }
    }
    return json({ message: '급여가 계산되었습니다', results }, 200, cors);
  }

  const putOne = match('PUT', url, '/api/salary/:id');
  if (putOne) {
    const body = await request.json();
    await sb(env, `salary?id=eq.${putOne.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    return json({ message: '급여가 수정되었습니다' }, 200, cors);
  }

  return null;
}

// ── Payments & Progress Bills ─────────────────────────────────────────────────

async function handlePayments(request, url, env, cors) {
  // Progress Bills
  if (request.method === 'GET' && url.pathname === '/api/progressbills') {
    const projectId = url.searchParams.get('projectId');
    const filter = projectId ? `&project_id=eq.${projectId}` : '';
    const rows = await sb(env, `progressbills?select=*,projects(name)&order=bill_date.desc${filter}`);
    const allPay = await sb(env, `payments?is_received=eq.1&select=progressbill_id,amount`);
    const receivedByBill = allPay.reduce((acc, p) => {
      if (p.progressbill_id) acc[p.progressbill_id] = (acc[p.progressbill_id] || 0) + Number(p.amount);
      return acc;
    }, {});
    const mapped = rows.map(({ projects, ...r }) => ({
      ...r, project_name: projects?.name, received_amount: receivedByBill[r.id] || 0,
    }));
    return json(mapped, 200, cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/progressbills') {
    const body = await request.json();
    if (!body.project_id || !body.bill_date) return err('프로젝트와 청구일은 필수입니다', 400, cors);
    const billAmount = body.bill_amount || 0;
    const supplyAmt = body.supply_amount || Math.round(billAmount / 1.1);
    const taxAmt = body.tax_amount || billAmount - supplyAmt;
    const rows = await sb(env, 'progressbills?select=id', {
      method: 'POST',
      body: { ...body, bill_amount: billAmount, supply_amount: supplyAmt, tax_amount: taxAmt, progress_rate: body.progress_rate || 0 },
    });
    return json({ id: rows[0]?.id, message: '기성청구서가 등록되었습니다' }, 200, cors);
  }
  const pbPut = match('PUT', url, '/api/progressbills/:id');
  if (pbPut) {
    await sb(env, `progressbills?id=eq.${pbPut.id}`, { method: 'PATCH', body: await request.json(), prefer: 'return=minimal' });
    return json({ message: '기성청구서가 수정되었습니다' }, 200, cors);
  }
  const pbDel = match('DELETE', url, '/api/progressbills/:id');
  if (pbDel) {
    await sb(env, `progressbills?id=eq.${pbDel.id}`, { method: 'DELETE' });
    return json({ message: '기성청구서가 삭제되었습니다' }, 200, cors);
  }

  // Receivables aging
  if (request.method === 'GET' && url.pathname === '/api/payments/receivables') {
    const [pbs, allPay, projects] = await Promise.all([
      sb(env, `progressbills?select=*`),
      sb(env, `payments?is_received=eq.1&select=progressbill_id,amount`),
      sb(env, `projects?select=id,name,client`),
    ]);
    const receivedByBill = allPay.reduce((acc, p) => {
      if (p.progressbill_id) acc[p.progressbill_id] = (acc[p.progressbill_id] || 0) + Number(p.amount);
      return acc;
    }, {});
    const projectMap = projects.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
    const today = new Date();
    const items = pbs
      .map((pb) => {
        const received = receivedByBill[pb.id] || 0;
        const outstanding = Number(pb.bill_amount) - received;
        const days = Math.floor((today - new Date(pb.bill_date)) / 86400000);
        const proj = projectMap[pb.project_id] || {};
        return { project_id: pb.project_id, project_name: proj.name, client: proj.client, bill_id: pb.id, bill_date: pb.bill_date, bill_number: pb.bill_number, bill_amount: pb.bill_amount, received_amount: received, outstanding, days_outstanding: days };
      })
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.days_outstanding - a.days_outstanding);

    return json({
      within30: items.filter((r) => r.days_outstanding <= 30),
      days31to60: items.filter((r) => r.days_outstanding > 30 && r.days_outstanding <= 60),
      days61to90: items.filter((r) => r.days_outstanding > 60 && r.days_outstanding <= 90),
      over90: items.filter((r) => r.days_outstanding > 90),
      total: items.reduce((s, r) => s + r.outstanding, 0),
      items,
    }, 200, cors);
  }

  // Payments
  if (request.method === 'GET' && url.pathname === '/api/payments') {
    const projectId = url.searchParams.get('projectId');
    const filter = projectId ? `&project_id=eq.${projectId}` : '';
    const rows = await sb(env, `payments?select=*,projects(name),progressbills(bill_number,bill_date)&order=created_at.desc${filter}`);
    const mapped = rows.map(({ projects: p, progressbills: pb, ...r }) => ({
      ...r, project_name: p?.name, bill_number: pb?.bill_number, bill_date: pb?.bill_date,
    }));
    return json(mapped, 200, cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/payments') {
    const body = await request.json();
    if (!body.project_id) return err('프로젝트는 필수입니다', 400, cors);
    const rows = await sb(env, 'payments?select=id', {
      method: 'POST',
      body: { ...body, amount: body.amount || 0, payment_method: body.payment_method || '계좌이체', is_received: body.is_received ? 1 : 0 },
    });
    return json({ id: rows[0]?.id, message: '수금이 등록되었습니다' }, 200, cors);
  }
  const payPut = match('PUT', url, '/api/payments/:id');
  if (payPut) {
    const body = await request.json();
    await sb(env, `payments?id=eq.${payPut.id}`, {
      method: 'PATCH',
      body: { ...body, is_received: body.is_received ? 1 : 0 },
      prefer: 'return=minimal',
    });
    return json({ message: '수금이 수정되었습니다' }, 200, cors);
  }
  const payDel = match('DELETE', url, '/api/payments/:id');
  if (payDel) {
    await sb(env, `payments?id=eq.${payDel.id}`, { method: 'DELETE' });
    return json({ message: '수금이 삭제되었습니다' }, 200, cors);
  }

  return null;
}

// ── Tax Invoices ──────────────────────────────────────────────────────────────

async function handleTaxinvoices(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/taxinvoices') {
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const month = url.searchParams.get('month');
    let filter = '';
    if (type) filter += `&invoice_type=eq.${encodeURIComponent(type)}`;
    if (status) filter += `&status=eq.${encodeURIComponent(status)}`;
    if (month) filter += `&issue_date=gte.${month}-01&issue_date=lt.${monthRange(month).end}`;
    const rows = await sb(env, `taxinvoices?select=*,projects(name),vendors(name)&order=created_at.desc${filter}`);
    const mapped = rows.map(({ projects: p, vendors: v, ...r }) => ({
      ...r, project_name: p?.name, vendor_name: v?.name,
    }));
    return json(mapped, 200, cors);
  }

  if (request.method === 'GET' && url.pathname === '/api/taxinvoices/summary') {
    const year = url.searchParams.get('year') || String(new Date().getFullYear());
    const rows = await sb(env, `taxinvoices?issue_date=gte.${year}-01-01&issue_date=lt.${Number(year) + 1}-01-01&select=issue_date,invoice_type,supply_amount,tax_amount,total_amount`);
    const grouped = {};
    rows.forEach((r) => {
      const month = r.issue_date?.slice(0, 7);
      const k = `${month}__${r.invoice_type}`;
      if (!grouped[k]) grouped[k] = { month, invoice_type: r.invoice_type, count: 0, total_supply: 0, total_tax: 0, total_amount: 0 };
      grouped[k].count++;
      grouped[k].total_supply += Number(r.supply_amount) || 0;
      grouped[k].total_tax += Number(r.tax_amount) || 0;
      grouped[k].total_amount += Number(r.total_amount) || 0;
    });
    return json(Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month)), 200, cors);
  }

  if (request.method === 'POST' && url.pathname === '/api/taxinvoices') {
    const body = await request.json();
    if (!body.invoice_type) return err('계산서 유형은 필수입니다', 400, cors);
    const supplyAmt = body.supply_amount || 0;
    const taxAmt = body.tax_amount || Math.round(supplyAmt * 0.1);
    const totalAmt = body.total_amount || (supplyAmt + taxAmt);
    const rows = await sb(env, 'taxinvoices?select=id', {
      method: 'POST',
      body: { ...body, supply_amount: supplyAmt, tax_amount: taxAmt, total_amount: totalAmt, status: body.status || '미발행' },
    });
    return json({ id: rows[0]?.id, message: '세금계산서가 등록되었습니다' }, 200, cors);
  }

  const getOne = match('GET', url, '/api/taxinvoices/:id');
  if (getOne) {
    const rows = await sb(env, `taxinvoices?id=eq.${getOne.id}&select=*,projects(name),vendors(name)`);
    if (!rows.length) return err('세금계산서를 찾을 수 없습니다', 404, cors);
    const { projects: p, vendors: v, ...r } = rows[0];
    return json({ ...r, project_name: p?.name, vendor_name: v?.name }, 200, cors);
  }
  const putOne = match('PUT', url, '/api/taxinvoices/:id');
  if (putOne) {
    await sb(env, `taxinvoices?id=eq.${putOne.id}`, { method: 'PATCH', body: await request.json(), prefer: 'return=minimal' });
    return json({ message: '세금계산서가 수정되었습니다' }, 200, cors);
  }
  const delOne = match('DELETE', url, '/api/taxinvoices/:id');
  if (delOne) {
    await sb(env, `taxinvoices?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '세금계산서가 삭제되었습니다' }, 200, cors);
  }
  return null;
}

// ── Purchases ─────────────────────────────────────────────────────────────────

async function handlePurchases(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/purchases') {
    const projectId = url.searchParams.get('projectId');
    const vendorId = url.searchParams.get('vendorId');
    const month = url.searchParams.get('month');
    let filter = '';
    if (projectId) filter += `&project_id=eq.${projectId}`;
    if (vendorId) filter += `&vendor_id=eq.${vendorId}`;
    if (month) filter += `&purchase_date=gte.${month}-01&purchase_date=lt.${monthRange(month).end}`;
    const rows = await sb(env, `purchases?select=*,projects(name),vendors(name)&order=purchase_date.desc${filter}`);
    const mapped = rows.map(({ projects: p, vendors: v, ...r }) => ({ ...r, project_name: p?.name, vendor_name: v?.name }));
    return json(mapped, 200, cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/purchases') {
    const body = await request.json();
    if (!body.purchase_date || !body.item_name) return err('날짜와 품목명은 필수입니다', 400, cors);
    const totalAmt = body.total_amount || (body.unit_price || 0) * (body.quantity || 1);
    const supplyAmt = body.supply_amount || Math.round(totalAmt / 1.1);
    const taxAmt = body.tax_amount || totalAmt - supplyAmt;
    const rows = await sb(env, 'purchases?select=id', {
      method: 'POST',
      body: { ...body, quantity: body.quantity || 1, unit: body.unit || '식', unit_price: body.unit_price || 0, total_amount: totalAmt, tax_amount: taxAmt, supply_amount: supplyAmt, payment_status: body.payment_status || '미결제' },
    });
    return json({ id: rows[0]?.id, message: '매입이 등록되었습니다' }, 200, cors);
  }
  const getOne = match('GET', url, '/api/purchases/:id');
  if (getOne) {
    const rows = await sb(env, `purchases?id=eq.${getOne.id}&select=*,projects(name),vendors(name)`);
    if (!rows.length) return err('매입 내역을 찾을 수 없습니다', 404, cors);
    const { projects: p, vendors: v, ...r } = rows[0];
    return json({ ...r, project_name: p?.name, vendor_name: v?.name }, 200, cors);
  }
  const putOne = match('PUT', url, '/api/purchases/:id');
  if (putOne) {
    await sb(env, `purchases?id=eq.${putOne.id}`, { method: 'PATCH', body: await request.json(), prefer: 'return=minimal' });
    return json({ message: '매입이 수정되었습니다' }, 200, cors);
  }
  const delOne = match('DELETE', url, '/api/purchases/:id');
  if (delOne) {
    await sb(env, `purchases?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '매입이 삭제되었습니다' }, 200, cors);
  }
  return null;
}

// ── Defects ───────────────────────────────────────────────────────────────────

async function handleDefects(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/defects/stats') {
    const projectId = url.searchParams.get('projectId');
    const filter = projectId ? `&project_id=eq.${projectId}` : '';
    const [defects, costs, projects] = await Promise.all([
      sb(env, `defects?select=defect_type,status,project_id${filter}`),
      sb(env, `defectcosts?select=defect_id,amount`),
      sb(env, `projects?select=id,name`),
    ]);
    const projectMap = projects.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
    const costByDefect = costs.reduce((acc, c) => { acc[c.defect_id] = (acc[c.defect_id] || 0) + Number(c.amount); return acc; }, {});

    const today = new Date().toISOString().slice(0, 10);
    const overdueDefects = defects.filter((d) => d.status !== '완료' && d.due_date && d.due_date < today);

    const byType = Object.entries(
      defects.reduce((acc, d) => { if (!acc[d.defect_type]) acc[d.defect_type] = { defect_type: d.defect_type, count: 0, resolved: 0, pending: 0 }; acc[d.defect_type].count++; d.status === '완료' ? acc[d.defect_type].resolved++ : acc[d.defect_type].pending++; return acc; }, {})
    ).map(([, v]) => v);

    const byStatus = Object.entries(
      defects.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {})
    ).map(([status, count]) => ({ status, count }));

    const byProject = Object.entries(
      defects.reduce((acc, d) => {
        if (!acc[d.project_id]) acc[d.project_id] = { id: d.project_id, project_name: projectMap[d.project_id]?.name, total_defects: 0, resolved: 0, pending: 0, total_cost: 0 };
        acc[d.project_id].total_defects++;
        d.status === '완료' ? acc[d.project_id].resolved++ : acc[d.project_id].pending++;
        return acc;
      }, {})
    ).map(([, v]) => v).sort((a, b) => b.total_defects - a.total_defects).slice(0, 10);

    return json({ byType, byStatus, byProject, overdueDefects }, 200, cors);
  }

  if (request.method === 'GET' && url.pathname === '/api/defects') {
    const projectId = url.searchParams.get('projectId');
    const status = url.searchParams.get('status');
    const defectType = url.searchParams.get('defect_type');
    let filter = '';
    if (projectId) filter += `&project_id=eq.${projectId}`;
    if (status) filter += `&status=eq.${encodeURIComponent(status)}`;
    if (defectType) filter += `&defect_type=eq.${encodeURIComponent(defectType)}`;
    const rows = await sb(env, `defects?select=*,projects(name)&order=reported_date.desc${filter}`);
    const costs = await sb(env, `defectcosts?select=defect_id,amount`);
    const costByDefect = costs.reduce((acc, c) => { acc[c.defect_id] = (acc[c.defect_id] || 0) + Number(c.amount); return acc; }, {});
    const mapped = rows.map(({ projects: p, ...r }) => ({ ...r, project_name: p?.name, total_cost: costByDefect[r.id] || 0 }));
    return json(mapped, 200, cors);
  }

  if (request.method === 'POST' && url.pathname === '/api/defects') {
    const body = await request.json();
    if (!body.project_id || !body.title || !body.reported_date) return err('프로젝트, 제목, 접수일은 필수입니다', 400, cors);
    const rows = await sb(env, 'defects?select=id', {
      method: 'POST',
      body: { ...body, defect_type: body.defect_type || '식재', status: body.status || '접수', priority: body.priority || '보통' },
    });
    return json({ id: rows[0]?.id, message: '하자가 접수되었습니다' }, 200, cors);
  }

  const getOne = match('GET', url, '/api/defects/:id');
  if (getOne) {
    const rows = await sb(env, `defects?id=eq.${getOne.id}&select=*,projects(name)`);
    if (!rows.length) return err('하자를 찾을 수 없습니다', 404, cors);
    const costs = await sb(env, `defectcosts?defect_id=eq.${getOne.id}&select=*`);
    const { projects: p, ...r } = rows[0];
    return json({ ...r, project_name: p?.name, costs }, 200, cors);
  }
  const putOne = match('PUT', url, '/api/defects/:id');
  if (putOne) {
    await sb(env, `defects?id=eq.${putOne.id}`, { method: 'PATCH', body: await request.json(), prefer: 'return=minimal' });
    return json({ message: '하자가 수정되었습니다' }, 200, cors);
  }
  const delOne = match('DELETE', url, '/api/defects/:id');
  if (delOne) {
    await sb(env, `defects?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '하자가 삭제되었습니다' }, 200, cors);
  }
  const costPost = match('POST', url, '/api/defects/:id/costs');
  if (costPost) {
    const body = await request.json();
    const rows = await sb(env, 'defectcosts?select=id', {
      method: 'POST',
      body: { defect_id: costPost.id, cost_date: body.cost_date, cost_type: body.cost_type || '자재', amount: body.amount || 0, description: body.description, vendor_id: body.vendor_id },
    });
    return json({ id: rows[0]?.id, message: '비용이 등록되었습니다' }, 200, cors);
  }
  const costDel = match('DELETE', url, '/api/defects/:id/costs/:costId');
  if (costDel) {
    await sb(env, `defectcosts?id=eq.${costDel.costId}&defect_id=eq.${costDel.id}`, { method: 'DELETE' });
    return json({ message: '비용이 삭제되었습니다' }, 200, cors);
  }
  return null;
}

// ── Vendors ───────────────────────────────────────────────────────────────────

async function handleVendors(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/vendors') {
    const vendorType = url.searchParams.get('vendor_type');
    const filter = vendorType ? `&vendor_type=eq.${encodeURIComponent(vendorType)}` : '';
    const rows = await sb(env, `vendors?select=*&order=name${filter}`);
    return json(rows, 200, cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/vendors') {
    const body = await request.json();
    if (!body.name) return err('거래처명은 필수입니다', 400, cors);
    const rows = await sb(env, 'vendors?select=id', {
      method: 'POST',
      body: { ...body, vendor_type: body.vendor_type || '자재' },
    });
    return json({ id: rows[0]?.id, message: '거래처가 등록되었습니다' }, 200, cors);
  }
  const getOne = match('GET', url, '/api/vendors/:id');
  if (getOne) {
    const rows = await sb(env, `vendors?id=eq.${getOne.id}&select=*`);
    if (!rows.length) return err('거래처를 찾을 수 없습니다', 404, cors);
    return json(rows[0], 200, cors);
  }
  const putOne = match('PUT', url, '/api/vendors/:id');
  if (putOne) {
    await sb(env, `vendors?id=eq.${putOne.id}`, { method: 'PATCH', body: await request.json(), prefer: 'return=minimal' });
    return json({ message: '거래처가 수정되었습니다' }, 200, cors);
  }
  const delOne = match('DELETE', url, '/api/vendors/:id');
  if (delOne) {
    await sb(env, `vendors?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ message: '거래처가 삭제되었습니다' }, 200, cors);
  }
  return null;
}

// ── Unit Prices ───────────────────────────────────────────────────────────────

async function handleUnitprices(request, url, env, cors) {
  if (request.method === 'GET' && url.pathname === '/api/unitprices') {
    const category = url.searchParams.get('category');
    const filter = category ? `&category=eq.${encodeURIComponent(category)}` : '';
    const rows = await sb(env, `unitprices?select=*&order=category,id${filter}`);
    return json(rows, 200, cors);
  }
  if (request.method === 'POST' && url.pathname === '/api/unitprices') {
    const body = await request.json();
    const rows = await sb(env, 'unitprices?select=id', { method: 'POST', body });
    return json({ id: rows[0]?.id, message: '단가가 등록되었습니다' }, 200, cors);
  }
  const putOne = match('PUT', url, '/api/unitprices/:id');
  if (putOne) {
    await sb(env, `unitprices?id=eq.${putOne.id}`, { method: 'PATCH', body: await request.json(), prefer: 'return=minimal' });
    return json({ success: true }, 200, cors);
  }
  const delOne = match('DELETE', url, '/api/unitprices/:id');
  if (delOne) {
    await sb(env, `unitprices?id=eq.${delOne.id}`, { method: 'DELETE' });
    return json({ success: true }, 200, cors);
  }
  return null;
}

// ── Share / KakaoTalk parse & save ────────────────────────────────────────────

async function handleShare(request, url, env, cors) {
  if (request.method === 'POST' && url.pathname === '/api/share/kakao') {
    const body = await request.json();
    const { text, project_id } = body;
    if (!text) return err('텍스트가 필요합니다', 400, cors);

    const unitPrices = await sb(env, 'unitprices?select=item_name,unit_price');
    const unitPriceMap = unitPrices.reduce((acc, u) => { acc[u.item_name] = u.unit_price; return acc; }, {});

    const systemPrompt = `당신은 조경회사 현장 카카오톡 메시지를 파싱하는 전문가입니다.
주어진 카카오톡 대화 내용에서 현장 일지 정보를 추출하여 JSON 형식으로 반환하세요.

추출할 정보:
- 날짜 (YYYY-MM-DD 형식, 없으면 오늘 날짜)
- 날씨 (맑음/흐림/비/눈 중 하나)
- 작업 내용 설명
- 투입 인력 목록 (직종, 인원수)
- 투입 장비 목록 (장비종류, 대수)

단가표:
${JSON.stringify(unitPriceMap, null, 2)}

응답 형식 (JSON만 반환):
{
  "log_date": "YYYY-MM-DD",
  "weather": "맑음",
  "work_description": "작업 내용",
  "labor": [{"worker_type": "조경공", "count": 3, "unit_price": 200000}],
  "equipment": [{"equipment_type": "굴삭기03", "count": 1, "unit_price": 400000}]
}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: `다음 카카오톡 메시지를 파싱해주세요:\n\n${text}` }],
      }),
    });
    if (!aiRes.ok) return err('AI API 호출 실패', 500, cors);
    const aiData = await aiRes.json();
    const rawText = aiData.content[0].text;

    let parsed;
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : JSON.parse(rawText);
    } catch {
      return err('AI 응답 파싱 실패', 400, cors);
    }

    parsed.log_date = parsed.log_date || new Date().toISOString().slice(0, 10);
    parsed.weather = parsed.weather || '맑음';
    if (parsed.labor) {
      parsed.labor = parsed.labor.map((l) => ({
        ...l,
        unit_price: l.unit_price || unitPriceMap[l.worker_type] || 0,
        total_price: (l.count || 1) * (l.unit_price || unitPriceMap[l.worker_type] || 0),
      }));
    }
    if (parsed.equipment) {
      parsed.equipment = parsed.equipment.map((e) => ({
        ...e,
        unit_price: e.unit_price || unitPriceMap[e.equipment_type] || 0,
        total_price: (e.count || 1) * (e.unit_price || unitPriceMap[e.equipment_type] || 0),
      }));
    }

    const totalLaborCost = (parsed.labor || []).reduce((s, l) => s + (l.total_price || 0), 0);
    const totalEquipmentCost = (parsed.equipment || []).reduce((s, e) => s + (e.total_price || 0), 0);
    const pid = project_id || null;

    // Save log
    const logRows = await sb(env, 'dailylogs?select=id', {
      method: 'POST',
      body: { project_id: pid, log_date: parsed.log_date, weather: parsed.weather, work_description: parsed.work_description || '', total_labor_cost: totalLaborCost, total_equipment_cost: totalEquipmentCost, notes: '카카오톡 공유 수신' },
    });
    const logId = logRows[0]?.id;

    await Promise.all([
      ...(parsed.labor || []).map((l) =>
        sb(env, 'labor', { method: 'POST', body: { dailylog_id: logId, worker_type: l.worker_type, count: l.count || 1, unit_price: l.unit_price || 0, total_price: l.total_price || 0 }, prefer: 'return=minimal' })
      ),
      ...(parsed.equipment || []).map((e) =>
        sb(env, 'equipment', { method: 'POST', body: { dailylog_id: logId, equipment_type: e.equipment_type, count: e.count || 1, unit_price: e.unit_price || 0, total_price: e.total_price || 0 }, prefer: 'return=minimal' })
      ),
    ]);

    return json({ success: true, id: logId, ...parsed, total_labor_cost: totalLaborCost, total_equipment_cost: totalEquipmentCost }, 200, cors);
  }

  const shareGet = match('GET', url, '/api/share/:token');
  if (shareGet) {
    const rows = await sb(env, `sharelinks?token=eq.${shareGet.token}&select=*`);
    if (!rows.length) return err('공유 링크를 찾을 수 없습니다', 404, cors);
    return json(rows[0], 200, cors);
  }
  return null;
}

// =============================================================================
// MAIN FETCH HANDLER
// =============================================================================

export default {
  async fetch(request, env) {
    const cors = getCorsHeaders(request, env);

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // Only handle /api/* routes
    if (!url.pathname.startsWith('/api/')) {
      return json({ error: 'Not Found' }, 404, cors);
    }

    try {
      let res = null;

      if (url.pathname === '/api/dashboard') {
        res = await handleDashboard(env, cors);
      } else if (url.pathname.startsWith('/api/projects')) {
        res = await handleProjects(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/dailylogs')) {
        res = await handleDailylogs(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/employees')) {
        res = await handleEmployees(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/attendance')) {
        res = await handleAttendance(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/salary')) {
        res = await handleSalary(request, url, env, cors);
      } else if (
        url.pathname.startsWith('/api/progressbills') ||
        url.pathname.startsWith('/api/payments')
      ) {
        res = await handlePayments(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/taxinvoices')) {
        res = await handleTaxinvoices(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/purchases')) {
        res = await handlePurchases(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/defects')) {
        res = await handleDefects(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/vendors')) {
        res = await handleVendors(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/unitprices')) {
        res = await handleUnitprices(request, url, env, cors);
      } else if (url.pathname.startsWith('/api/share')) {
        res = await handleShare(request, url, env, cors);
      }

      if (res) return res;
      return json({ error: 'Not Found' }, 404, cors);
    } catch (e) {
      console.error(e);
      return err(e.message || 'Internal Server Error', 500, cors);
    }
  },
};
