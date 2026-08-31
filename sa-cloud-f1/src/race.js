/* 레이스 시뮬레이션.
 *
 * 매 프레임 물리를 굴리면 렌더를 다시 돌릴 때마다 결과가 달라진다. 그래서 로드 시점에
 * 한 번만 고정 시드로 시뮬레이션해서 표(30Hz)로 굳혀 두고, seek(t) 는 그 표를 읽기만 한다.
 *
 * 순위는 지어내지 않는다. 출발 그리드도 완주 페이스도 사이트의 실제 레이팅을 따른다.
 */
import { TRACK, rng, clamp, lerp } from './core.js'

export const LAPS = 2
const DT = 1 / 60
const REC_HZ = 30
const HALF = 11          // 코스 안에서 차가 설 수 있는 좌우 한계 (m)
const CAR_LEN = 4.6

/** 출발 그리드에서 p번째(0=폴) 차의 자리 */
export function gridSlot(p) {
  const row = Math.floor(p / 2)
  return { s: -(row * 9.5) - 8, d: p % 2 === 0 ? -4.6 : 4.6 }
}

export function simulate(clans, opts = {}) {
  const { leaderFinishAt = 93, lastFinishAt = 97.6, startAt = 38 } = opts
  const n = clans.length
  const L = TRACK.L
  const RACE_LEN = L * LAPS
  const rand = rng(20260831)

  /* 그리드는 각 리그의 자기 순위로 짠다. 한 줄에 DPL 한 대 · IPL 한 대 —
   * 1열이 DPL 1위와 IPL 1위다. 두 리그의 레이팅을 한 줄로 합쳐 세우지 않는 이유는,
   * 서로 다른 모집단의 레이팅을 맞비교할 근거가 없기 때문이다. 없는 순위를 지어내지 않는다.
   * 완주 순서는 그래서 "레이스의 결과"이지 사이트가 매긴 순위가 아니다. */
  const byLeague = lg => clans.map((c, i) => i).filter(i => clans[i].league === lg)
    .sort((a, b) => clans[a].rank - clans[b].rank)
  const dpl = byLeague('DPL'), ipl = byLeague('IPL')
  const order = []
  for (let r = 0; r < Math.max(dpl.length, ipl.length); r++) {
    if (dpl[r] !== undefined) order.push(dpl[r])
    if (ipl[r] !== undefined) order.push(ipl[r])
  }

  const car = order.map((ci, p) => {
    const g = gridSlot(p)
    // 페이스는 리그 안에서의 순위를 따른다. 폭이 크면 줄이 늘어져 그림이 안 된다
    const rk = clans[ci].rank
    return {
      ci, grid: p,
      s: g.s, d: g.d, v: 0,
      pace: 67.4 - rk * 0.42 + (rand() - 0.5) * 0.9,
      aggr: 0.45 + rand() * 0.55,     // 옆으로 나가 추월을 시도하는 성향
      phase: rand() * Math.PI * 2,    // 랩마다 조금씩 다른 페이스
      wantD: g.d,
      finished: 0,
      bump: 0,                        // 접촉 직후 잃는 속도
    }
  })
  const pairKey = (i, j) => (i < j ? i * 64 + j : j * 64 + i)
  const lastHit = new Map()

  const frames = []
  const contacts = []
  let t = 0
  let allDone = false
  let endT = 0

  while (t < 240) {
    // ── 각 차의 목표 속도와 진로
    for (let i = 0; i < n; i++) {
      const a = car[i]
      const done = a.s >= RACE_LEN

      // 코너에서는 느려진다 — 앞뒤 20m 의 방향 변화로 곡률을 잰다
      const curve = curvature(a.s)
      let target = a.pace * (1 - clamp(curve * 62, 0, 0.34))
      target *= 1 + Math.sin(a.phase + a.s / 340) * 0.035
      if (done) target *= 0.42                              // 체커기 뒤 쿨다운 랩

      // 앞차 찾기
      let ahead = null, gap = 1e9
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const b = car[j]
        const g = b.s - a.s
        if (g > 0 && g < gap && Math.abs(b.d - a.d) < 6.5) { gap = g; ahead = b }
      }

      if (ahead) {
        if (gap < 26) target *= 1.055                      // 슬립스트림
        if (gap < CAR_LEN * 1.9) {
          // 막혔다. 옆으로 나갈지 정한다
          const side = (a.d + ahead.d) / 2 > 0 ? -1 : 1
          const room = side > 0 ? HALF - a.d : a.d + HALF
          if (room > 5 && a.aggr > 0.5) a.wantD = clamp(ahead.d + side * 5.2, -HALF, HALF)
          else target = Math.min(target, ahead.v * 0.985)
        }
      } else if (Math.abs(a.wantD) > 0.6) {
        a.wantD *= 0.965                                    // 앞이 트이면 레이싱 라인으로 복귀
      }

      // 옆에 붙은 차를 피한다. 이게 없으면 두 대가 같은 자리를 밀고 들어가 계속 갈린다
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const b = car[j]
        if (Math.abs(b.s - a.s) > CAR_LEN * 2.2) continue
        const dd = a.d - b.d
        if (Math.abs(dd) < 3.4) {
          const away = dd === 0 ? (i < j ? -1 : 1) : Math.sign(dd)
          a.wantD = clamp(a.wantD + away * (3.4 - Math.abs(dd)) * 0.9, -HALF, HALF)
        }
      }

      target *= 1 - a.bump
      a.bump *= 0.94
      a.v += (target - a.v) * (a.v < target ? 1.8 : 3.2) * DT
      a.d += clamp(a.wantD - a.d, -9 * DT, 9 * DT)
      a.d = clamp(a.d, -HALF, HALF)
      a.s += a.v * DT
    }

    // ── 접촉: 같은 자리에 두 대가 겹치면 튕긴다
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = car[i], b = car[j]
        if (a.s >= RACE_LEN || b.s >= RACE_LEN) continue
        if (Math.abs(a.s - b.s) < CAR_LEN * 0.8 && Math.abs(a.d - b.d) < 1.9) {
          const push = a.d < b.d ? -1 : 1
          a.d = clamp(a.d + push * 1.5, -HALF, HALF)
          b.d = clamp(b.d - push * 1.5, -HALF, HALF)
          a.wantD = a.d; b.wantD = b.d
          a.bump = Math.max(a.bump, 0.10); b.bump = Math.max(b.bump, 0.13)
          // 한 번의 접촉이 프레임마다 중복 기록되지 않게 쌍마다 쿨다운을 둔다
          const key = pairKey(i, j)
          if (t - (lastHit.get(key) ?? -99) > 2.5) {
            lastHit.set(key, t)
            contacts.push({ t, s: (a.s + b.s) / 2, d: (a.d + b.d) / 2, a: a.ci, b: b.ci })
          }
        }
      }
    }

    for (const a of car) if (!a.finished && a.s >= RACE_LEN) a.finished = t

    if (t % (1 / REC_HZ) < DT) {
      frames.push(car.map(a => ({ ci: a.ci, s: a.s, d: a.d, v: a.v })))
    }
    if (!allDone && car.every(a => a.finished)) allDone = true
    if (allDone && !endT) endT = t
    if (endT && t - endT > 12) break
    t += DT
  }

  // ── 시간축을 연출에 맞춘다.
  // 선두가 leaderFinishAt, 꼴찌가 lastFinishAt 에 들어오도록 통째로 늘리거나 줄인다.
  const fin = car.map(a => a.finished)
  const first = Math.min(...fin), last = Math.max(...fin)
  const scale = (lastFinishAt - leaderFinishAt) / Math.max(0.5, last - first)
  const mapTime = simT => simT <= first
    ? startAt + (simT / first) * (leaderFinishAt - startAt)
    : leaderFinishAt + (simT - first) * scale

  const recs = frames.map((f, k) => ({ t: mapTime(k / REC_HZ), cars: f }))
  const finishOrder = car.map(a => ({ ci: a.ci, grid: a.grid, t: mapTime(a.finished) }))
    .sort((x, y) => x.t - y.t)

  return {
    recs, contacts: contacts.map(c => ({ ...c, t: mapTime(c.t) })),
    finishOrder, raceLen: RACE_LEN, lapLen: L,
    startAt, leaderFinishAt: mapTime(first), lastFinishAt: mapTime(last),
  }
}

/** s 지점의 곡률 (1/m). 코너 감속에 쓴다 */
function curvature(s) {
  const { pts, N, L } = TRACK
  const step = L / N
  const i = Math.round(((s % L) + L) % L / step)
  const g = (k) => { const m = ((k % N) + N) % N; return [pts[m * 2], pts[m * 2 + 1]] }
  const p0 = g(i - 8), p1 = g(i), p2 = g(i + 8)
  const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0])
  const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0])
  let da = a2 - a1
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2
  return Math.abs(da) / (step * 8)
}

/** 표를 t 로 선형보간해 그 순간의 22대 상태를 낸다 */
export function sampleRace(race, t) {
  const { recs } = race
  if (t <= recs[0].t) return recs[0].cars
  const lastRec = recs[recs.length - 1]
  if (t >= lastRec.t) return lastRec.cars
  let lo = 0, hi = recs.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; (recs[m].t <= t ? lo = m : hi = m) }
  const u = (t - recs[lo].t) / (recs[hi].t - recs[lo].t || 1)
  return recs[lo].cars.map((a, i) => {
    const b = recs[hi].cars[i]
    return { ci: a.ci, s: lerp(a.s, b.s, u), d: lerp(a.d, b.d, u), v: lerp(a.v, b.v, u) }
  })
}

/** 그 순간의 순위 (앞선 거리 순) */
export function standings(cars) {
  return cars.map((c, i) => ({ ...c, i })).sort((a, b) => b.s - a.s)
}
