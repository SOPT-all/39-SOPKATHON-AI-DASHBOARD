# 39-SOPKATHON-AI-DASHBOARD

솝커톤 iOS 1조의 **AI 개발 대시보드**. [Mino Android Spec Center](https://mash-up-kr.github.io/mino-android-spec-center/)의 간소화 버전입니다.
기능 하나를 `스펙 → 기획자 컨펌 → 구현 → 리뷰 → PR → 개발자 컨펌` 순서로 AI와 함께 진행하고, 어디까지 왔는지를 대시보드에서 봅니다.

```text
PRD ─▶ /spec ─▶ [기획자 컨펌] ─▶ /code ─▶ /review ─▶ /pr ─▶ [개발자 컨펌]
        이슈 등록     stage:approved     구현·테스트   컨벤션 점검   PR 생성      Merge Commit
```

## 동작 방식 (서버 없음)

| 구성 | 설명 |
| --- | --- |
| 스킬 `kit/skills` | `/spec /code /review /pr`. Claude Code와 Codex가 같은 `SKILL.md`를 읽습니다 |
| 상태 저장소 | 서버 레포의 **GitHub 이슈(스펙)와 PR**. 별도 DB 없음. 상태는 `stage:*` 라벨 |
| 대시보드 `site/` | 10분마다 Actions가 이슈·PR을 읽어 `data.json`을 만들고 GitHub Pages로 배포 |
| 기획자 컨펌 | 이슈에 `stage:approved` 라벨을 붙이면 승인 (수정 요청은 코멘트 + `stage:changes`) |
| 개발자 컨펌 | PR 리뷰·approve 후 Merge Commit |

라벨: `spec`, `stage:spec` → `stage:approved` → `stage:coding` → `stage:review` → `stage:pr` → (이슈 close = 완료), `stage:changes`.
라벨은 `/spec`을 처음 실행할 때 자동으로 만들어집니다.

## 1. 서버 레포에 스킬 설치

```bash
node scripts/install-kit.mjs ../39-SOPKATHON-SERVER-iOS1
```

- `.claude/skills/`(Claude Code)와 `.agents/skills/`(Codex)에 같은 스킬이 복사됩니다.
- `docs/prd/prd.md`가 없으면 템플릿이 생깁니다. **PRD를 채워서** 서버 레포에 커밋하세요.
- 서버 레포의 `AGENTS.md`가 코드 컨벤션의 단일 출처이고 `/code`, `/review`가 이를 따릅니다.
- 스킬을 고쳤다면 이 레포 `kit/skills`에서 고친 뒤 위 명령을 다시 실행합니다.

## 2. 사용 흐름

1. 개발자: `/spec 투표 생성 기능` → 스펙 미리보기 확인 후 이슈 등록
2. 기획자: 대시보드의 **기획자 컨펌하러 가기** → 이슈 확인 → `stage:approved` 라벨
3. 개발자: `/code 12` → `/review 12` → `/pr 12`
4. 팀원: PR 리뷰·approve → Merge Commit

Claude Code는 `/spec`, Codex는 `$spec`(또는 `/skills`)으로 호출합니다. Claude Code에 내장된 `/review`와 이름이 겹치면 `/code-review`나 스킬 목록에서 프로젝트 스킬을 직접 고르세요.

## 3. 배포

1. 이 레포를 `SOPT-all` 조직에 만들고 push
2. Settings → Pages → Source: **GitHub Actions**
3. 서버 레포가 비공개이거나 API 제한에 걸리면 읽기 권한 토큰을 Actions 시크릿 `TARGET_REPO_TOKEN`으로 등록
4. `Deploy dashboard` 워크플로가 push와 10분 주기로 `site/`를 배포

## 로컬 확인

```bash
node scripts/build-data.mjs      # site/data.json 갱신 (GH_TOKEN 선택)
cd site && npx serve .           # 또는 아무 정적 서버
```
