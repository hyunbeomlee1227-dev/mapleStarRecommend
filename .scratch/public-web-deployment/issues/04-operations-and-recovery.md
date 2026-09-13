# 사용량 기록 보존 및 운영 복구 절차

Status: ready-for-human
Type: task
Progress: free-tier-persistence-waived; operations-runbook-complete
Depends on: 02, 03

## 완료 기준

- 무료 인스턴스 재시작 시 로컬 사용량 기록이 초기화될 수 있고 Nexon 자체 한도는 유지됨을 문서화한다.
- 상태 확인 실패, 업스트림 장애와 일일 한도 소진을 로그에서 구분할 수 있다.
- 정상 배포 확인, 장애 진단, 이전 버전 롤백과 API 키 교체 절차를 문서화한다.
- 운영 문서와 실제 Render 설정이 일치한다.

## Comments

- 2026-09-13: 사용자가 무료 Render 리소스만 사용하도록 범위를 변경했다. 영구 디스크는 유료 서비스에서만 지원되므로 재시작 간 파일 기반 사용량 보존은 현재 범위에서 진행하지 않는다.
- 2026-09-13: 영구 디스크 조건을 제외한 배포 확인, 로그 기반 장애 구분, 롤백, API 키 교체 절차를 `docs/render-operations.md`에 문서화했다.
