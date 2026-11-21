# 39-SOPKATHON-AI-DASHBOARD

솝커톤 iOS 1조의 **AI 개발 대시보드**. [Mino Android Spec Center](https://mash-up-kr.github.io/mino-android-spec-center/)의 간소화 버전입니다.
기능 하나를 `스펙 → 기획자 컨펌 → 구현 → 리뷰 → PR → 개발자 컨펌` 순서로 AI와 함께 진행하고, 어디까지 왔는지를 대시보드에서 봅니다.

```text
PRD ─▶ /spec ─▶ [기획자 컨펌] ─▶ /code ─▶ /review ─▶ /pr ─▶ [개발자 머지 = 끝]
        스펙 파일→업로드   승인        이슈·브랜치+구현+PR 초안   맞는지·오버엔지니어링   PR 생성     Merge Commit
```

## 동작 방식 (서버 없음)

| 구성 | 설명 |
| --- | --- |
| 스킬 `kit/skills` | `/spec /code /review /pr`. Claude Code와 Codex가 같은 `SKILL.md`를 읽습니다 |
| 상태 저장소 | 스펙은 대시보드(Firestore `specs/{id}`), 구현 단계부터는 서버 레포의 **GitHub 이슈와 PR**(상태는 `stage:*` 라벨). 이슈는 `/code`가 만들고 본문 마커 `sopkathon:spec:<id>`로 스펙과 이어짐 |
| 대시보드 `site/` | 10분마다 Actions가 이슈·PR을 읽어 `data.json`을 만들고 GitHub Pages로 배포 |
| 로그인 | Firebase Auth. **개발자**는 GitHub 로그인(KateteDeveloper, joobogyeong, eun-seoo 3명만), **기획자**는 이름만 입력(익명 로그인, 토큰 불필요) |
| 기획자 컨펌 | 대시보드에서 **승인 / 수정 요청**. Firestore `approvals/{스펙ID}`에 저장되고 `/code`가 읽어 게이트로 씀 |
| 개발자 컨펌 | PR 리뷰·approve 후 Merge Commit |

라벨(이슈가 만들어진 뒤): `spec`, `stage:coding` → `stage:review` → `stage:pr` → (이슈 close = 완료), `stage:changes`.
스펙 작성·승인 단계는 이슈가 없으므로 라벨이 아니라 대시보드 데이터로 판단합니다. 라벨은 `/code`가 처음 실행될 때 자동으로 만들어집니다.

## 1. 서버 레포에 스킬 설치

```bash
node scripts/install-kit.mjs ../39-SOPKATHON-SERVER-iOS1
```

- `.claude/skills/`(Claude Code)와 `.agents/skills/`(Codex)에 같은 스킬이 복사됩니다.
- `docs/prd/prd.md`가 없으면 템플릿이 생깁니다. **PRD를 채워서** 서버 레포에 커밋하세요.
- 서버 레포의 `AGENTS.md`가 코드 컨벤션의 단일 출처이고 `/code`, `/review`가 이를 따릅니다.
- 스킬을 고쳤다면 이 레포 `kit/skills`에서 고친 뒤 위 명령을 다시 실행합니다.

## 2. 사용 흐름

1. 개발자: `/spec 투표 생성 기능` → 스펙 미리보기 확인 후 `docs/specs/<id>.md` 저장 → 대시보드 **스펙 업로드**로 올림 (GitHub 이슈는 아직 안 만듦)
2. 기획자: 대시보드에 이름으로 입장 → 스펙을 읽고 **승인** 또는 **수정 요청**(이유 필수)
3. 개발자: `/code <스펙ID>` — **GitHub 이슈와 `feat/#N` 브랜치를 만들고** 구현, **PR 초안**까지 이슈에 작성
4. 개발자: `/review <스펙ID>` — 구현이 스펙에 맞는지·컨벤션·**오버엔지니어링**인지 점검 (필요하면 줄이는 방향으로 수정)
5. 개발자: `/pr <스펙ID>` — 초안으로 PR 생성 → 리뷰·approve 후 Merge Commit하면 **기능 끝**

Claude Code는 `/spec`, Codex는 `$spec`(또는 `/skills`)으로 호출합니다. Claude Code에 내장된 `/review`와 이름이 겹치면 `/code-review`나 스킬 목록에서 프로젝트 스킬을 직접 고르세요.

## 3. Firebase 설정 (로그인·컨펌 저장, 무료 Spark 요금제)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성 → 앱 추가(웹) → 설정 값을 `site/firebase-config.js`에 붙여넣기
2. **Authentication → Sign-in method**
   - **익명(Anonymous)** 사용 설정 (기획자 입장)
   - **GitHub** 사용 설정: GitHub에서 OAuth App을 만들고(Settings → Developer settings → OAuth Apps) Client ID/Secret을 입력, Firebase가 보여 주는 콜백 URL을 OAuth App에 등록
   - **Settings → 승인된 도메인**에 `sopt-all.github.io` 추가
3. **Firestore Database** 생성(프로덕션 모드) 후 `firestore.rules` 내용을 규칙 탭에 붙여넣거나 `firebase deploy --only firestore:rules`
4. 서버 레포 `docs/ai/dashboard.json`의 `firebaseProjectId`에 프로젝트 ID 입력 (`/code`가 컨펌을 읽는 데 씀)

개발자 허용 목록은 `firestore.rules`(GitHub 숫자 ID)와 `site/auth.js`에 있습니다. 바꿀 때는 두 곳을 함께 고칩니다.
기획자 입장은 토큰이 없으므로 URL을 아는 누구나 승인할 수 있습니다. 팀 안에서만 URL을 공유하세요.

## 4. 배포 (GitHub Pages)

1. 이 레포를 `SOPT-all` 조직에 만들고 push
2. Settings → Pages → Source: **GitHub Actions**
3. 서버 레포가 비공개이거나 API 제한에 걸리면 읽기 권한 토큰을 Actions 시크릿 `TARGET_REPO_TOKEN`으로 등록
4. `Deploy dashboard` 워크플로가 push와 10분 주기로 `site/`를 배포

## 로컬 확인

```bash
node scripts/build-data.mjs      # site/data.json 갱신 (GH_TOKEN 선택)
cd site && npx serve .           # 또는 아무 정적 서버
```
