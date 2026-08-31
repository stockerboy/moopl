/* SA CLOUD — F1 홍보영상 : 코어
 *
 * 이 파일의 모든 것은 t(초)의 순수 함수여야 한다. 프레임 캡처가 결정적이어야
 * 렌더를 몇 번을 다시 돌려도 같은 그림이 나오고, 중간부터 다시 뽑을 수도 있다.
 * 그래서 난수는 시드를 고정하고, 레이스는 미리 한 번 시뮬레이션해 표로 굳혀 둔다.
 */

export const T = {
  grid:     [0.0,  11.0],   // 스타팅 그리드 부감
  rollcall: [11.0, 31.0],   // 클랜 소개 — 마크와 클랜명이 보이게 (22대 × 약 0.9초)
  lights:   [31.0, 38.0],   // 레드라이트 5개 → 라이트 아웃
  race:     [38.0, 70.0],   // 경쟁 · 접전 · 충돌
  battle:   [70.0, 84.0],   // 휠 투 휠 클로즈업
  final:    [84.0, 99.0],   // FINAL LAP → 피니시, 마지막 차까지
  smoke:    [99.0, 107.0],  // 굉음과 연기
  reveal:   [107.0, 127.0], // 연기 속 헤드라이트가 SA → 약자 → CLOUD
  lockup:   [127.0, 136.0], // SA CLOUD 락업
}
export const DURATION = T.lockup[1]

/* 사이트 디자인 토큰 (sacloud docs/DECISIONS.md D-204 `적진`).
 * 영상이 사이트와 같은 옷을 입어야 홍보물로 이어진다. */
export const C = {
  page:   '#060505',
  card:   '#120c0c',
  card2:  '#1a1010',
  line:   '#2a1616',
  text:   '#d6c9c9',
  strong: '#f6eded',
  meta:   '#9a8080',
  faint:  '#6b5555',
  accent: '#d92b2b',
  asphalt:'#211b1b',
  asphalt2:'#2c2323',
}

export const FONT = {
  display: '"Black Han Sans", "Pretendard", sans-serif',
  brand:   '"Archivo Black", "Pretendard", sans-serif',
  body:    '"Pretendard", sans-serif',
  num:     '"JetBrains Mono", monospace',
  tech:    '"Chakra Petch", "JetBrains Mono", monospace',
}

/* ── 수학 ─────────────────────────────────────────────── */
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, u) => a + (b - a) * u
/** start→end 구간에서의 진행도 0..1 */
export const at = (t, start, end) => clamp((t - start) / (end - start))
export const easeOut = u => 1 - Math.pow(1 - u, 3)
export const easeIn = u => u * u * u
export const easeInOut = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
/** 튀어나왔다가 제자리로 — 로고 슬램에 쓴다 */
export const easeBack = u => { const c = 1.70158 + 1; return 1 + c * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2) }
/** 0에서 올라갔다 0으로 — 섬광·충격에 쓴다 */
export const pulse = u => Math.sin(clamp(u) * Math.PI)
export const smoothstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u) }

/** 시드 고정 난수. 같은 시드면 언제나 같은 수열이 나온다 */
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}
/** 좌표를 넣으면 항상 같은 값이 나오는 해시 난수 — 파티클을 t의 함수로 그릴 때 쓴다 */
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function hexRGB(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
export function rgba(hex, a) {
  const [r, g, b] = hexRGB(hex)
  return `rgba(${r},${g},${b},${a})`
}

/* ── 서킷 ─────────────────────────────────────────────────
 * 제어점을 Catmull-Rom 으로 이어 닫힌 곡선을 만들고, 호길이로 다시 샘플링한다.
 * 그래야 s(진행거리)로 위치를 찾을 때 속도가 일정하다.
 */
const CTRL = [
  [0, -260], [190, -250], [300, -150], [280, -30], [170, 40],
  [30, 60], [-90, 130], [-60, 250], [-210, 280], [-330, 200],
  [-320, 40], [-250, -80], [-280, -200], [-160, -270],
]

function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
  ]
}

function buildTrack() {
  const n = CTRL.length
  const raw = []
  for (let i = 0; i < n; i++) {
    const p0 = CTRL[(i - 1 + n) % n], p1 = CTRL[i], p2 = CTRL[(i + 1) % n], p3 = CTRL[(i + 2) % n]
    for (let k = 0; k < 40; k++) raw.push(catmull(p0, p1, p2, p3, k / 40))
  }
  // 호길이 누적
  const cum = [0]
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1], b = raw[i % raw.length]
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const L = cum[raw.length]
  // 등간격으로 다시 샘플링
  const N = 3000, pts = new Float64Array(N * 2)
  let j = 0
  for (let i = 0; i < N; i++) {
    const target = (i / N) * L
    while (j < raw.length - 1 && cum[j + 1] < target) j++
    const seg = cum[j + 1] - cum[j] || 1
    const u = (target - cum[j]) / seg
    const a = raw[j], b = raw[(j + 1) % raw.length]
    pts[i * 2] = lerp(a[0], b[0], u)
    pts[i * 2 + 1] = lerp(a[1], b[1], u)
  }
  return { pts, N, L }
}

export const TRACK = buildTrack()
/** 결승선 위치 (s = 0 지점) */
export const FINISH_S = 0

/** 진행거리 s 에서의 중심선 좌표와 진행방향 */
export function trackAt(s) {
  const { pts, N, L } = TRACK
  const f = ((s % L) + L) % L / L * N
  const i = Math.floor(f), u = f - i
  const i0 = i % N, i1 = (i + 1) % N
  const x = lerp(pts[i0 * 2], pts[i1 * 2], u)
  const y = lerp(pts[i0 * 2 + 1], pts[i1 * 2 + 1], u)
  const j0 = (i + N - 3) % N, j1 = (i + 3) % N
  const heading = Math.atan2(pts[j1 * 2 + 1] - pts[j0 * 2 + 1], pts[j1 * 2] - pts[j0 * 2])
  return { x, y, heading }
}

/** 중심선에서 옆으로 d 만큼 떨어진 점 (d>0 = 진행방향 기준 오른쪽) */
export function trackPos(s, d) {
  const p = trackAt(s)
  return {
    x: p.x + Math.cos(p.heading + Math.PI / 2) * d,
    y: p.y + Math.sin(p.heading + Math.PI / 2) * d,
    heading: p.heading,
  }
}

export const TRACK_HALF_WIDTH = 15
