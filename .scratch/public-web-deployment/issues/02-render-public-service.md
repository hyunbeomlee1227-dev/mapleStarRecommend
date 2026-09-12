# Render 공개 서비스 배포

Status: ready-for-agent
Type: task
Depends on: 01

## 완료 기준

- GitHub 기본 브랜치의 운영 컨테이너를 사용하는 단일 Render 웹 서비스를 만든다.
- 공개 HTTPS 주소에서 상태 확인과 메인 화면이 정상 응답한다.
- 재발급한 NEXON Open API 키는 Render 비밀 환경 변수에만 등록한다.
- 런타임 디렉터리에 영구 디스크를 연결하고 인스턴스 수를 하나로 고정한다.
- 실제 프록시 구성에 맞는 신뢰 단계를 설정한다.
