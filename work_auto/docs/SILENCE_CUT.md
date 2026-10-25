# 무음 구간 자르기 (v0.9.70)

영상을 올리면 말이 없는 구간을 모두 잘라 낸 mp4 를 받는다. 공통 도구 › 무음 구간 자르기 `/tools/silence-cut` (기능 id `silence-cut`).

## 흐름
1. `POST /api/tools/silence-cut/prepare` { fileName, size } → Supabase Storage `videos/{로그인 사용자}/silence/{id}.mp4` 서명 업로드 주소 (서버 요청 4.5MB 제한을 피해 브라우저가 직접 PUT). 데모는 `POST /api/tools/silence-cut/upload?key=`
2. `POST /api/tools/silence-cut/cut` { key, minSilence, noiseDb, pad, fileName } (maxDuration 300초)
   - 원본을 받아 임시 폴더에 두고 **저장소 원본은 바로 지운다**
   - `silencedetect=noise={noiseDb}dB:d={minSilence}` (소리만 읽음) → 무음 구간
   - `keepSegments()`: 남길 구간 = 무음 사이, 말 앞뒤 pad 초 여유, 겹치면 합침, 0.08초보다 짧은 조각은 버림
   - `select/aselect = between(t,a,b)+…` 로 남길 구간만 이어 붙여 다시 인코딩 (libx264 veryfast crf21, aac 160k)
   - 결과 `…_cut.mp4` 를 올리고 미리보기 주소·다운로드 주소(파일 이름 지정) 1시간
3. 1시간 지난 내 무음 자르기 파일은 다음 [올릴 주소] 때 정리

## 설정 (lib/silence-cut.ts)
- 무음으로 볼 길이: 0.1 · **0.2** · 0.3 · 0.5 · 1초
- 무음 기준: -30dB(작은 소리도 무음) · **-35dB** · -40dB(아주 조용할 때만)
- 말 앞뒤 여유: 0 · **0.05** · 0.1초
- 한도: 300MB · 20분 (Supabase 무료 요금제는 파일당 50MB)

외부 유료 API 없음. 로그 `[SilenceCut]` (길이·자른 곳 수·설정·시간).
