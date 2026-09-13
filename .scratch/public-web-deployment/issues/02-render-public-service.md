# Render 공개 서비스 배포

Status: ready-for-human
Type: task
Progress: free-service-live; public-smoke-passed; proxy-hardening-live-and-verified
Depends on: 01

## 완료 기준

- GitHub 기본 브랜치의 운영 컨테이너를 사용하는 단일 Render 웹 서비스를 만든다.
- 공개 HTTPS 주소에서 상태 확인과 메인 화면이 정상 응답한다.
- NEXON Open API 키는 Render 비밀 환경 변수에만 등록한다.
- 무료 웹 서비스와 단일 인스턴스를 사용하며 유료 리소스나 영구 디스크를 만들지 않는다.
- Render가 덮어쓰는 클라이언트 IP 헤더만 요청 제한에 사용하고 호출자가 제어하는 전달 헤더는 신뢰하지 않는다.

## Comments

- 2026-09-13: 공식 Render Blueprint와 웹 서비스 문서를 기준으로 Singapore 단일 Docker 서비스 구성을 구현했다.
- 2026-09-13: 사용자 요청에 따라 무료 플랜으로 제한하고 유료 영구 디스크를 제거했다. 파일 기반 일일 사용량 기록은 재시작 시 초기화될 수 있다.
- 2026-09-13: 무료 Docker 서비스가 `https://maple-star-recommend.onrender.com`에서 Live 상태가 되었고 운영 스모크 테스트를 통과했다.
- 2026-09-13: 공개 검증에서 임의 `X-Forwarded-For`로 요청 제한을 우회할 수 있음을 발견해 Render 모드를 마지막 프록시 한 단계만 신뢰하도록 수정했다. 수정 배포 후 재검증이 필요하다.
- 2026-09-13: 한 단계 신뢰 설정도 실제 Render에서 우회됨을 확인했다. 공식 Render 계약에 따라 `CF-Connecting-IP`만 검증해 사용하도록 다시 수정했다.
- 2026-09-13: 커밋 `585ef22` 배포 후 동일 클라이언트 12회 요청에 이어 위조 `X-Forwarded-For` 요청이 `429`로 차단됨을 공개 환경에서 확인했다.
- 2026-09-13: 저장소를 공개 URL로 연결해 GitHub App 기반 자동 배포는 아직 사용할 수 없다. GitHub Actions 성공 후 최신 커밋 수동 배포 절차를 README에 기록했다.
