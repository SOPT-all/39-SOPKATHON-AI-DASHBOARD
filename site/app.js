const STAGES = [
  { key: 'spec', label: '스펙 작성', hint: '기획자 컨펌 대기' },
  { key: 'approved', label: '기획 컨펌', hint: '구현 가능' },
  { key: 'coding', label: '구현', hint: '/code' },
  { key: 'review', label: '리뷰', hint: '/review' },
  { key: 'pr', label: 'PR', hint: '개발자 컨펌 대기' },
  { key: 'done', label: '완료', hint: '머지됨' },
];
const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);
const stageLabel = (key) => STAGES[stageIndex(key)].label;

const GUIDE = `
## 이 대시보드는
기능 하나가 **스펙 → 기획자 컨펌 → 구현 → 리뷰 → PR → 개발자 컨펌** 순서로 어디까지 왔는지 보여 줍니다.
데이터는 서버 레포의 GitHub 이슈·PR에서 읽어 오며 몇 분마다 갱신됩니다.

## 단계별 커맨드 (Claude Code · Codex 공통)
| 단계 | 커맨드 | 누가 | 하는 일 |
| --- | --- | --- | --- |
| 1 | \`/spec 기능 설명\` | 개발자 | PRD를 바탕으로 스펙을 쓰고 이슈로 등록 (\`stage:spec\`) |
| - | 컨펌 | **기획자** | 이슈를 읽고 \`stage:approved\` 라벨을 붙이면 승인, 고칠 게 있으면 코멘트와 \`stage:changes\` |
| 2 | \`/code 이슈번호\` | 개발자 | 승인된 스펙을 구현·테스트·커밋하고 **PR 초안**을 이슈에 작성 |
| 3 | \`/review 이슈번호\` | 개발자 | 구현이 스펙에 맞는지, 컨벤션·**오버엔지니어링**은 아닌지 점검, 결과를 이슈에 기록 |
| 4 | \`/pr 이슈번호\` | 개발자 | 초안으로 PR 생성 → 개발자가 리뷰 후 Merge Commit하면 **기능 완료** |

Claude Code에서는 \`/spec\`, Codex에서는 \`$spec\`(또는 \`/skills\`에서 선택)으로 부르세요.

## 상태 배지
| 배지 | 뜻 |
| --- | --- |
| 스펙 작성 | 스펙이 올라와 기획자 컨펌을 기다림 |
| 기획 컨펌 | 승인됨. \`/code\` 가능 |
| 구현 | 브랜치에서 구현 중 |
| 리뷰 | \`/review\` 결과가 이슈에 기록됨 |
| PR | PR이 열려 개발자 컨펌을 기다림 |
| 완료 | PR이 머지되고 이슈가 닫힘 |
`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const md = (text) => DOMPurify.sanitize(marked.parse(text || '', { gfm: true }), { ADD_ATTR: ['target'] });
const safeUrl = (u) => (/^https:\/\/github\.com\//.test(u) ? u : '#');

let data = { features: [] };
let filter = 'all';
let selected = Number(location.hash.slice(1)) || null;

function renderFilters() {
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, data.features.filter((f) => f.stage === s.key).length]));
  const items = [['all', `전체 ${data.features.length}`], ...STAGES.map((s) => [s.key, `${s.label} ${counts[s.key]}`])];
  $('filters').innerHTML = items.map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${esc(l)}</button>`).join('');
}

function renderList() {
  const rows = data.features.filter((f) => filter === 'all' || f.stage === filter);
  $('list').innerHTML = rows.length
    ? rows.map((f) => `<li data-n="${f.number}" class="${f.number === selected ? 'on' : ''}">
        <div class="t">${esc(f.title)}</div>
        <div class="m"><span class="badge ${f.stage}">${esc(stageLabel(f.stage))}</span>#${f.number}${f.changesRequested ? ' · 수정 요청' : ''}${f.assignees.length ? ' · ' + esc(f.assignees.join(', ')) : ''}</div>
      </li>`).join('')
    : '<li class="empty">해당하는 기능이 없습니다. <code>/spec</code>으로 시작해 보세요.</li>';
}

function nextAction(f) {
  if (f.changesRequested) return '기획자가 수정을 요청했습니다. 이슈 코멘트를 확인하고 <code>/spec ' + f.number + '</code>로 개정하세요.';
  return {
    spec: '기획자 컨펌을 기다리고 있습니다. 이슈에서 내용을 확인하고 <code>stage:approved</code> 라벨을 붙이면 승인됩니다.',
    approved: '승인되었습니다. <code>/code ' + f.number + '</code>로 구현을 시작하세요.',
    coding: '구현 중입니다. 끝나면 <code>/review ' + f.number + '</code>를 실행하세요.',
    review: '리뷰가 기록되었습니다. 필수 수정이 없고 규모가 적정이면 <code>/pr ' + f.number + '</code>로 PR을 올리세요.',
    pr: 'PR이 열려 있습니다. 개발자가 리뷰·approve 후 Merge Commit으로 머지하면 기능이 끝납니다.',
    done: '완료되었습니다.',
  }[f.stage];
}

function renderDetail() {
  const f = data.features.find((x) => x.number === selected);
  if (!f) { $('detail').innerHTML = '<p class="empty">왼쪽에서 기능을 선택하세요.</p>'; return; }
  const cur = stageIndex(f.stage);
  const steps = STAGES.map((s, i) => `<div class="step ${i < cur || f.stage === 'done' ? 'done' : ''} ${i === cur && f.stage !== 'done' ? 'now' : ''}">${esc(s.label)}<br><small>${esc(s.hint)}</small></div>`).join('');
  const isPlannerTurn = f.stage === 'spec';
  const isDevTurn = f.stage === 'pr';
  $('detail').innerHTML = `
    <h2 style="margin:0">${esc(f.title)} <small style="color:var(--muted)">#${f.number}</small></h2>
    <div class="steps">${steps}</div>
    <div class="note">${nextAction(f)}</div>
    <div class="actions">
      ${isPlannerTurn ? `<a class="btn" target="_blank" rel="noopener" href="${safeUrl(f.url)}">기획자 컨펌하러 가기</a>` : ''}
      ${isDevTurn && f.pr ? `<a class="btn" target="_blank" rel="noopener" href="${safeUrl(f.pr.url)}">PR 리뷰하러 가기</a>` : ''}
      <a class="btn ghost" target="_blank" rel="noopener" href="${safeUrl(f.url)}">스펙 이슈 (코멘트 ${f.commentCount})</a>
      ${f.pr && !isDevTurn ? `<a class="btn ghost" target="_blank" rel="noopener" href="${safeUrl(f.pr.url)}">PR #${f.pr.number} (${esc(f.pr.state)})</a>` : ''}
    </div>
    <h2 class="sec">스펙</h2><div class="md">${md(f.body)}</div>
    ${f.review ? `<h2 class="sec">코드 리뷰 결과 · <a href="${safeUrl(f.review.url)}" target="_blank" rel="noopener">코멘트 보기</a></h2><div class="md">${md(f.review.body)}</div>` : ''}`;
}

function renderTab(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const t of ['features', 'prd', 'guide']) $('view-' + t).hidden = t !== tab;
}

function render() { renderFilters(); renderList(); renderDetail(); }

async function init() {
  try {
    data = await (await fetch('data.json', { cache: 'no-cache' })).json();
  } catch { /* data.json 이 없으면 빈 화면으로 시작 */ }
  $('repo').innerHTML = data.repo ? `<a href="https://github.com/${esc(data.repo)}" target="_blank" rel="noopener">${esc(data.repo)}</a>` : '';
  $('foot').textContent = data.generatedAt ? `마지막 갱신 ${new Date(data.generatedAt).toLocaleString('ko-KR')}` : '';
  $('prd').className = 'doc md';
  $('prd').innerHTML = data.prd ? md(data.prd) : '<p class="empty">서버 레포에 <code>docs/prd/prd.md</code>가 없습니다. 템플릿을 설치하고 내용을 채워 주세요.</p>';
  $('guide').className = 'doc md';
  $('guide').innerHTML = md(GUIDE);
  render();
}

$('filters').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.f; render(); } });
$('list').addEventListener('click', (e) => { const li = e.target.closest('li[data-n]'); if (li) { selected = Number(li.dataset.n); location.hash = selected; render(); } });
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) renderTab(b.dataset.tab); });
init();
