# 운영 컨테이너 스모크 테스트 자동화

GitHub-Issue: https://github.com/hyunbeomlee1227-dev/mapleStarRecommend/issues/9
Status: ready-for-human
Type: task
Progress: implementation-complete; review-findings-fixed; github-ci-passed
Depends on: none

## 완료 기준

- GitHub 변경에서 운영 컨테이너 이미지를 실제로 빌드하고 실행한다.
- 실행된 컨테이너의 상태 확인, 메인 HTML, 정적 자산과 서버 상태 API를 HTTP 경계에서 검증한다.
- CI 전용 비밀 표식이 HTML, 정적 자산 또는 API 응답에 나타나면 실패한다.
- 실제 NEXON Open API 키나 저장소 비밀을 테스트에 사용하지 않는다.
- 실패 시 컨테이너 로그를 남기고 성공 여부와 관계없이 테스트 컨테이너를 정리한다.

## Testing Decisions

- 운영 컨테이너 외부의 HTTP 인터페이스만 테스트한다.
- 서버 준비 지연은 제한된 재시도로 처리하고 제한 시간을 넘기면 실패한다.

## Comments

- 2026-09-13: `/implement` 호출을 앞선 티켓 구성을 승인한 것으로 보고 첫 번째 차단 없는 티켓을 시작했다.
- 2026-09-13: 운영 HTTP 스모크 검사기와 GitHub Actions 컨테이너 작업을 구현했다. 로컬 운영 프로세스 검사는 통과했으며 Docker 엔진이 꺼져 있어 실제 이미지 실행은 첫 GitHub Actions 실행에서 확인한다.
- 2026-09-13: 코드 리뷰에 따라 모든 브랜치 푸시에서 CI를 실행하고, 동일 출처 정적 자산 의존성을 재귀 검사하며, HTTP 경계 밖의 컨테이너 내부 검사를 제거했다.
- 2026-09-13: GitHub Actions 실행 34712143995에서 단위 테스트·빌드와 실제 Linux 운영 컨테이너 스모크 작업이 모두 성공했다.
