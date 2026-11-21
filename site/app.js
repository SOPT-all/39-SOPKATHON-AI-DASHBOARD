const STAGES = [
  { key: 'spec', label: '스펙 작성', list: '스펙 작성 (컨펌 대기)', hint: '컨펌 대기' },
  { key: 'approved', label: '기획 컨펌', list: '기획 컨펌 완료', hint: '구현 가능' },
  { key: 'coding', label: '구현', list: '구현중', hint: '/code' },
  { key: 'review', label: '리뷰', list: '리뷰', hint: '/review' },
  { key: 'pr', label: 'PR', list: 'PR 열림', hint: '개발자 컨펌' },
  { key: 'done', label: '완료', list: '머지됨 (완료)', hint: '머지됨' },
];
const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);
const stageLabel = (key) => STAGES[stageIndex(key)].label;

const GUIDE = `
## 이 대시보드는
기능 하나가 **스펙 → 기획자 컨펌 → 구현 → 리뷰 → PR → 개발자 머지** 순서로 어디까지 왔는지 보여 줍니다.
데이터는 서버 레포의 GitHub 이슈·PR에서 읽어 오며 몇 분마다 갱신됩니다.

## 로그인
- **개발자**: GitHub 로그인. 허용된 3명(KateteDeveloper, joobogyeong, eun-seoo)만 들어올 수 있습니다.
- **기획자**: 토큰 없이 이름만 입력해 입장. 스펙을 읽고 승인·수정 요청을 남길 수 있습니다.

## 단계별 커맨드 (Claude Code · Codex 공통)
| 단계 | 커맨드 | 누가 | 하는 일 |
| --- | --- | --- | --- |
| 1 | \`/spec 기능 설명\` | 개발자 | PRD를 바탕으로 스펙을 쓰고 이슈로 등록 (\`stage:spec\`) |
| - | 컨펌 | **기획자** | 대시보드에서 스펙을 읽고 **승인** 또는 **수정 요청**(이유 필수). 로그인은 이름만 입력 |
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
| PR | PR이 열려 개발자 머지를 기다림 |
| 완료 | PR이 머지되고 이슈가 닫힘 |
| 수정 요청 | 기획자가 스펙 수정을 요청함 |
| 스펙 재작성 필요 | 승인 이후 스펙이 바뀌어 다시 승인이 필요함 |
`;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const md = (text) => DOMPurify.sanitize(marked.parse(text || '', { gfm: true }), { ADD_ATTR: ['target'] });
const safeUrl = (u) => (/^https:\/\/github\.com\//.test(u) ? u : '#');

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text || ''));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let data = { features: [] };
let session = null;      // { role: 'developer' | 'planner', name }
let approvals = {};      // 이슈 번호 → 컨펌 기록(Firestore)
let stageFilter = 'all'; // 'all' | 단계 key | 'changes'
let quick = { pr: false, mine: false };
let query = '';
let selected = Number(location.hash.slice(1)) || null;

// ---------- 목록 ----------
function visibleFeatures() {
  const q = query.trim().toLowerCase();
  return data.features.filter((f) =>
    (stageFilter === 'all' || (stageFilter === 'changes' ? f.changesRequested : f.stage === stageFilter))
    && (!quick.pr || f.pr)
    && (!quick.mine || (session && f.assignees.includes(session.name)))
    && (!q || f.title.toLowerCase().includes(q) || String(f.number).includes(q)));
}

function badges(f) {
  const out = [`<span class="badge ${f.stage}">${esc(stageLabel(f.stage))}</span>`];
  if (f.changesRequested) out.push('<span class="badge changes">수정 요청</span>');
  if (f.stale) out.push('<span class="badge stale">스펙 재작성 필요</span>');
  return `<div class="badges">${out.join('')}</div>`;
}

function renderStats() {
  const n = (...keys) => data.features.filter((f) => keys.includes(f.stage)).length;
  const cards = [
    ['전체', data.features.length, ''], ['컨펌 대기', n('spec'), 'amber'], ['컨펌 완료', n('approved'), 'teal'],
    ['구현·리뷰', n('coding', 'review'), 'blue'], ['PR 열림', n('pr'), 'indigo'], ['완료', n('done'), 'green'],
  ];
  $('stats').innerHTML = cards.map(([label, count, tone]) => `<div class="stat ${tone}"><b>${count}</b><span>${label}</span></div>`).join('');
}

function renderSide() {
  const items = [['all', '전체', data.features.length], ...STAGES.map((s) => [s.key, s.list, data.features.filter((f) => f.stage === s.key).length]),
    ['changes', '수정 요청', data.features.filter((f) => f.changesRequested).length]];
  $('pipe').innerHTML = items.map(([k, l, c]) => `<li data-f="${k}" class="${stageFilter === k ? 'on' : ''}"><span>${esc(l)}</span><em>${c}</em></li>`).join('');
  $('quick').innerHTML = `<button data-q="pr" class="${quick.pr ? 'on' : ''}">PR 연결</button>
    <button data-q="mine" class="${quick.mine ? 'on' : ''}">내 담당</button>`;
}

function renderRows() {
  const rows = visibleFeatures();
  $('rows').innerHTML = rows.length
    ? rows.map((f) => `<tr data-n="${f.number}" class="${f.number === selected ? 'on' : ''}">
        <td><div class="t">${esc(f.title)}</div><div class="slug">#${f.number}</div></td>
        <td>${badges(f)}</td>
        <td>${esc(f.assignees.join(', ') || '-')}</td>
        <td>${f.pr ? `<a href="${safeUrl(f.pr.url)}" target="_blank" rel="noopener">#${f.pr.number}</a>` : '-'}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty">${data.features.length ? '조건에 맞는 기능이 없습니다.' : '아직 기능이 없습니다. <code>/spec 기능 설명</code>으로 시작해 보세요.'}</td></tr>`;
}

// ---------- 상세 ----------
function nextAction(f) {
  if (f.changesRequested) return '기획자가 수정을 요청했습니다. 코멘트를 확인하고 <code>/spec ' + f.number + '</code>로 개정하세요.';
  return {
    spec: '기획자 컨펌을 기다리고 있습니다. 아래 스펙을 읽고 <strong>승인</strong> 또는 <strong>수정 요청</strong>을 눌러 주세요.',
    approved: '승인되었습니다. <code>/code ' + f.number + '</code>로 구현을 시작하세요.',
    coding: '구현 중입니다. 끝나면 <code>/review ' + f.number + '</code>를 실행하세요.',
    review: '리뷰가 기록되었습니다. 필수 수정이 없고 규모가 적정이면 <code>/pr ' + f.number + '</code>로 PR을 올리세요.',
    pr: 'PR이 열려 있습니다. 개발자가 리뷰·approve 후 Merge Commit으로 머지하면 기능이 끝납니다.',
    done: '완료되었습니다.',
  }[f.stage];
}

// 기획자·개발자가 스펙을 승인하거나 수정 요청하는 영역. 구현이 시작된 뒤에는 결과만 보여 준다.
function decisionPanel(f) {
  const a = f.approval;
  const who = a ? `${esc(a.by)} (${a.role === 'developer' ? '개발자' : '기획자'})` : '';
  const when = a?.at ? new Date(a.at.toDate()).toLocaleString('ko-KR') : '';
  const record = a
    ? `<div class="note ${a.status === 'approved' ? 'ok' : 'warn'}"><strong>${a.status === 'approved' ? '승인됨' : '수정 요청'}</strong> · ${who} · ${esc(when)}${a.comment ? `<br>${esc(a.comment)}` : ''}${f.stale ? '<br><strong>⚠ 승인 이후 스펙이 바뀌었습니다. 다시 승인받으세요.</strong>' : ''}</div>`
    : '';
  const canDecide = ['spec', 'approved'].includes(f.stage) && session && (!a || f.stale || a.status === 'changes' || f.stage === 'spec');
  const controls = canDecide
    ? `<div class="decide">
         <textarea id="decide-comment" maxlength="500" rows="2" placeholder="코멘트 (수정 요청은 이유를 적어 주세요)"></textarea>
         <div class="actions">
           <button class="btn ok" data-decide="approved">승인</button>
           <button class="btn warn" data-decide="changes">수정 요청</button>
           ${a && session.role === 'developer' ? '<button class="btn ghost" data-decide="reset">컨펌 초기화</button>' : ''}
         </div>
         <p class="sub" id="decide-msg"></p>
       </div>`
    : '';
  return record + controls;
}

async function decide(kind) {
  const f = data.features.find((x) => x.number === selected);
  const msg = $('decide-msg');
  const comment = $('decide-comment').value.trim();
  if (kind === 'changes' && !comment) { msg.textContent = '수정 요청은 이유를 적어 주세요.'; return; }
  msg.textContent = '저장 중…';
  try {
    if (kind === 'reset') await Auth.reset(f.number);
    else await Auth.decide(f.number, session, kind, comment, await sha256(f.body));
    await reload(false);
  } catch (e) {
    msg.textContent = '저장하지 못했습니다. 권한이나 네트워크를 확인하세요. (' + (e.code || e.message) + ')';
  }
}

function renderDetail() {
  const f = data.features.find((x) => x.number === selected);
  if (!f) { $('detail').innerHTML = '<p class="empty">왼쪽 목록에서 기능을 선택하세요.</p>'; return; }
  const cur = stageIndex(f.stage);
  const steps = STAGES.map((s, i) => `<div class="step ${i < cur || f.stage === 'done' ? 'done' : ''} ${i === cur && f.stage !== 'done' ? 'now' : ''}">${esc(s.label)}<small>${esc(s.hint)}</small></div>`).join('');
  const isDevTurn = f.stage === 'pr';
  $('detail').innerHTML = `
    <h2>${esc(f.title)} <small>#${f.number}</small></h2>
    <div class="steps">${steps}</div>
    <div class="note">${nextAction(f)}</div>
    ${decisionPanel(f)}
    <div class="actions">
      ${isDevTurn && f.pr ? `<a class="btn" target="_blank" rel="noopener" href="${safeUrl(f.pr.url)}">PR 리뷰하러 가기</a>` : ''}
      <a class="btn ghost" target="_blank" rel="noopener" href="${safeUrl(f.url)}">스펙 이슈 (코멘트 ${f.commentCount})</a>
      ${f.pr && !isDevTurn ? `<a class="btn ghost" target="_blank" rel="noopener" href="${safeUrl(f.pr.url)}">PR #${f.pr.number} (${esc(f.pr.state)})</a>` : ''}
    </div>
    <h2 class="sec">스펙</h2><div class="md">${md(f.body)}</div>
    ${f.review ? `<h2 class="sec">코드 리뷰 결과 · <a href="${safeUrl(f.review.url)}" target="_blank" rel="noopener">코멘트 보기</a></h2><div class="md">${md(f.review.body)}</div>` : ''}`;
}

function render() { renderStats(); renderSide(); renderRows(); renderDetail(); }

function renderTab(tab) {
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const t of ['features', 'prd', 'guide']) $('view-' + t).hidden = t !== tab;
}

// ---------- 데이터 ----------
// 컨펌 기록을 기능에 합친다. GitHub 라벨은 몇 분 늦게 갱신되므로 Firestore 승인이 있으면 그것을 우선한다.
async function applyApprovals() {
  for (const f of data.features) {
    const a = approvals[f.number];
    f.approval = a || null;
    f.stale = Boolean(a && a.specHash !== (await sha256(f.body)));
    f.changesRequested = f.changesRequested || Boolean(a && a.status === 'changes' && !f.stale);
    if (f.stage === 'spec' && a?.status === 'approved' && !f.stale) f.stage = 'approved';
  }
}

async function reload(fetchData = true) {
  if (fetchData) {
    try { data = await (await fetch('data.json', { cache: 'no-cache' })).json(); } catch { /* data.json 이 없으면 빈 화면 */ }
  }
  try { approvals = await Auth.loadApprovals(); } catch { approvals = {}; }
  await applyApprovals();
  render();
}

async function init() {
  await reload();
  $('who').innerHTML = `<i>${esc(session.name.slice(0, 1).toUpperCase())}</i>${esc(session.name)} · ${session.role === 'developer' ? '개발자' : '기획자'}`;
  $('repo').innerHTML = data.repo ? `<a href="https://github.com/${esc(data.repo)}" target="_blank" rel="noopener">${esc(data.repo)}</a>` : '';
  $('foot').textContent = data.generatedAt ? `마지막 갱신 ${new Date(data.generatedAt).toLocaleString('ko-KR')}` : '';
  $('prd').className = 'card doc md';
  $('prd').innerHTML = data.prd ? md(data.prd) : '<p class="empty">서버 레포에 <code>docs/prd/prd.md</code>가 없습니다. 템플릿을 설치하고 내용을 채워 주세요.</p>';
  $('guide').className = 'card doc md';
  $('guide').innerHTML = md(GUIDE);
}

// ---------- 이벤트 ----------
$('pipe').addEventListener('click', (e) => { const li = e.target.closest('li[data-f]'); if (li) { stageFilter = li.dataset.f; render(); } });
$('quick').addEventListener('click', (e) => { const b = e.target.closest('button[data-q]'); if (b) { quick[b.dataset.q] = !quick[b.dataset.q]; render(); } });
$('search').addEventListener('input', (e) => { query = e.target.value; renderRows(); });
$('rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-n]'); if (tr) { selected = Number(tr.dataset.n); location.hash = selected; render(); } });
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) renderTab(b.dataset.tab); });
$('reset').addEventListener('click', () => { stageFilter = 'all'; quick = { pr: false, mine: false }; query = ''; $('search').value = ''; renderTab('features'); render(); });
$('detail').addEventListener('click', (e) => { const b = e.target.closest('button[data-decide]'); if (b) decide(b.dataset.decide); });
$('logout').addEventListener('click', () => Auth.logout());

// 로그인 화면
const showLoginError = (text) => { $('login-error').textContent = text || ''; };
$('login-dev').addEventListener('click', async () => {
  showLoginError();
  try { await Auth.loginDeveloper(); } catch (e) { showLoginError('GitHub 로그인에 실패했습니다. (' + (e.code || e.message) + ')'); }
});
$('login-planner').addEventListener('click', async () => {
  const name = $('planner-name').value.trim();
  if (!name) { showLoginError('이름을 입력하세요.'); return; }
  showLoginError();
  try { await Auth.loginPlanner(name); } catch (e) { showLoginError('입장하지 못했습니다. (' + (e.code || e.message) + ')'); }
});

function showApp(on) {
  $('login').hidden = on;
  $('top').hidden = !on;
  $('app').hidden = !on;
}

if (!Auth.configured) {
  $('login').hidden = false;
  showLoginError('Firebase 설정이 비어 있습니다. site/firebase-config.js 를 채워 주세요. (README 참고)');
  $('login-dev').disabled = $('login-planner').disabled = true;
} else {
  Auth.watch(async (s, error) => {
    session = s;
    showApp(Boolean(s));
    showLoginError(error);
    if (s) await init();
  });
}
