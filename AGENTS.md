# AGENTS.md

39기 SOPT 솝커톤 iOS 1조 **AI 대시보드** 레포. Claude Code·Codex 공통 지침.

## 역할
서버 레포(`dashboard.config.json`의 `targetRepo`)에서 쓰는 AI 스킬(`/spec` `/code` `/review` `/pr`)을 배포하고, 기능별 진행 상황을 보여 주는 정적 사이트를 호스팅한다.

## 구조
- `kit/skills/<name>/SKILL.md` — 스킬의 **단일 출처**. 여기만 고친다.
- `kit/prd/prd.md` — PRD 템플릿
- `scripts/install-kit.mjs` — 스킬을 서버 레포의 `.claude/skills`, `.agents/skills`에 복사
- `scripts/build-data.mjs` — GitHub 이슈·PR·PRD → `site/data.json`
- `site/` — 빌드 없는 정적 사이트(HTML/CSS/JS). GitHub Pages로 배포

## 규칙
- 스킬을 고치면 서버 레포에 `node scripts/install-kit.mjs <경로>`로 다시 설치해야 반영된다.
- 상태 라벨(`stage:*`)과 리뷰 마커(`<!-- sopkathon:review -->`)는 스킬과 `build-data.mjs`가 함께 쓰는 약속이므로 한쪽만 바꾸지 않는다.
- 사이트는 이슈 본문을 렌더링하므로 반드시 DOMPurify를 거친다. 외부 링크는 `https://github.com/`만 허용한다.
- 비밀 값은 커밋하지 않는다. 토큰은 Actions 시크릿 `TARGET_REPO_TOKEN`.
- 커밋은 한글 `prefix: 내용`, 브랜치는 `feat/#이슈번호`, `main` 직접 push 금지.
