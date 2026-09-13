# Render 공개 서비스 배포

Status: ready-for-agent
Type: task
Progress: free-blueprint-and-render-proxy-mode-implemented; provisioning-pending
Depends on: 01

## 완료 기준

- GitHub 기본 브랜치의 운영 컨테이너를 사용하는 단일 Render 웹 서비스를 만든다.
- 공개 HTTPS 주소에서 상태 확인과 메인 화면이 정상 응답한다.
- NEXON Open API 키는 Render 비밀 환경 변수에만 등록한다.
- 무료 웹 서비스와 단일 인스턴스를 사용하며 유료 리소스나 영구 디스크를 만들지 않는다.
- 실제 프록시 구성에 맞는 신뢰 단계를 설정한다.

## Comments

- 2026-09-13: 공식 Render Blueprint와 웹 서비스 문서를 기준으로 Singapore 단일 Docker 서비스 구성을 구현했다.
- 2026-09-13: 사용자 요청에 따라 무료 플랜으로 제한하고 유료 영구 디스크를 제거했다. 파일 기반 일일 사용량 기록은 재시작 시 초기화될 수 있다.
