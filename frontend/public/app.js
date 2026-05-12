const $ = (sel) => document.querySelector(sel);
const fmt = (iso) => iso ? new Date(iso).toLocaleString('zh-CN', { hour12:false }) : '—';
const esc = (s='') => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function api(path) {
  const res = await fetch(path);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
  return json;
}

function scheduleText(schedule) {
  if (!schedule) return '—';
  if (schedule.kind === 'cron') return `${schedule.expr} ${schedule.tz ? `(${schedule.tz})` : ''}`;
  if (schedule.kind === 'every') return `每 ${schedule.intervalMs || schedule.ms || '?'}ms`;
  if (schedule.kind === 'at') return `一次性 ${schedule.at || schedule.atMs || ''}`;
  return JSON.stringify(schedule);
}

async function loadJobs() {
  $('#jobsStatus').textContent = 'loading';
  try {
    const { jobs } = await api('/api/jobs');
    $('#jobsStatus').textContent = `${jobs.length} 个任务`;
    $('#jobsTable tbody').innerHTML = jobs.map(job => {
      const status = job.state.lastRunStatus || '—';
      const cls = status === 'ok' ? 'ok' : status === 'error' ? 'error' : '';
      return `<tr data-id="${esc(job.id)}">
        <td><strong>${esc(job.name)}</strong><div class="meta">${esc(job.id)}</div><div class="meta">${esc(job.messagePreview)}</div></td>
        <td><span class="badge ${job.enabled ? 'ok' : 'warn'}">${job.enabled ? '启用' : '禁用'}</span></td>
        <td>${esc(scheduleText(job.schedule))}</td>
        <td>${fmt(job.state.nextRunAt)}</td>
        <td><span class="${cls}">${esc(status)}</span><div class="meta">${fmt(job.state.lastRunAt)} · ${job.state.lastDurationMs ?? '—'}ms</div>${job.state.lastError ? `<div class="meta error">${esc(job.state.lastError)}</div>` : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">暂无任务</td></tr>';
    document.querySelectorAll('tr[data-id]').forEach(row => row.addEventListener('click', () => loadDetail(row.dataset.id)));
  } catch (e) { $('#jobsStatus').textContent = 'error'; $('#jobsTable tbody').innerHTML = `<tr><td colspan="5" class="error">${esc(e.message)}</td></tr>`; }
}

async function loadDetail(id) {
  $('#detailStatus').textContent = 'loading';
  try {
    const data = await api(`/api/jobs/${encodeURIComponent(id)}`);
    $('#detailStatus').textContent = data.job.name;
    $('#jobDetail').innerHTML = `<div class="item"><strong>${esc(data.job.name)}</strong><div class="meta">${esc(data.job.description || '无描述')}</div></div>
      <h3>最近运行</h3><div class="list">${data.runs.slice(0,10).map(run => `<div class="item"><span class="badge ${run.status === 'ok' ? 'ok' : 'error'}">${esc(run.status)}</span> ${fmt(run.time)}<div>${esc(run.summary || run.error || '无摘要')}</div><div class="meta">${run.durationMs ?? '—'}ms · ${esc(run.provider || '')}/${esc(run.model || '')} · tokens ${run.usage?.total || 0}</div></div>`).join('') || '<div class="empty">暂无运行记录</div>'}</div>`;
  } catch (e) { $('#detailStatus').textContent = 'error'; $('#jobDetail').innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

async function loadUsage() {
  $('#usageStatus').textContent = 'loading';
  try {
    const usage = await api('/api/usage');
    $('#usageStatus').textContent = usage.totals.runs ? `${usage.totals.total.toLocaleString()} tokens` : '暂无统计';
    $('#usageBox').innerHTML = `<div class="item"><strong>总计</strong><div class="meta">输入 ${usage.totals.input.toLocaleString()} · 输出 ${usage.totals.output.toLocaleString()} · 总 ${usage.totals.total.toLocaleString()} · ${usage.totals.runs} 次运行</div></div>
      <div class="list">${usage.byJob.slice(0,8).map(row => `<div class="item"><strong>${esc(row.name)}</strong><div class="meta">${row.total.toLocaleString()} tokens · ${row.runs} 次</div></div>`).join('') || '<div class="empty">运行日志里没有 usage 字段</div>'}</div>`;
  } catch (e) { $('#usageStatus').textContent = 'error'; $('#usageBox').innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

async function loadTodos() {
  $('#todosStatus').textContent = 'loading';
  try {
    const { todos } = await api('/api/todos');
    $('#todosStatus').textContent = `${todos.length} 条`;
    $('#todosBox').innerHTML = `<div class="list">${todos.map(todo => `<div class="item">${esc(todo.text)}<div class="meta">${esc(todo.file)}:${todo.line}</div></div>`).join('') || '<div class="empty">未发现待办</div>'}</div>`;
  } catch (e) { $('#todosStatus').textContent = 'error'; $('#todosBox').innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

async function loadDigest() {
  $('#digestBox').textContent = '加载中...';
  try {
    const data = await api('/api/notification-digest?limit=80');
    $('#digestBox').textContent = data.error ? `读取失败：${data.error}` : data.preview || '暂无通知预览';
  } catch (e) { $('#digestBox').textContent = `读取失败：${e.message}`; }
}

async function refreshAll() { await Promise.all([loadJobs(), loadUsage(), loadTodos()]); }
$('#refreshAll').addEventListener('click', refreshAll);
$('#loadDigest').addEventListener('click', loadDigest);
refreshAll();
