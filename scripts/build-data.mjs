// GitHub에서 스펙 이슈·PR·PRD를 읽어 site/data.json 을 만든다.
// 환경 변수: TARGET_REPO(기본: dashboard.config.json), GH_TOKEN(선택, 비공개 레포나 rate limit 때문에 권장)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'dashboard.config.json'), 'utf8'));
const repo = process.env.TARGET_REPO || config.targetRepo;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const STAGES = ['spec', 'approved', 'coding', 'review', 'pr', 'done'];
const REVIEW_MARKER = '<!-- sopkathon:review -->';

async function gh(path, accept = 'application/vnd.github+json') {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: { Accept: accept, 'User-Agent': 'ai-dashboard', ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${await res.text()}`);
  return accept.includes('raw') ? res.text() : res.json();
}

const issues = ((await gh('/issues?labels=spec&state=all&per_page=100')) ?? []).filter((i) => !i.pull_request);
const pulls = (await gh('/pulls?state=all&per_page=100')) ?? [];
const prd = await gh(`/contents/${config.prdPath}?ref=${config.baseBranch}`, 'application/vnd.github.raw+json');

function findPull(number) {
  const closes = new RegExp(`(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${number}\\b`, 'i');
  return pulls.find((p) => p.head.ref.startsWith(`feat/#${number}`) || closes.test(p.body ?? ''));
}

const features = [];
for (const issue of issues) {
  const labels = issue.labels.map((l) => l.name);
  const pull = findPull(issue.number);
  let stage = STAGES.find((s) => labels.includes(`stage:${s}`)) ?? 'spec';
  if (pull?.state === 'open' && STAGES.indexOf(stage) < STAGES.indexOf('pr')) stage = 'pr';
  if (issue.state === 'closed' || pull?.merged_at) stage = 'done';

  const comments = (await gh(`/issues/${issue.number}/comments?per_page=100`)) ?? [];
  const review = comments.filter((c) => c.body.startsWith(REVIEW_MARKER)).at(-1);

  features.push({
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    stage,
    changesRequested: labels.includes('stage:changes'),
    assignees: issue.assignees.map((a) => a.login),
    url: issue.html_url,
    updatedAt: issue.updated_at,
    commentCount: comments.length,
    pr: pull && { number: pull.number, title: pull.title, url: pull.html_url, state: pull.merged_at ? 'merged' : pull.state },
    review: review && { body: review.body.replace(REVIEW_MARKER, '').trim(), url: review.html_url, createdAt: review.created_at },
  });
}
features.sort((a, b) => a.number - b.number);

const out = { generatedAt: new Date().toISOString(), repo, prd, features };
writeFileSync(join(root, 'site', 'data.json'), JSON.stringify(out, null, 2));
console.log(`✔ ${repo}: 스펙 ${features.length}개, PRD ${prd ? '있음' : '없음'}`);
