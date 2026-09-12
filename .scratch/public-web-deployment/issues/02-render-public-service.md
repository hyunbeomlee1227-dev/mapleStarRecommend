# Render 공개 서비스 배포

Status: ready-for-agent
Type: task
Progress: blueprint-and-render-proxy-mode-implemented; paid-provisioning-pending
Depends on: 01

## 완료 기준

- GitHub 기본 브랜치의 운영 컨테이너를 사용하는 단일 Render 웹 서비스를 만든다.
- 공개 HTTPS 주소에서 상태 확인과 메인 화면이 정상 응답한다.
- 재발급한 NEXON Open API 키는 Render 비밀 환경 변수에만 등록한다.
- 런타임 디렉터리에 영구 디스크를 연결하고 인스턴스 수를 하나로 고정한다.
- 실제 프록시 구성에 맞는 신뢰 단계를 설정한다.

## Comments

- 2026-09-13: 공식 Render Blueprint, 웹 서비스, 영구 디스크 문서를 기준으로 Singapore 단일 Docker 서비스 구성을 구현했다. 영구 디스크는 유료 서비스에서만 지원되므로 실제 생성은 사용자 요금 확인과 새 NEXON API 키 입력이 필요하다.
