import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getJobDetail, getUsageStats, listCronJobs, listRuns, summarizeUsage } from '../server/openclawData.mjs';

test('summarizeUsage aggregates token usage', () => {
  const stats = summarizeUsage([
    { jobId: 'a', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
    { jobId: 'a', usage: { inputTokens: 2, outputTokens: 3 } },
    { jobId: 'b', usage: {} },
  ]);
  assert.equal(stats.totals.total, 20);
  assert.equal(stats.byJob[0].jobId, 'a');
  assert.equal(stats.byJob[0].runs, 2);
});

test('reads cron jobs, state, and run logs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawscope-'));
  await fs.mkdir(path.join(dir, 'cron', 'runs'), { recursive: true });
  await fs.writeFile(path.join(dir, 'cron', 'jobs.json'), JSON.stringify({ version: 1, jobs: [{ id: 'job1', name: 'Daily', enabled: true, schedule: { kind: 'cron', expr: '0 9 * * *' }, payload: { message: 'hello world' } }] }));
  await fs.writeFile(path.join(dir, 'cron', 'jobs-state.json'), JSON.stringify({ version: 1, jobs: { job1: { state: { nextRunAtMs: 1000, lastRunStatus: 'ok' } } } }));
  await fs.writeFile(path.join(dir, 'cron', 'runs', 'job1.jsonl'), JSON.stringify({ ts: 2000, jobId: 'job1', action: 'finished', status: 'ok', usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } }) + '\n');

  const jobs = await listCronJobs({ openclawHome: dir });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].state.lastRunStatus, 'ok');
  const runs = await listRuns({ openclawHome: dir });
  assert.equal(runs.length, 1);
  const detail = await getJobDetail('job1', { openclawHome: dir });
  assert.equal(detail.usage.totals.total, 3);
  const usage = await getUsageStats({ openclawHome: dir });
  assert.equal(usage.byJob[0].name, 'Daily');
});
