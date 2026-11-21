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
스펙은 이 대시보드에 저장되고, 구현이 시작되면 서버 레포의 GitHub 이슈·PR 상태가 함께 표시됩니다.

## 로그인
- **개발자**: GitHub 로그인. 허용된 3명(KateteDeveloper, joobogyeong, eun-seoo)만 들어올 수 있습니다.
- **기획자**: 토큰 없이 이름만 입력해 입장. 스펙을 읽고 승인·수정 요청을 남길 수 있습니다.

## 스펙 만들기
개발자는 기능 목록 위쪽의 **+ 스펙 추가**를 누릅니다. PRD 항목을 고르고 내용을 적으면 \`/spec\` 프롬프트가 만들어집니다. **Claude Code용 복사** 또는 **Codex용 복사**를 눌러 붙여넣으면 AI가 \`docs/specs/<id>.md\` 파일로 스펙을 씁니다. 그 파일을 **스펙 업로드**로 올리면 기획자가 볼 수 있습니다. GitHub 이슈는 \`/code\`가 만듭니다.

## 단계별 커맨드 (Claude Code · Codex 공통)
| 단계 | 커맨드 | 누가 | 하는 일 |
| --- | --- | --- | --- |
| 1 | \`/spec 기능 설명\` | 개발자 | PRD를 바탕으로 스펙 파일을 쓴다. 대시보드 **스펙 업로드**로 올린다 |
| - | 컨펌 | **기획자** | 대시보드에서 스펙을 읽고 **승인** 또는 **수정 요청**(이유 필수). 로그인은 이름만 입력 |
| 2 | \`/code 스펙ID\` | 개발자 | 승인된 스펙으로 **GitHub 이슈와 브랜치를 만들고** 구현·테스트·커밋, **PR 초안**을 이슈에 작성 |
| 3 | \`/review 스펙ID\` | 개발자 | 구현이 스펙에 맞는지, 컨벤션·**오버엔지니어링**은 아닌지 점검, 결과를 이슈에 기록 |
| 4 | \`/pr 스펙ID\` | 개발자 | 초안으로 PR 생성 → 개발자가 리뷰 후 Merge Commit하면 **기능 완료** |

Claude Code에서는 \`/spec\`, Codex에서는 \`$spec\`(또는 \`/skills\`에서 선택)으로 부르세요.

## 상태 배지
| 배지 | 뜻 |
| --- | --- |
| 스펙 작성 | 스펙이 업로드되어 기획자 컨펌을 기다림 (아직 이슈 없음) |
| 기획 컨펌 | 승인됨. \`/code\` 가능 |
| 구현 | \`/code\`가 이슈를 만들고 브랜치에서 구현 중 |
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
let approvals = {};      // 스펙 id → 컨펌 기록(Firestore)
let specs = [];          // Firestore에 올라온 스펙 [{ id, title, body, by, at }]
let rawIssues = [];      // data.json의 GitHub 이슈(/code가 만든 것)
let stageFilter = 'all'; // 'all' | 단계 key | 'changes'
let quick = { pr: false, mine: false };
let query = '';
let selected = decodeURIComponent(location.hash.slice(1)) || null;

// ---------- 목록 ----------
function visibleFeatures() {
  const q = query.trim().toLowerCase();
  return data.features.filter((f) =>
    (stageFilter === 'all' || (stageFilter === 'changes' ? f.changesRequested : f.stage === stageFilter))
    && (!quick.pr || f.pr)
    && (!quick.mine || (session && f.assignees.includes(session.name)))
    && (!q || f.title.toLowerCase().includes(q) || f.id.includes(q)));
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
    ? rows.map((f) => `<tr data-id="${esc(f.id)}" class="${f.id === selected ? 'on' : ''}">
        <td><div class="t">${esc(f.title)}</div><div class="slug">${esc(f.id)}${f.number ? ` · #${f.number}` : ''}</div></td>
        <td>${badges(f)}</td>
        <td>${esc(f.assignees.join(', ') || '-')}</td>
        <td>${f.pr ? `<a href="${safeUrl(f.pr.url)}" target="_blank" rel="noopener">#${f.pr.number}</a>` : '-'}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty">${data.features.length ? '조건에 맞는 기능이 없습니다.' : '아직 기능이 없습니다. <code>/spec 기능 설명</code>으로 스펙을 만들고 <strong>스펙 업로드</strong>로 올려 보세요.'}</td></tr>`;
}

// ---------- 상세 ----------
function nextAction(f) {
  if (f.changesRequested) return '기획자가 수정을 요청했습니다. 코멘트를 확인하고 <code>/spec ' + f.id + '</code>로 개정해 다시 업로드하세요.';
  return {
    spec: '기획자 컨펌을 기다리고 있습니다. 아래 스펙을 읽고 <strong>승인</strong> 또는 <strong>수정 요청</strong>을 눌러 주세요.',
    approved: '승인되었습니다. <code>/code ' + f.id + '</code>로 이슈를 만들고 구현을 시작하세요.',
    coding: '구현 중입니다. 끝나면 <code>/review ' + f.id + '</code>를 실행하세요.',
    review: '리뷰가 기록되었습니다. 필수 수정이 없고 규모가 적정이면 <code>/pr ' + f.id + '</code>로 PR을 올리세요.',
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
  const f = data.features.find((x) => x.id === selected);
  const msg = $('decide-msg');
  const comment = $('decide-comment').value.trim();
  if (kind === 'changes' && !comment) { msg.textContent = '수정 요청은 이유를 적어 주세요.'; return; }
  msg.textContent = '저장 중…';
  try {
    if (kind === 'reset') await Auth.reset(f.id);
    else await Auth.decide(f.id, session, kind, comment, await sha256(f.specBody));
    await reload(false);
  } catch (e) {
    msg.textContent = '저장하지 못했습니다. 권한이나 네트워크를 확인하세요. (' + (e.code || e.message) + ')';
  }
}

function renderDetail() {
  const f = data.features.find((x) => x.id === selected);
  if (!f) { $('detail').innerHTML = '<p class="empty">왼쪽 목록에서 기능을 선택하세요.</p>'; return; }
  const cur = stageIndex(f.stage);
  const steps = STAGES.map((s, i) => `<div class="step ${i < cur || f.stage === 'done' ? 'done' : ''} ${i === cur && f.stage !== 'done' ? 'now' : ''}">${esc(s.label)}<small>${esc(s.hint)}</small></div>`).join('');
  const isDevTurn = f.stage === 'pr';
  $('detail').innerHTML = `
    <h2>${esc(f.title)} <small>${esc(f.id)}${f.number ? ` · #${f.number}` : ''}</small></h2>
    <div class="steps">${steps}</div>
    <div class="note">${nextAction(f)}</div>
    ${decisionPanel(f)}
    <div class="actions">
      ${isDevTurn && f.pr ? `<a class="btn" target="_blank" rel="noopener" href="${safeUrl(f.pr.url)}">PR 리뷰하러 가기</a>` : ''}
      ${f.url ? `<a class="btn ghost" target="_blank" rel="noopener" href="${safeUrl(f.url)}">이슈 #${f.number} (코멘트 ${f.commentCount})</a>` : ''}
      ${f.pr && !isDevTurn ? `<a class="btn ghost" target="_blank" rel="noopener" href="${safeUrl(f.pr.url)}">PR #${f.pr.number} (${esc(f.pr.state)})</a>` : ''}
    </div>
    <h2 class="sec">스펙</h2><div class="md">${md(f.specBody)}</div>
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
    const a = approvals[f.id];
    f.approval = a || null;
    f.stale = Boolean(a && a.specHash !== (await sha256(f.specBody)));
    f.changesRequested = f.changesRequested || Boolean(a && a.status === 'changes' && !f.stale);
    if (f.stage === 'spec' && a?.status === 'approved' && !f.stale) f.stage = 'approved';
  }
}

// 스펙(Firestore)과 이슈(data.json)를 id로 합친다. 이슈가 없으면 아직 /code 전이므로 '스펙 작성' 단계다.
// 스펙 없이 이슈만 있는 기존 기능은 이슈 본문을 스펙으로 쓴다.
function mergeFeatures() {
  const byId = new Map(specs.map((s) => [s.id, {
    id: s.id, number: null, title: s.title, specBody: s.body, stage: 'spec', changesRequested: false,
    assignees: [], url: null, commentCount: 0, pr: null, review: null,
  }]));
  for (const i of rawIssues) {
    const id = i.specId || `issue-${i.number}`;
    const base = byId.get(id) || { id, title: i.title, specBody: i.body };
    byId.set(id, { ...i, ...base, id, number: i.number, stage: i.stage, changesRequested: i.changesRequested,
      assignees: i.assignees, url: i.url, commentCount: i.commentCount, pr: i.pr, review: i.review });
  }
  return [...byId.values()];
}

async function reload(fetchData = true) {
  if (fetchData) {
    try { data = await (await fetch('data.json', { cache: 'no-cache' })).json(); rawIssues = data.features || []; } catch { /* data.json 이 없으면 이슈 없음 */ }
  }
  try { approvals = await Auth.loadApprovals(); } catch { approvals = {}; }
  try { specs = await Auth.loadSpecs(); } catch { specs = []; }
  data.features = mergeFeatures();
  await applyApprovals();
  render();
}

async function init() {
  await reload();
  $('add-spec').hidden = $('upload-spec').hidden = session.role !== 'developer'; // 프롬프트를 실행하는 쪽은 개발자
  $('who').innerHTML = `<i>${esc(session.name.slice(0, 1).toUpperCase())}</i>${esc(session.name)} · ${session.role === 'developer' ? '개발자' : '기획자'}`;
  $('repo').innerHTML = data.repo ? `<a href="https://github.com/${esc(data.repo)}" target="_blank" rel="noopener">${esc(data.repo)}</a>` : '';
  $('foot').textContent = data.generatedAt ? `마지막 갱신 ${new Date(data.generatedAt).toLocaleString('ko-KR')}` : '';
  $('prd').className = 'card doc md';
  $('prd').innerHTML = data.prd ? md(data.prd) : '<p class="empty">서버 레포에 <code>docs/prd/prd.md</code>가 없습니다. 템플릿을 설치하고 내용을 채워 주세요.</p>';
  $('guide').className = 'card doc md';
  $('guide').innerHTML = md(GUIDE);
}

// ---------- 스펙 추가: /spec 프롬프트 만들기 ----------
// PRD 표의 "3.1 | 기능 | 설명" 행과 "### §3.1 제목" 제목에서 기능 후보를 뽑는다.
function prdItems(prd) {
  const items = new Map();
  for (const line of (prd || '').split('\n')) {
    const row = line.match(/^\|\s*§?(\d+(?:\.\d+)+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
    const head = line.match(/^#{2,4}\s*§\s*(\d+(?:\.\d+)+)\s+(.+)$/);
    const m = row || head;
    if (!m || m[2].startsWith('(')) continue; // 템플릿의 빈 항목은 건너뜀
    items.set(m[1], { ref: `§${m[1]}`, name: m[2].trim(), desc: row ? m[3].trim() : '' });
  }
  return [...items.values()];
}

let specPrd = [];
const specField = (id) => $('spec-' + id).value.trim();

function buildPrompt(prefix) {
  const ref = specPrd[Number($('spec-prd').value)];
  const lines = [`${prefix} ${specField('name')}`];
  if (ref) lines.push(`PRD 근거: ${ref.ref} ${ref.name}`);
  if (specField('desc')) lines.push(`요구 내용: ${specField('desc')}`);
  if (specField('note')) lines.push(`참고: ${specField('note')}`);
  return lines.join('\n');
}

function refreshPrompt() {
  const ready = Boolean(specField('name'));
  $('spec-out').value = ready ? buildPrompt('/spec') : '기능 이름을 입력하면 프롬프트가 만들어집니다.';
  document.querySelectorAll('#spec-dialog [data-copy]').forEach((b) => { b.disabled = !ready; });
}

function openSpecDialog() {
  specPrd = prdItems(data.prd);
  $('spec-prd').innerHTML = '<option value="-1">PRD 항목 없이 직접 작성</option>'
    + specPrd.map((p, i) => `<option value="${i}">${esc(p.ref)} · ${esc(p.name)}</option>`).join('');
  for (const id of ['name', 'desc', 'note']) $('spec-' + id).value = '';
  $('spec-msg').textContent = specPrd.length ? '' : 'PRD에서 기능 항목을 찾지 못했습니다. 직접 작성하거나 PRD 표에 "3.1 | 기능 이름 | 설명" 형태로 채워 주세요.';
  refreshPrompt();
  $('spec-dialog').showModal();
}

async function copyPrompt(prefix) {
  const text = buildPrompt(prefix);
  try { await navigator.clipboard.writeText(text); }
  catch { $('spec-out').select(); document.execCommand('copy'); }
  $('spec-msg').textContent = `복사했습니다. ${prefix === '/spec' ? 'Claude Code' : 'Codex'}에 붙여넣고 실행하세요.`;
}

// ---------- 이벤트 ----------
$('add-spec').addEventListener('click', openSpecDialog);

// ---------- 스펙 업로드 ----------
const slugify = (s) => s.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function openUploadDialog() {
  for (const id of ['file', 'id', 'title', 'body']) $('upload-' + id).value = '';
  $('upload-msg').textContent = '';
  $('upload-dialog').showModal();
}

$('upload-spec').addEventListener('click', openUploadDialog);
$('upload-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  $('upload-body').value = text;
  if (!$('upload-id').value) $('upload-id').value = slugify(file.name);
  if (!$('upload-title').value) $('upload-title').value = (text.match(/^#\s+(.+)$/m)?.[1] || '').trim();
});
$('upload-go').addEventListener('click', async () => {
  const id = $('upload-id').value.trim();
  const title = $('upload-title').value.trim();
  const body = $('upload-body').value.trim();
  const msg = $('upload-msg');
  if (!/^[a-z0-9-]{1,40}$/.test(id)) { msg.textContent = '스펙 ID는 영문 소문자·숫자·하이픈 40자 이내여야 합니다.'; return; }
  if (!title || !body) { msg.textContent = '제목과 본문을 채워 주세요.'; return; }
  msg.textContent = '업로드 중…';
  try {
    await Auth.uploadSpec(id, session, title, body, '');
    await reload(false);
    selected = id; location.hash = encodeURIComponent(id); render();
    $('upload-dialog').close();
  } catch (e) {
    msg.textContent = '업로드하지 못했습니다. 개발자 로그인인지 확인하세요. (' + (e.code || e.message) + ')';
  }
});
$('spec-prd').addEventListener('change', () => {
  const p = specPrd[Number($('spec-prd').value)];
  if (p) { $('spec-name').value = p.name; $('spec-desc').value = p.desc; }
  refreshPrompt();
});
for (const id of ['name', 'desc', 'note']) $('spec-' + id).addEventListener('input', refreshPrompt);
$('spec-dialog').addEventListener('click', (e) => { const b = e.target.closest('button[data-copy]'); if (b) copyPrompt(b.dataset.copy); });
$('pipe').addEventListener('click', (e) => { const li = e.target.closest('li[data-f]'); if (li) { stageFilter = li.dataset.f; render(); } });
$('quick').addEventListener('click', (e) => { const b = e.target.closest('button[data-q]'); if (b) { quick[b.dataset.q] = !quick[b.dataset.q]; render(); } });
$('search').addEventListener('input', (e) => { query = e.target.value; renderRows(); });
$('rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { selected = tr.dataset.id; location.hash = encodeURIComponent(selected); render(); } });
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
