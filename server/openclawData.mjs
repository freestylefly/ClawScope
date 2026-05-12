import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULTS = {
  openclawHome: path.join(os.homedir(), '.openclaw'),
  workspace: path.join(os.homedir(), '.openclaw', 'workspace'),
};

export class DataError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DataError';
    this.details = details;
  }
}

async function readJson(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new DataError(`Failed to read JSON: ${filePath}`, { cause: error.message });
  }
}

function asDate(ms) {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function compactText(value, max = 260) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeUsage(usage = {}) {
  const input = Number(usage.input_tokens ?? usage.inputTokens ?? usage.input ?? usage.prompt_tokens ?? 0) || 0;
  const output = Number(usage.output_tokens ?? usage.outputTokens ?? usage.output ?? usage.completion_tokens ?? 0) || 0;
  const total = Number(usage.total_tokens ?? usage.totalTokens ?? usage.total ?? (input + output) ?? 0) || 0;
  return { input, output, total };
}

export async function listCronJobs(options = {}) {
  const openclawHome = options.openclawHome ?? DEFAULTS.openclawHome;
  const jobsPath = path.join(openclawHome, 'cron', 'jobs.json');
  const statePath = path.join(openclawHome, 'cron', 'jobs-state.json');
  const jobsDoc = await readJson(jobsPath, { jobs: [] });
  const stateDoc = await readJson(statePath, { jobs: {} });
  const states = stateDoc.jobs ?? {};

  return (jobsDoc.jobs ?? []).map((job) => {
    const runtime = states[job.id]?.state ?? job.state ?? {};
    return {
      id: job.id,
      name: job.name || job.id,
      description: job.description || '',
      enabled: job.enabled !== false,
      agentId: job.agentId || 'main',
      sessionTarget: job.sessionTarget || job.sessionKey || '',
      schedule: job.schedule ?? null,
      delivery: job.delivery ?? null,
      payloadKind: job.payload?.kind ?? null,
      messagePreview: compactText(job.payload?.message || job.payload?.systemEvent || ''),
      createdAt: asDate(job.createdAtMs),
      state: {
        nextRunAt: asDate(runtime.nextRunAtMs),
        lastRunAt: asDate(runtime.lastRunAtMs),
        lastRunStatus: runtime.lastRunStatus ?? runtime.lastStatus ?? null,
        lastDurationMs: runtime.lastDurationMs ?? null,
        lastDeliveryStatus: runtime.lastDeliveryStatus ?? null,
        consecutiveErrors: runtime.consecutiveErrors ?? 0,
        consecutiveSkipped: runtime.consecutiveSkipped ?? 0,
        lastError: runtime.lastError ?? runtime.lastDiagnosticSummary ?? runtime.lastDiagnostics?.summary ?? null,
      },
    };
  });
}

async function readJsonLines(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text.split('\n').filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { return { action: 'parse_error', error: error.message, line: index + 1 }; }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new DataError(`Failed to read run log: ${filePath}`, { cause: error.message });
  }
}

export async function listRuns(options = {}) {
  const openclawHome = options.openclawHome ?? DEFAULTS.openclawHome;
  const runsDir = path.join(openclawHome, 'cron', 'runs');
  let files = [];
  try {
    files = await fs.readdir(runsDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new DataError(`Failed to list runs: ${runsDir}`, { cause: error.message });
  }

  const all = [];
  for (const file of files.filter((name) => name.endsWith('.jsonl'))) {
    const records = await readJsonLines(path.join(runsDir, file));
    for (const record of records) {
      if (record.action !== 'finished') continue;
      const usage = normalizeUsage(record.usage);
      all.push({
        jobId: record.jobId || file.replace(/\.jsonl$/, ''),
        ts: record.ts ?? record.runAtMs ?? null,
        time: asDate(record.ts ?? record.runAtMs),
        status: record.status ?? 'unknown',
        durationMs: record.durationMs ?? null,
        summary: compactText(record.summary || record.error || record.diagnostics?.summary || ''),
        error: compactText(record.error || record.diagnostics?.summary || ''),
        model: record.model || null,
        provider: record.provider || null,
        usage,
        deliveryStatus: record.deliveryStatus || null,
        sessionKey: record.sessionKey || null,
      });
    }
  }
  return all.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

export async function getJobDetail(jobId, options = {}) {
  const [jobs, runs] = await Promise.all([listCronJobs(options), listRuns(options)]);
  const job = jobs.find((item) => item.id === jobId);
  if (!job) throw new DataError(`Cron job not found: ${jobId}`, { status: 404 });
  const jobRuns = runs.filter((run) => run.jobId === jobId);
  return { job, runs: jobRuns.slice(0, 50), usage: summarizeUsage(jobRuns) };
}

export function summarizeUsage(runs) {
  const byJob = new Map();
  let totals = { input: 0, output: 0, total: 0, runs: 0 };
  for (const run of runs) {
    const usage = normalizeUsage(run.usage);
    if (!usage.total && !usage.input && !usage.output) continue;
    totals = {
      input: totals.input + usage.input,
      output: totals.output + usage.output,
      total: totals.total + usage.total,
      runs: totals.runs + 1,
    };
    const current = byJob.get(run.jobId) ?? { jobId: run.jobId, input: 0, output: 0, total: 0, runs: 0 };
    current.input += usage.input;
    current.output += usage.output;
    current.total += usage.total;
    current.runs += 1;
    byJob.set(run.jobId, current);
  }
  return { totals, byJob: [...byJob.values()].sort((a, b) => b.total - a.total) };
}

export async function getUsageStats(options = {}) {
  const [jobs, runs] = await Promise.all([listCronJobs(options), listRuns(options)]);
  const stats = summarizeUsage(runs);
  const names = Object.fromEntries(jobs.map((job) => [job.id, job.name]));
  stats.byJob = stats.byJob.map((row) => ({ ...row, name: names[row.jobId] || row.jobId }));
  return stats;
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export async function notificationDigestPreview(options = {}) {
  const limit = options.limit ?? 80;
  try {
    const { stdout } = await execFileAsync('openclaw', ['ntf', 'search', '--limit', String(limit)], {
      timeout: options.timeoutMs ?? 15000,
      maxBuffer: 1024 * 1024 * 4,
    });
    const clean = stripAnsi(stdout);
    const lines = clean.split('\n').filter(Boolean);
    return {
      generatedAt: new Date().toISOString(),
      source: 'openclaw ntf search',
      countHint: lines.length,
      preview: clean.slice(0, 12000),
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      source: 'openclaw ntf search',
      error: error.message,
      preview: '',
    };
  }
}

export async function knowledgeTodos(options = {}) {
  const workspace = options.workspace ?? DEFAULTS.workspace;
  const roots = ['knowledge', 'memory', 'MEMORY.md', 'USER.md'].map((p) => path.join(workspace, p));
  const files = [];
  for (const root of roots) await collectMarkdown(root, files, options.maxFiles ?? 250);
  const needles = /(?:TODO|Todo|todo|待办|下一步|重点提醒|Action|行动项|\[ \])/;
  const todos = [];
  for (const file of files) {
    let text = '';
    try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, index) => {
      if (needles.test(line)) {
        todos.push({ file: path.relative(workspace, file), line: index + 1, text: compactText(line, 220) });
      }
    });
    if (todos.length >= (options.limit ?? 100)) return todos;
  }
  return todos;
}

async function collectMarkdown(root, out, maxFiles) {
  if (out.length >= maxFiles) return;
  let stat;
  try { stat = await fs.stat(root); } catch { return; }
  if (stat.isFile()) {
    if (/\.(md|markdown|txt)$/i.test(root)) out.push(root);
    return;
  }
  if (!stat.isDirectory()) return;
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    await collectMarkdown(path.join(root, entry.name), out, maxFiles);
    if (out.length >= maxFiles) return;
  }
}
