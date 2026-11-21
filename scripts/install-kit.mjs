// 사용법: node scripts/install-kit.mjs <서버 레포 경로>
// kit/skills 를 Claude(.claude/skills)와 Codex(.agents/skills) 양쪽에 복사한다.
// PRD 템플릿(docs/prd/prd.md)은 없을 때만 만든다. 이미 있는 PRD는 덮어쓰지 않는다.
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] && resolve(process.argv[2]);

if (!target || !existsSync(join(target, '.git'))) {
  console.error('사용법: node scripts/install-kit.mjs <서버 레포 경로>  (git 레포여야 합니다)');
  process.exit(1);
}

const skillsDir = join(root, 'kit', 'skills');
const skills = readdirSync(skillsDir);

for (const base of ['.claude/skills', '.agents/skills']) {
  for (const name of skills) {
    cpSync(join(skillsDir, name), join(target, base, name), { recursive: true });
  }
  console.log(`✔ ${base}: ${skills.map((s) => '/' + s).join(' ')}`);
}

// 스킬이 읽는 대시보드 설정. 이미 있으면 덮어쓰지 않는다(projectId를 채워 둔 값 보존).
const cfg = join(target, 'docs', 'ai', 'dashboard.json');
if (existsSync(cfg)) {
  console.log('• docs/ai/dashboard.json 이 이미 있어 그대로 둡니다.');
} else {
  mkdirSync(dirname(cfg), { recursive: true });
  copyFileSync(join(root, 'kit', 'dashboard.json.template'), cfg);
  console.log('✔ docs/ai/dashboard.json 생성 (firebaseProjectId를 채워 주세요)');
}

// /spec 이 만드는 스펙 초안 파일은 대시보드에 올리는 용도라 커밋하지 않는다.
const ignore = join(target, '.gitignore');
const ignored = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
if (/^\/?docs\/specs\/?$/m.test(ignored)) {
  console.log('• .gitignore 에 docs/specs/ 가 이미 있습니다.');
} else {
  const lead = ignored && !ignored.endsWith('\n') ? '\n' : '';
  appendFileSync(ignore, `${lead}\n# /spec 스펙 초안 (대시보드에 업로드하는 파일, 커밋하지 않음)\ndocs/specs/\n`);
  console.log('✔ .gitignore 에 docs/specs/ 추가');
}

const prd = join(target, 'docs', 'prd', 'prd.md');
if (existsSync(prd)) {
  console.log('• docs/prd/prd.md 가 이미 있어 그대로 둡니다.');
} else {
  mkdirSync(dirname(prd), { recursive: true });
  copyFileSync(join(root, 'kit', 'prd', 'prd.md'), prd);
  console.log('✔ docs/prd/prd.md 템플릿 생성 (내용을 채워 주세요)');
}
