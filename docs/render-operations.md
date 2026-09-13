# Render 운영 절차

## 정상 상태 확인

1. Render Dashboard에서 `maple-star-recommend` 서비스를 연다.
2. 최근 배포 상태가 `Live`이고 대상 커밋이 GitHub `main`의 검증된 커밋인지 확인한다.
3. `https://maple-star-recommend.onrender.com/healthz`가 `{"status":"ok"}`를 반환하는지 확인한다.
4. 공개 화면에서 `캐릭터 조회 연결됨`을 확인하고 실제 캐릭터 한 명을 조회한다. 로그나 이슈에 API 키, OCID, 장비 원문을 남기지 않는다.

무료 인스턴스는 유휴 상태에서 중지되므로 첫 요청이 50초 이상 지연될 수 있다. 이 지연만으로 장애로 판단하지 않는다.

## 장애 구분

- `/healthz` 실패: Render의 최근 배포와 런타임 로그에서 프로세스 시작, 포트 바인딩, 헬스 체크 실패를 확인한다.
- `/healthz` 성공, `/api/status`의 `configured`가 `false`: Render의 `NEXON_API_KEY` 비밀 환경 변수가 누락됐는지 확인한다.
- 캐릭터 조회만 실패: 무료 플랜에서도 제공되는 런타임 로그의 `character_lookup_failed` 항목에서 `code`와 `status`만 확인해 Nexon 연결 설정 오류, 일시적 업스트림 오류와 한도 초과를 구분한다. 이 로그에는 캐릭터 이름, API 키, OCID와 업스트림 메시지를 기록하지 않는다.
- 캐릭터 조회가 `429`: `Retry-After`를 따른다. 무료 인스턴스 재시작 시 로컬 `.runtime` 사용량 기록은 초기화될 수 있지만 Nexon 자체 한도는 초기화되지 않는다.

## 이전 버전 복구

1. Render 서비스의 **Deploys**에서 마지막으로 정상 동작한 `Live` 배포를 선택한다.
2. 해당 배포의 커밋과 GitHub Actions 성공 여부를 확인한다.
3. Render의 **Rollback**으로 이전 이미지를 복구한다.
4. `/healthz`, 메인 화면, 실제 캐릭터 조회를 다시 확인한다.
5. 원인 수정은 새 커밋으로 `main`에 반영한다. 실패한 커밋을 강제로 재작성하지 않는다.

## API 키 교체

1. Nexon Open API에서 교체할 키를 준비한다.
2. Render 서비스의 **Environment**에서 `NEXON_API_KEY` 값만 교체한다.
3. 값을 저장해 새 배포를 시작한다. 키를 GitHub, Blueprint, 빌드 인수 또는 로그에 입력하지 않는다.
4. 새 배포가 `Live`가 되면 `/api/status`와 실제 캐릭터 조회를 확인한다.
5. 교체가 확인된 뒤 더 이상 사용할 필요가 없는 키는 Nexon에서 폐기한다.
