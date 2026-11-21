---
name: code
description: "기획자가 컨펌한 스펙 이슈를 읽고 AGENTS.md 컨벤션에 맞게 구현·테스트·커밋한다. 사용자가 /code 이슈번호 라고 할 때 사용."
argument-hint: "스펙 이슈 번호 (예: 12)"
---

# /code — 스펙 기반 구현 (2단계)

컨펌된 스펙 이슈(`$ARGUMENTS`)를 구현한다. 번호가 없으면 한 번만 묻는다.

## 1. 게이트 (실패하면 중단하고 이유만 알린다)

```bash
gh issue view N --json number,title,body,labels,state
```

- 라벨에 `stage:approved`가 **없으면** 중단한다. "기획자 컨펌 전입니다. 스펙 이슈에서 컨펌을 받으세요."
- `stage:changes`가 있으면 수정 요청 상태이므로 `/spec N`으로 먼저 개정하라고 안내한다.
- 이슈가 닫혀 있으면 중단한다.
- 워킹 트리가 깨끗한지 `git status --porcelain`으로 확인한다. 변경이 있으면 사용자에게 알리고 멈춘다.

## 2. 준비

1. `AGENTS.md`를 읽는다. **패키지 구조, 네이밍, 공통 응답, 예외 처리, 검증, 설정 규칙을 그대로 따른다.** 코드를 쓰기 전에 관련 기존 파일(Controller, `CommonResponse`, `BusinessException`, 에러 코드 enum 등)을 실제로 열어 본다. 없는 클래스나 API를 있는 것처럼 쓰지 않는다.
2. 스펙의 **요구사항(FR)과 완료 조건**을 체크리스트로 정리해 사용자에게 한 번 보여 준다. 범위를 넘는 일(리팩터링, 의존성 추가)은 계획에 넣지 않는다.
3. 브랜치를 만든다: `git switch main && git pull --ff-only && git switch -c feat/#N`. 이미 있으면 그 브랜치로 전환한다. `main`에는 직접 커밋하지 않는다.
4. 라벨을 옮긴다: `gh issue edit N --remove-label stage:approved --add-label stage:coding`.

## 3. 구현

- 의존 방향은 `controller → service → repository`. Entity는 응답으로 직접 반환하지 않고 Response DTO로 변환한다.
- 요청 DTO에는 `@Valid`와 **한글 `message`가 있는** Bean Validation을 쓴다.
- 실패는 `BusinessException`과 도메인 `ErrorCode`로 던지고 `GlobalExceptionHandler`에 맡긴다. `try-catch`로 실패 응답을 직접 만들지 않는다.
- 스펙 요구사항마다 대응하는 테스트를 추가한다 (Service 단위 테스트, 필요하면 Controller 슬라이스 테스트).
- 설계 이유가 필요한 부분은 나중에 PR에 적을 수 있도록 메모해 둔다. 사람이 설명할 수 없는 코드는 만들지 않는다.

## 4. 검증

```bash
./gradlew test      # Windows PowerShell: .\gradlew.bat test
./gradlew build
```

실패하면 원인을 고치고 다시 돌린다. 끝내 못 고치면 실패 출력을 그대로 보고하고 멈춘다. 통과한 것처럼 말하지 않는다.

## 5. 커밋

한글 `prefix: 내용` 형식으로, 논리 단위로 나눠 커밋한다 (`feat` `fix` `refactor` `chore` `docs` `test` `style`). 예: `feat: 투표 생성 API 구현`. 푸시와 PR은 하지 않는다 (`/pr` 담당).

## 6. 보고

구현한 FR 목록, 테스트 결과, 스펙과 달라진 점이나 `[확인 필요]`로 남은 것을 요약하고 `/review N`으로 넘어가라고 안내한다. 스펙과 다르게 구현해야 했다면 이슈에 `gh issue comment N`으로 이유를 남긴다.

## 규칙

- 요청받은 범위만 구현한다. 비밀 값·`.env`는 코드, 로그, 문서에 적지 않는다.
- 스펙에 없는 요구사항을 임의로 추가하지 않는다. 필요해 보이면 이슈 코멘트로 기획자에게 묻는다.
