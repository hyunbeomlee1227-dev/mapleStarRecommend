# Maple Star Recommend

메이플스토리 캐릭터의 장비와 잠재능력을 분석하고, 솔로 보스전 성능 증가 대비 메소 효율을 기준으로 강화 우선순위를 추천하는 웹 서비스입니다.

## 로컬 개발

Node.js 22 이상이 필요합니다.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

`.env`에 `NEXON_API_KEY`를 입력한 뒤 `http://127.0.0.1:5173`에서 확인할 수 있습니다. `.env`와 `.env.*`는 Git에서 제외됩니다.

## 운영 실행

```powershell
npm ci
npm run build
$env:NODE_ENV = 'production'
$env:NEXON_API_KEY = '<secret>'
npm start
```

운영 모드는 기본적으로 `0.0.0.0`과 호스팅 서비스가 제공하는 `PORT`에 바인딩합니다. 상태 확인 경로는 `/healthz`입니다.

## Docker 배포

```powershell
docker build -t maple-star-recommend .
docker run --rm -p 5173:5173 -v maple-runtime:/app/.runtime -e NEXON_API_KEY='<secret>' maple-star-recommend
```

API 키는 Docker 이미지에 넣지 말고 배포 플랫폼의 비밀 환경 변수로 등록해야 합니다. `TRUST_PROXY_HOPS`는 보안을 위해 기본값이 `0`입니다. 일반적인 단일 리버스 프록시 환경에서는 배포 환경 변수로 `TRUST_PROXY_HOPS=1`을 지정합니다. 프록시 단계가 다르다면 실제 구성에 맞게 변경해야 IP 기반 요청 제한이 올바르게 동작합니다.

현재 Nexon API 일일 사용량은 `.runtime` 파일에 기록됩니다. 재배포 후에도 제한 기록을 유지하려면 이 경로에 영구 볼륨을 연결하고 운영 인스턴스는 하나만 실행해야 합니다. 여러 인스턴스로 확장하려면 공유 저장소 기반 사용량 제한으로 교체해야 합니다.
