---
name: pr
description: "리뷰를 마친 브랜치를 푸시하고 PR 템플릿에 맞춰 PR을 올려 개발자 컨펌을 받을 수 있게 한다. 사용자가 /pr 이슈번호 라고 할 때 사용."
argument-hint: "스펙 이슈 번호 (생략하면 브랜치 feat/#N에서 추정)"
---

# /pr — Pull Request 생성 (4단계)

번호는 `$ARGUMENTS` 또는 브랜치명 `feat/#N`에서 얻는다. 이 단계의 끝은 **개발자 컨펌 요청**이다.

## 1. 게이트

- 워킹 트리가 깨끗해야 한다 (`git status --porcelain`). 변경이 있으면 커밋 먼저 하라고 알리고 멈춘다.
- 현재 브랜치가 `main`이면 중단한다. `main`에 직접 올리지 않는다.
- 이슈에 `<!-- sopkathon:review -->` 코멘트가 없거나 마지막 리뷰가 "수정 필요"면 `/review N`을 먼저 하라고 안내한다 (`gh issue view N --json comments`).
- `gh auth status`가 실패하면 `gh auth login`을 안내한다.

## 2. 본문 작성

1. `.github/pull_request_template.md`를 읽어 **그 구조를 그대로** 따른다. 파일이 없으면 `## 작업 내용`, `## 설계 이유`, `## 테스트`, `## 리뷰 포인트` 네 섹션을 쓰고, 템플릿이 없다는 사실을 보고에 적는다.
2. 근거 수집: `git log main..HEAD --oneline`, `git diff main...HEAD --stat`, 스펙 이슈, 마지막 리뷰 코멘트.
3. 채울 내용: 무엇을 왜 바꿨는지(스펙 요구사항 FR 기준), 설계 이유(AI가 구현했더라도 **사람이 설명할 수 있어야** 하므로 비자명한 결정은 반드시 적는다), 테스트 방법과 결과, 리뷰어가 볼 지점.
4. 맨 아래에 `close #N`으로 이슈를 연결한다.
5. 제목은 한글 `prefix: 내용` (예: `feat: 투표 생성 API 구현`). 커밋이 여러 종류면 가장 큰 변경의 prefix.

## 3. 사용자 확인 후 올리기

제목·본문·base(`main`)를 사용자에게 보여 주고 **올려도 되는지 확인**한다. 확인 전에는 푸시도 PR도 하지 않는다.

```bash
git push -u origin HEAD
gh pr create --base main --title "<제목>" --body-file <임시파일> --assignee @me
gh issue edit N --remove-label stage:review --add-label stage:pr
```

임시 파일은 끝나면 지운다. 개발자 리뷰어가 정해져 있으면 `--reviewer`로 지정한다.

## 4. 보고

PR URL을 알리고 다음을 안내한다.
- 팀원이 PR을 리뷰·approve한 뒤 **Merge Commit**으로 머지한다.
- 머지되면 `close #N`으로 이슈가 닫히고 대시보드에서 "완료"가 된다.

## 규칙

- 커밋을 만들거나 고치지 않는다. 변경이 필요하면 `/code` 또는 `/review`로 돌아간다.
- `main`에 직접 push 금지, force push 금지.
- 비밀 값이나 `.env` 내용을 본문·로그에 넣지 않는다.
