# 공식 API 조사

확인일: 2026-09-09. 공개 문서와 공식 페이지가 연결하는 YAML 원문을 직접 확인했다. API 키를 사용한 게임 데이터 응답은 아직 검증하지 않았다.

## 결론

캐릭터의 현재 장비와 두 잠재능력 및 추가옵션을 가져오는 데 필요한 필드는 있다. 그러나 구매 후 능력치, 목표 보스 솔로 클리어 수준, 미래 강화 비용은 별도 모델이 필요하다. 경매장 자동 조회는 현재 공식 API 목록에서 확인되지 않아 사용자 이미지와 가격 입력을 유지한다. [공식 API 목록](https://openapi.nexon.com/ko/game/maplestory/)

## 필드 매핑

참고로 공식 홈페이지에는 [메이플 옥션 웹사이트](https://auction.maplestory.nexon.com/) 링크가 존재한다. 웹사이트 존재와 외부 앱이 사용할 공식 매물 API 제공은 별개다. 이번 조사에서는 해당 웹사이트의 자동 접근 허용이나 공개 데이터 API를 확인하지 않았다.

다음 표의 출처는 공식 페이지에서 발견한 [캐릭터 API 스키마](https://openapi.nexon.com/static/api/maplestory/14_ko_script20260811231428.yaml)다. 경로는 `/maplestory/v1` 기준이다.

| 용도 | 경로 | 확인한 필드 또는 조건 |
| --- | --- | --- |
| 이름 검색 | `/id` | `character_name` 요청, `ocid` 식별자로 후속 조회 |
| 직업과 월드 | `/character/basic` | `character_class`, `character_level`, `world_name`, `date` |
| 현재 능력치 | `/character/stat` | `final_stat[].stat_name`, `stat_value`; 수치는 문자열 |
| 장비 | `/character/item-equipment` | `item_equipment[]`, `item_name`, `item_equipment_slot`, `item_equipment_part`, `item_icon` |
| 프리셋 | 위와 같음 | `preset_no`, `item_equipment_preset_1/2/3` |
| 스타포스 | 위와 같음 | `starforce` 문자열, `item_starforce_option`, `starforce_scroll_flag` |
| 일반 잠재 | 위와 같음 | `potential_option_grade`, `potential_option_1/2/3`, `potential_option_flag` |
| 에디셔널 잠재 | 위와 같음 | `additional_potential_option_grade`, `additional_potential_option_1/2/3`, `additional_potential_option_flag` |
| 옵션 분해 | 위와 같음 | `item_base_option`, `item_add_option`, `item_etc_option`, `item_exceptional_option`, `item_total_option` |
| 세트 | `/character/set-effect` | `set_effect[]`, `set_name`, `total_set_count`, `set_effect_info`, `set_option_full` |
| 세트 상세 | 위와 같음 | `set_count`, 문자열 `set_option`; 개수는 럭키 아이템을 포함 |
| 추가 계산 입력 | 각 `/character/...` 경로 | `hyper-stat`, `ability`, `symbol-equipment`, `skill`, `link-skill`, `vmatrix`, `hexamatrix`, `hexamatrix-stat` 제공 |

설계 해석: 잠재와 세트 문구를 파싱하는 검증된 변환 계층이 필요하다. 모르는 문구를 효과 0으로 바꾸면 안 된다. `item_total_option`에 분해 옵션을 다시 더하는 중복 계산도 피해야 한다. 현재 세트 응답만으로 미착용 장비 전체의 세트 소속과 효과를 얻는다고 가정하지 않는다. 구매 후보용 장비·세트 기준 자료를 별도로 마련한다.

## 조회 시점과 지원 범위

- 스키마는 한국 메이플스토리 데이터이며 평균 15분 후 확인 가능하다고 안내한다. 전일 데이터는 다음날 오전 2시부터 조회 가능하다.
- 장비 조회는 `ocid`가 필수이고 `date`는 KST 날짜이며 선택 항목이다. 과거 장비와 기본 정보는 2023-12-21부터 안내한다.
- 콘텐츠 변경으로 `ocid`가 바뀔 수 있다. 이름 재조회와 데이터 기준 시점 기록이 필요하다.
- 월드 명 필드는 확인했지만 특정 이벤트 월드를 포함한 모든 월드의 실제 조회 성공은 검증하지 않았다.

출처: [캐릭터 API 스키마](https://openapi.nexon.com/static/api/maplestory/14_ko_script20260811231428.yaml).

구현 제안: 조회 요청 시각과 응답 기준일을 별도로 보관한다. 서로 다른 프리셋 또는 시점의 능력치를 섞지 않는다. 날짜 생략 시 응답의 `date`와 프리셋 일관성은 인증된 응답으로 확인한다.

## 확률 API의 의미

`/history/starforce`, `/history/potential`, `/history/cube`는 강화 결과 및 사용 결과 조회다. 모든 장비의 미래 강화에 대한 확률표나 기대 비용 계산 API가 아니다. 스타포스와 잠재 이력의 제공 기간은 최대 2년이라고 설명된다. 비로그인 추천을 위해 사용자 개인 이력이나 사용자 API 키를 필수로 요구하지 않는다. [공식 확률 API 스키마](https://openapi.nexon.com/static/api/maplestory/17_ko_script20260320040201.yaml)

## 직업별 검증에 쓸 수 있는 자료

연무장 API에는 `/battle-practice/replay-id`, `/result`, `/skill-timeline`, `/character-info`가 있다. 측정 결과의 총 피해, DPS와 스킬별 점유율 및 입장 시 캐릭터 정보를 제공하는 필드를 확인했다. [공식 연무장 스키마](https://openapi.nexon.com/static/api/maplestory/59_ko_script20260618050117.yaml)

설계 해석: 동일 조건의 전후 측정 사례를 확보하면 계산 검증에 활용할 수 있다. 기록 존재 여부, 조건 일치와 접근 가능성은 실응답 검증이 필요하다. 측정 기록 자체가 미보유 장비의 효과나 솔로 클리어 가능성을 자동 예측하지는 않는다.

## 인증과 운영

- 개발자가 넥슨 계정으로 애플리케이션을 등록해 키를 발급한다. 개발 단계 한도는 초당 5건, 일 1,000건이며 서비스 단계는 초당 500건, 일 20,000,000건이다. 한도는 애플리케이션 단위이고 서비스 단계 전환 시 신규 발급 절차가 있다. [사전 준비](https://openapi.nexon.com/ko/guide/prepare-in-advance/)
- 요청 헤더는 `x-nxopen-api-key`다. 호출량 초과는 429, 데이터 준비 중과 점검 등은 별도 오류 코드로 구분된다. 앱에 `Data based on NEXON Open API`를 표시해야 한다. [사용 가이드](https://openapi.nexon.com/ko/guide/request-api/)
- API 문서는 수집 데이터를 30일 이내 갱신하도록 고지한다. 브라우저 저장 데이터도 무기한 최신 데이터로 취급하지 않고 만료·재조회 대상으로 관리한다. [API 고지](https://openapi.nexon.com/ko/game/maplestory/)
- 키 공개 제한, 허용 범위 밖 재배포 제한과 서비스 종료 시 API 결과 삭제 조건을 운영 설계에 반영한다. 이는 확인한 조항의 요약이며 별도 수익화 허가를 의미하지 않는다. [이용약관 제5·6·11조](https://openapi.nexon.com/ko/support/terms/)

구현 제안: 일반 이용자 가입 없이 운영자 키를 서버에서 사용한다. 최초 기본 조회를 식별자·기본·능력치·장비·세트의 5회로 구성하면 개발 한도상 캐시 없는 조회는 이론상 하루 200회 이하이며 추가 정보 조회는 더 소모한다. 서버 캐시와 요청 합치기 및 호출 제한을 적용한다. 키는 대화나 브라우저에 넣지 않고 서버 환경 설정으로 관리한다.

## 남은 검증과 다음 작업

1. 개발용 키가 설정된 환경에서 실제 캐릭터 응답, 누락과 프리셋 일관성 및 월드별 사례를 확인한다. 현재는 문서 검증만 완료했다.
2. 직업별 변환 공식, 아이템·세트 목록, 목표 보스의 관리자 기준을 확보한다. API에 있는 현재 수치만으로 목표 충족을 단정하지 않는다.
3. 강화 규칙은 [별도 조사](upgrade-rules-research.md)에서 확인한 출처를 토대로 버전별 수치 데이터와 검증 사례를 만든다.
4. 이미지 분석 제공자의 처리·보관 정책은 아직 선정하지 않았다. 원본 미보관 요구사항을 충족하는 방식으로 선정한다.

API 스키마의 날짜가 포함된 URL은 이번에 확인한 버전이다. 이후에는 공식 페이지가 연결하는 최신 버전과 변경점을 다시 확인한다.

## 외부 랭킹 및 시세 제공처 검토

확인일: 2026-09-11.

- 메이플스카우터는 [이용약관](https://maplescouter.com/ko/agreement) 제15조에서 봇, 스크립트, 크롤러, 스크레이퍼, 헤드리스 브라우저 및 MCP를 포함한 자동 접근을 금지하고, 서비스의 계산 결과나 데이터를 다른 서비스의 백엔드 또는 데이터 소스로 사용하는 행위도 금지한다. 따라서 캐릭터 랭킹이나 장비 데이터를 자동 수집해 추천 규칙에 반영하지 않는다.
- 메이플 아이템 시세는 [이용약관](https://mitemprice.kr/terms.php) 제7조에서 자동화 도구를 통한 대량 수집과 서버에 부담을 주는 접근을 금지한다. 공개 서비스에서 매일 시세를 가져와 재가공할 수 있는 공식 API나 별도 허가는 확인하지 못했다. 제공자의 서면 허가 또는 공식 API 계약 전에는 자동 수집을 구현하지 않는다.
- 랭킹 기반 장비 경향은 허용 범위가 명확한 NEXON Open API 랭킹과 캐릭터 장비 응답으로 대체한다. 공식 PC 메이플스토리 API에는 종합·유니온·길드·무릉도장·더 시드·업적 랭킹이 있지만 환산 전투력 랭킹은 없다. 따라서 메이플스카우터와 동일한 랭킹이라고 표현하지 않고, 보스 추천에는 직업별 무릉도장 표본을 우선 검토한다. [공식 랭킹 API](https://openapi.nexon.com/ko/game/maplestory/?id=18)
- 시세 연동은 제공처, 기준 시각, 월드, 표본 수, 갱신 성공 여부와 마지막 정상 값을 포함하는 공급자 인터페이스로 구현한다. 허가된 공급자가 없을 때는 가격 입력을 요구하며 오래된 값을 현재가로 표시하지 않는다.
