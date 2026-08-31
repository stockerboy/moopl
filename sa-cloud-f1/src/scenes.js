/* 장면 연출. render(ctx, t, S) 하나만 밖으로 낸다.
 * t 가 같으면 언제나 같은 그림이 나와야 한다 — 내부에 누적 상태를 두지 않는다. */
import {
  T, C, FONT, clamp, lerp, at, easeOut, easeIn, easeInOut, easeBack, pulse,
  smoothstep, hash2, rgba, trackAt, trackPos, TRACK,
} from './core.js'
import { drawTrack, drawCar, puff, sparks, roundRect } from './draw.js'
import { sampleRace, standings, gridSlot, LAPS } from './race.js'
import { text, kicker, drawMark, leagueBadge, flash, vignette, grain, timingTower } from './hud.js'

/* ── 카메라 ─────────────────────────────────────────────
 * cam.rot 은 "화면 위쪽이 가리킬 월드 방향". 차를 따라갈 때는 차의 진행방향을 넣는다. */
function applyCam(ctx, L, cam) {
  ctx.translate(L.cx + (cam.ox || 0), L.cy + (cam.oy || 0))
  ctx.rotate(-Math.PI / 2 - cam.rot)
  ctx.scale(cam.zoom, cam.zoom)
  ctx.translate(-cam.x, -cam.y)
}

/** 흔들림 — 충격·굉음에 쓴다. t 의 함수라 재현된다 */
function shake(t, amount, L) {
  if (amount <= 0) return { ox: 0, oy: 0 }
  const k = Math.floor(t * 40)
  return {
    ox: (hash2(k, 3) - 0.5) * amount * L.u,
    oy: (hash2(k, 71) - 0.5) * amount * L.u,
  }
}

/* ── 월드 ────────────────────────────────────────────── */
function drawWorld(ctx, S, t, cam, o = {}) {
  const { L, clans, marks } = S
  const { headlight = 0, smokeAlpha = 1, carAlpha = 1 } = o
  ctx.save()
  applyCam(ctx, L, cam)
  drawTrack(ctx, t)

  const cars = carsAt(S, t)
  // 타이어 자국 — 출발 직후에만
  const launch = at(t, T.lights[1], T.lights[1] + 2.2)
  if (launch > 0 && launch < 1) {
    ctx.save(); ctx.globalAlpha = (1 - launch) * 0.5; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.45
    for (const c of cars) {
      const p = trackPos(c.s, c.d)
      const q = trackPos(c.s - 7, c.d)
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    }
    ctx.restore()
  }

  // 차 — 카메라에서 먼 것부터 그린다
  const withDist = cars.map(c => {
    const p = trackPos(c.s, c.d)
    return { c, p, dist: Math.hypot(p.x - cam.x, p.y - cam.y) }
  }).sort((a, b) => b.dist - a.dist)

  for (const { c, p } of withDist) {
    const clan = clans[c.ci]
    ctx.save()
    ctx.translate(p.x, p.y); ctx.rotate(p.heading)
    drawCar(ctx, clan, marks, { alpha: carAlpha, headlight, showDecals: cam.zoom > 16 })
    ctx.restore()
    // 속도감 — 빠를수록 뒤로 끌리는 잔상
    if (c.v > 18 && cam.zoom > 9) {
      ctx.save()
      ctx.globalAlpha = clamp((c.v - 18) / 60) * 0.2 * carAlpha
      ctx.translate(p.x, p.y); ctx.rotate(p.heading)
      ctx.fillStyle = rgba(clan.color, 0.55)
      ctx.beginPath(); ctx.moveTo(-2.2, -0.55); ctx.lineTo(-2.2 - c.v * 0.075, 0); ctx.lineTo(-2.2, 0.55); ctx.closePath()
      ctx.fill(); ctx.restore()
    }
  }

  // 출발 연기
  if (smokeAlpha > 0 && launch > 0 && launch < 1) {
    for (const c of cars) {
      for (let k = 0; k < 5; k++) {
        const age = clamp(launch * 2.2 - k * 0.16)
        if (age <= 0 || age >= 1) continue
        const p = trackPos(c.s - 5 - k * 2.4, c.d + (hash2(c.ci * 7 + k, 11) - 0.5) * 2.4)
        puff(ctx, p.x, p.y, age, 3.4 * smokeAlpha)
      }
    }
  }

  // 접촉 불꽃
  for (const ct of S.race.contacts) {
    const age = (t - ct.t) / 0.55
    if (age <= 0 || age >= 1) continue
    const p = trackPos(ct.s, ct.d)
    sparks(ctx, p.x, p.y, p.heading, age, 1)
    puff(ctx, p.x, p.y, age * 0.9, 2.2, 'rgba(150,140,138,')
  }

  ctx.restore()
}

/** 그 순간 22대의 상태. 출발 전에는 그리드에 세워 둔다 */
function carsAt(S, t) {
  if (t < T.lights[1]) {
    return S.race.recs[0].cars.map(c => ({ ...c, v: 0 }))
  }
  return sampleRace(S.race, t)
}

/** 현재 순위 (선두부터) */
function orderAt(S, t) { return standings(carsAt(S, t)) }

/* ── 1. 스타팅 그리드 ─────────────────────────────────── */
function sceneGrid(ctx, S, t) {
  const { L, clans, marks } = S
  const u = at(t, T.grid[0], T.grid[1])
  const gc = trackPos(-52, 0)
  const cam = {
    x: gc.x, y: gc.y, rot: trackAt(-52).heading,
    zoom: lerp(9.5, 13.5, easeInOut(u)) * (L.u / 10.8),
  }
  drawWorld(ctx, S, t, cam, { smokeAlpha: 0 })

  const a1 = at(t, 0.5, 2.0), a2 = at(t, 1.4, 3.0)
  kicker(ctx, 'SA CLOUD · CLAN GRAND PRIX', L.u * 4, L.u * (L.vertical ? 12 : 10), L.u, { alpha: a1 })
  text(ctx, '22대가 그리드에 섰다', L.u * 4, L.u * (L.vertical ? 19 : 16), {
    size: L.u * 5.6, font: FONT.display, color: C.strong, alpha: a2,
  })
  text(ctx, 'IPL 11 · DPL 11 — 상위권 클랜 전원', L.u * 4, L.u * (L.vertical ? 23.4 : 20.2), {
    size: L.u * 2.0, font: FONT.body, weight: 700, color: C.meta, alpha: at(t, 2.2, 3.6),
  })

  // 하단에 11열 그리드 도표
  const a3 = at(t, 3.6, 5.4)
  if (a3 > 0) {
    const bx = L.u * 4, by = L.H - L.u * (L.vertical ? 26 : 16)
    text(ctx, 'STARTING GRID', bx, by - L.u * 1.6, { size: L.u * 1.15, font: FONT.tech, weight: 700, color: C.meta, tracking: L.u * 0.2, alpha: a3 })
    const grid = [...S.race.finishOrder].sort((x, y) => x.grid - y.grid)
    for (let r = 0; r < 11; r++) {
      const rowA = clamp(a3 * 14 - r)
      if (rowA <= 0) continue
      const y = by + r * L.u * 2.1
      for (let side = 0; side < 2; side++) {
        const g = grid[r * 2 + side]; if (!g) continue
        const clan = clans[g.ci]
        const x = bx + side * L.u * 21
        ctx.save(); ctx.globalAlpha = rowA
        drawMark(ctx, marks, clan.key, x + L.u * 0.9, y - L.u * 0.5, L.u * 1.8)
        text(ctx, clan.name, x + L.u * 2.4, y, { size: L.u * 1.35, font: FONT.body, weight: 700, color: C.text, maxW: L.u * 16 })
        ctx.restore()
      }
    }
  }
  vignette(ctx, L.W, L.H, 0.62)
}

/* ── 2. 클랜 소개 : 마크와 클랜명이 보이게 한 대씩 ─────── */
function sceneRollcall(ctx, S, t) {
  const { L, clans, marks } = S
  const [t0, t1] = T.rollcall
  const grid = [...S.race.finishOrder].sort((x, y) => x.grid - y.grid)
  const per = (t1 - t0) / 22
  const idx = clamp(Math.floor((t - t0) / per), 0, 21)
  const local = (t - t0) / per - idx           // 0..1 이 한 대의 시간
  const g = grid[idx]
  const clan = clans[g.ci]
  const slot = gridSlot(g.grid)
  const p = trackPos(slot.s, slot.d)

  // 카메라: 해당 차를 크게. 컷마다 살짝 다른 각도로 들어간다
  const jitter = (hash2(idx * 13, 5) - 0.5)
  const cam = {
    x: p.x, y: p.y,
    rot: trackAt(slot.s).heading + jitter * 0.5,
    zoom: lerp(46, 54, local) * (L.u / 10.8),
    oy: -L.u * (L.vertical ? 16 : 6),
  }
  drawWorld(ctx, S, t, cam, { smokeAlpha: 0 })

  // 컷 전환 — 앞뒤 0.08 구간에 검은 막
  const cut = Math.min(smoothstep(0, 0.09, local), 1 - smoothstep(0.9, 1, local))
  flash(ctx, L.W, L.H, (1 - cut) * 0.85, '6,5,5')

  const A = cut
  const panelH = L.u * (L.vertical ? 34 : 26)
  const py = L.H - panelH
  ctx.save(); ctx.globalAlpha = A * 0.94
  const gr = ctx.createLinearGradient(0, py - L.u * 8, 0, L.H)
  gr.addColorStop(0, 'rgba(6,5,5,0)'); gr.addColorStop(0.45, 'rgba(6,5,5,0.92)'); gr.addColorStop(1, 'rgba(6,5,5,0.98)')
  ctx.fillStyle = gr; ctx.fillRect(0, py - L.u * 8, L.W, panelH + L.u * 8)
  ctx.restore()

  const mx = L.u * (L.vertical ? 13 : 11)
  const my = py + L.u * (L.vertical ? 11 : 9)
  const slide = easeOut(clamp(local * 6)) * L.u * 2

  // 큰 클랜마크
  drawMark(ctx, marks, clan.key, mx, my - slide, L.u * 17, A)
  // 순번
  text(ctx, String(idx + 1).padStart(2, '0'), L.u * 4, py + L.u * 3.2, {
    size: L.u * 2.4, font: FONT.num, weight: 700, color: C.accent, alpha: A,
  })
  text(ctx, '/ 22', L.u * 8.2, py + L.u * 3.2, { size: L.u * 1.6, font: FONT.num, color: C.faint, alpha: A })

  const tx = mx + L.u * 11
  leagueBadge(ctx, clan.league, tx, my - L.u * 8.6 - slide, L.u, A)
  text(ctx, clan.name, tx, my - L.u * 2.4 - slide, {
    size: L.u * 5.4, font: FONT.display, color: C.strong, alpha: A, maxW: L.W - tx - L.u * 4,
  })
  text(ctx, `${clan.league} ${clan.rank}위`, tx, my + L.u * 1.6 - slide, {
    size: L.u * 1.7, font: FONT.body, weight: 700, color: C.meta, alpha: A,
  })
  // 사이트의 실제 수치
  const stat = (lab, val, x) => {
    text(ctx, lab, x, my + L.u * 6.4 - slide, { size: L.u * 1.1, font: FONT.tech, weight: 700, color: C.faint, tracking: L.u * 0.14, alpha: A })
    text(ctx, val, x, my + L.u * 9.6 - slide, { size: L.u * 2.6, font: FONT.num, weight: 700, color: C.text, alpha: A })
  }
  stat('RATING', String(clan.rating), tx)
  stat('WIN RATE', clan.win_rate.toFixed(1) + '%', tx + L.u * 13)
  stat('W / L', `${clan.win}-${clan.lose}`, tx + L.u * 26)

  // 진행 막대
  ctx.save(); ctx.globalAlpha = 0.9
  ctx.fillStyle = 'rgba(42,22,22,0.9)'; ctx.fillRect(0, L.H - L.u * 0.5, L.W, L.u * 0.5)
  ctx.fillStyle = C.accent; ctx.fillRect(0, L.H - L.u * 0.5, L.W * ((idx + local) / 22), L.u * 0.5)
  ctx.restore()

  vignette(ctx, L.W, L.H, 0.6)
}

/* ── 3. 레드라이트 → 라이트 아웃 ───────────────────────── */
function sceneLights(ctx, S, t) {
  const { L } = S
  const [t0, t1] = T.lights
  const gc = trackPos(-30, 0)
  const u = at(t, t0, t1)
  const cam = {
    x: gc.x, y: gc.y, rot: trackAt(-30).heading,
    zoom: lerp(13.5, 19, easeIn(u)) * (L.u / 10.8),
    ...shake(t, at(t, t1 - 0.9, t1) * 2.4, L),
  }
  drawWorld(ctx, S, t, cam, { smokeAlpha: 0 })

  // 라이트 5개: t0+1.2 부터 0.9초 간격으로 켜지고, t1-0.9 에 전부 꺼진다
  const lightsOut = t >= t1 - 0.9
  const onCount = lightsOut ? 0 : clamp(Math.floor((t - (t0 + 1.2)) / 0.9) + 1, 0, 5)
  const bw = L.u * 7, bh = L.u * 8.4, gap = L.u * 1.1
  const totalW = bw * 5 + gap * 4
  const bx = L.cx - totalW / 2, by = L.u * (L.vertical ? 22 : 9)
  ctx.save()
  ctx.globalAlpha = clamp(at(t, t0, t0 + 0.8) - at(t, t1 - 0.4, t1 + 0.5))
  for (let i = 0; i < 5; i++) {
    const x = bx + i * (bw + gap)
    ctx.fillStyle = 'rgba(10,8,8,0.92)'
    roundRect(ctx, x, by, bw, bh, L.u * 0.4); ctx.fill()
    ctx.strokeStyle = 'rgba(42,22,22,0.9)'; ctx.lineWidth = L.u * 0.14; ctx.stroke()
    const on = i < onCount
    for (let k = 0; k < 2; k++) {
      const cyv = by + bh * (0.3 + k * 0.4)
      if (on) {
        const gl = ctx.createRadialGradient(x + bw / 2, cyv, 0, x + bw / 2, cyv, bw * 0.62)
        gl.addColorStop(0, 'rgba(255,70,60,0.95)'); gl.addColorStop(1, 'rgba(217,43,43,0)')
        ctx.fillStyle = gl
        ctx.beginPath(); ctx.arc(x + bw / 2, cyv, bw * 0.62, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = on ? '#ff4a3c' : '#241414'
      ctx.beginPath(); ctx.arc(x + bw / 2, cyv, bw * 0.24, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()

  if (lightsOut) {
    const k = at(t, t1 - 0.9, t1 - 0.35)
    text(ctx, 'LIGHTS OUT', L.cx, by + bh + L.u * 7, {
      size: L.u * 6.2, font: FONT.brand, color: C.strong, align: 'center',
      alpha: (1 - at(t, t1 - 0.2, t1 + 0.6)), tracking: L.u * 0.4,
    })
    flash(ctx, L.W, L.H, pulse(k) * 0.5)
  } else {
    text(ctx, ['', '', 'FORMATION', 'ENGINES', 'READY', 'SET'][Math.min(5, onCount + 1)] || '', L.cx, by + bh + L.u * 6,
      { size: L.u * 2.2, font: FONT.tech, weight: 700, color: C.meta, align: 'center', tracking: L.u * 0.5 })
  }
  vignette(ctx, L.W, L.H, 0.75)
}

/* ── 4·5. 레이스 : 컷을 나눠 붙인다 ─────────────────────── */
const SHOTS = [
  { t0: 38.0, t1: 42.6, kind: 'launch' },
  { t0: 42.6, t1: 47.4, kind: 'wide' },
  { t0: 47.4, t1: 52.0, kind: 'chase' },
  { t0: 52.0, t1: 56.4, kind: 'contact' },
  { t0: 56.4, t1: 61.0, kind: 'wide' },
  { t0: 61.0, t1: 65.4, kind: 'midfield' },
  { t0: 65.4, t1: 70.0, kind: 'chase' },
  { t0: 70.0, t1: 75.0, kind: 'duel' },
  { t0: 75.0, t1: 79.4, kind: 'contact' },
  { t0: 79.4, t1: 84.0, kind: 'duel' },
]

function shotCam(S, t, shot) {
  const { L } = S
  const cars = carsAt(S, t)
  const ord = standings(cars)
  const u = at(t, shot.t0, shot.t1)
  const base = L.u / 10.8
  const of = (c, ahead, zoom) => {
    const p = trackPos(c.s + ahead, c.d * 0.6)
    return { x: p.x, y: p.y, rot: trackAt(c.s).heading, zoom: zoom * base }
  }
  switch (shot.kind) {
    case 'launch': {
      const c = ord[Math.min(6, ord.length - 1)]
      return of(c, 22, lerp(21, 13.5, easeOut(u)))
    }
    case 'wide': {
      const c = ord[Math.floor(ord.length / 2)]
      return of(c, 0, lerp(12.5, 10.5, u))
    }
    case 'chase': {
      const c = ord[0]
      return of(c, 12, lerp(27, 22, u))
    }
    case 'midfield': {
      const c = ord[Math.min(11, ord.length - 1)]
      return of(c, 7, lerp(21, 26, u))
    }
    case 'contact': {
      const mid = (shot.t0 + shot.t1) / 2
      const ct = S.race.contacts.reduce((best, x) =>
        Math.abs(x.t - mid) < Math.abs(best.t - mid) ? x : best, S.race.contacts[0])
      // 얽힌 두 대를 계속 따라간다. 고정 지점을 잡으면 차가 지나간 뒤 빈 노면만 남는다
      const pair = cars.filter(c => c.ci === ct.a || c.ci === ct.b)
      const ref = pair.length ? pair : [ord[Math.floor(ord.length / 2)]]
      const ms = ref.reduce((a, c) => a + c.s, 0) / ref.length
      const md = ref.reduce((a, c) => a + c.d, 0) / ref.length
      const p = trackPos(ms + 2, md * 0.7)
      // 접촉 순간에 확 들어갔다가 물러난다
      const k = clamp(1 - Math.abs(t - ct.t) / 2.2)
      return { x: p.x, y: p.y, rot: trackAt(ms).heading, zoom: lerp(24, 44, easeOut(k)) * base }
    }
    case 'duel': {
      // 그 순간 가장 가까이 붙은 두 대
      let a = ord[0], b = ord[1], best = 1e9
      for (let i = 0; i < ord.length - 1; i++) {
        const g = Math.abs(ord[i].s - ord[i + 1].s) + Math.abs(ord[i].d - ord[i + 1].d) * 0.4
        if (g < best) { best = g; a = ord[i]; b = ord[i + 1] }
      }
      const p = trackPos((a.s + b.s) / 2 + 3, (a.d + b.d) / 2 * 0.7)
      return { x: p.x, y: p.y, rot: trackAt(a.s).heading, zoom: lerp(40, 50, u) * base }
    }
  }
}

function sceneRace(ctx, S, t) {
  const { L, clans, marks } = S
  const shot = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1]
  const cam = shotCam(S, t, shot)
  // 접촉 순간 화면이 흔들린다
  let sh = 0
  for (const ct of S.race.contacts) {
    const k = clamp(1 - Math.abs(t - ct.t) / 0.4)
    sh = Math.max(sh, k * 1.6)
  }
  Object.assign(cam, shake(t, sh, L))
  drawWorld(ctx, S, t, cam, {})

  // 컷 전환 막
  const local = (t - shot.t0)
  flash(ctx, L.W, L.H, clamp(1 - local / 0.12) * 0.8, '6,5,5')

  const ord = orderAt(S, t)
  timingTower(ctx, L, clans, marks, ord, { alpha: 0.95, max: L.vertical ? 8 : 10 })

  // 랩 카운터
  const lap = clamp(Math.floor(ord[0].s / S.race.lapLen) + 1, 1, LAPS)
  const rx = L.W - L.u * 4, ry = L.vertical ? L.u * 13 : L.u * 9
  text(ctx, 'LAP', rx, ry, { size: L.u * 1.2, font: FONT.tech, weight: 700, color: C.meta, align: 'right', tracking: L.u * 0.2 })
  text(ctx, `${lap}/${LAPS}`, rx, ry + L.u * 4.2, { size: L.u * 4.4, font: FONT.num, weight: 700, color: C.strong, align: 'right' })

  // 선두 속도계
  const kmh = Math.round(ord[0].v * 3.6 * 1.55)
  text(ctx, String(kmh), rx, L.H - L.u * (L.vertical ? 11 : 7), { size: L.u * 4.6, font: FONT.num, weight: 700, color: C.accent, align: 'right' })
  text(ctx, 'KM/H', rx, L.H - L.u * (L.vertical ? 8.2 : 4.4), { size: L.u * 1.2, font: FONT.tech, weight: 700, color: C.meta, align: 'right', tracking: L.u * 0.2 })

  if (shot.kind === 'contact' || shot.kind === 'duel') {
    const lab = shot.kind === 'contact' ? 'CONTACT' : 'WHEEL TO WHEEL'
    const a = pulse(at(t, shot.t0, shot.t1)) * 1.4
    text(ctx, lab, L.cx, L.u * (L.vertical ? 9 : 6), {
      size: L.u * 2.0, font: FONT.tech, weight: 700, color: C.accent, align: 'center',
      tracking: L.u * 0.5, alpha: clamp(a),
    })
  }
  vignette(ctx, L.W, L.H, 0.55)
}

/* ── 6. 파이널 랩 → 피니시 (마지막 차까지) ─────────────── */
function sceneFinal(ctx, S, t) {
  const { L, clans, marks } = S
  const [t0, t1] = T.final
  const ord = orderAt(S, t)
  const leader = ord[0]

  // 앞부분은 선두 추적, 뒤로 갈수록 결승선 고정 카메라로 넘어간다
  const toLine = smoothstep(t0 + 4.5, t0 + 6.5, t)
  const lp = trackPos(leader.s + 10, leader.d * 0.6)
  const fp = trackPos(-14, 0)
  const cam = {
    x: lerp(lp.x, fp.x, toLine), y: lerp(lp.y, fp.y, toLine),
    rot: lerp(trackAt(leader.s).heading, trackAt(-14).heading, toLine),
    zoom: lerp(24, 15, toLine) * (L.u / 10.8),
  }
  // 차가 결승선을 지날 때마다 한 번씩 툭
  let sh = 0
  for (const f of S.race.finishOrder) sh = Math.max(sh, clamp(1 - Math.abs(t - f.t) / 0.22) * 0.9)
  Object.assign(cam, shake(t, sh, L))
  drawWorld(ctx, S, t, cam, {})

  // FINAL LAP 배너
  const fa = pulse(at(t, t0, t0 + 3.0))
  if (fa > 0.01) {
    ctx.save(); ctx.globalAlpha = clamp(fa * 1.6)
    ctx.fillStyle = C.accent
    ctx.fillRect(0, L.cy - L.u * 5, L.W, L.u * 10)
    text(ctx, 'FINAL LAP', L.cx, L.cy + L.u * 2.2, {
      size: L.u * 7.2, font: FONT.brand, color: '#0b0707', align: 'center', tracking: L.u * 0.5,
    })
    ctx.restore()
  }

  // 몇 대가 들어왔는지 — 마지막 한 대까지 세어 준다
  const inCount = S.race.finishOrder.filter(f => t >= f.t).length
  if (t > t0 + 5) {
    const a = at(t, t0 + 5, t0 + 6)
    text(ctx, 'FINISHED', L.cx, L.H - L.u * (L.vertical ? 17 : 12), {
      size: L.u * 1.3, font: FONT.tech, weight: 700, color: C.meta, align: 'center', tracking: L.u * 0.35, alpha: a,
    })
    text(ctx, `${String(inCount).padStart(2, '0')} / 22`, L.cx, L.H - L.u * (L.vertical ? 11 : 6.5), {
      size: L.u * 7.0, font: FONT.num, weight: 700,
      color: inCount === 22 ? C.accent : C.strong, align: 'center', alpha: a,
    })
    // 방금 들어온 차의 이름을 잠깐 띄운다
    const just = S.race.finishOrder.filter(f => t >= f.t && t - f.t < 1.1).pop()
    if (just) {
      const clan = clans[just.ci]
      const ja = clamp(1 - (t - just.t) / 1.1)
      drawMark(ctx, marks, clan.key, L.cx - L.u * 12, L.H - L.u * (L.vertical ? 23 : 17), L.u * 4.4, ja)
      text(ctx, clan.name, L.cx - L.u * 9, L.H - L.u * (L.vertical ? 22 : 16), {
        size: L.u * 2.6, font: FONT.body, weight: 700, color: C.strong, alpha: ja,
      })
    }
  }
  if (inCount === 22) {
    const a = at(t, S.race.lastFinishAt, S.race.lastFinishAt + 0.8)
    text(ctx, '전 차량 완주', L.cx, L.u * (L.vertical ? 20 : 12), {
      size: L.u * 4.2, font: FONT.display, color: C.strong, align: 'center', alpha: a,
    })
  }
  timingTower(ctx, L, clans, marks, ord, { alpha: 0.9 * (1 - toLine * 0.35), max: L.vertical ? 6 : 8 })
  vignette(ctx, L.W, L.H, 0.7)
}

/* ── 7. 굉음과 연기 ──────────────────────────────────── */
/** 화면을 채우는 연기. u=0 없음 → u=1 가득 */
function smokeField(ctx, L, t, u, seedBase = 0) {
  if (u <= 0) return
  ctx.save()
  const N = 90
  for (let i = 0; i < N; i++) {
    const r1 = hash2(i * 37 + seedBase, 11), r2 = hash2(i * 91 + seedBase, 53), r3 = hash2(i * 13 + seedBase, 7)
    const drift = t * (0.35 + r3 * 0.5)
    const x = ((r1 + drift * 0.06) % 1) * L.W * 1.25 - L.W * 0.12
    const y = L.H * (0.15 + r2 * 0.95) - drift * L.u * 1.1 * (0.4 + r3)
    const born = r3 * 0.45
    const age = clamp((u - born) / (1 - born))
    if (age <= 0) continue
    const rad = L.u * (5 + r1 * 17) * (0.45 + age * 1.35)
    const a = Math.sin(clamp(age) * Math.PI) * 0.30 * u
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, `rgba(168,158,156,${a})`)
    g.addColorStop(0.45, `rgba(96,88,88,${a * 0.55})`)
    g.addColorStop(1, 'rgba(40,36,36,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

function sceneSmoke(ctx, S, t) {
  const { L, clans, marks } = S
  const [t0, t1] = T.smoke
  const fp = trackPos(-14, 0)
  const boom = at(t, t0, t0 + 1.3)
  const cam = {
    x: fp.x, y: fp.y, rot: trackAt(-14).heading,
    zoom: lerp(15, 11, easeOut(at(t, t0, t1))) * (L.u / 10.8),
    ...shake(t, (1 - boom) * 5.2 + pulse(boom) * 2.0, L),
  }
  const fade = 1 - smoothstep(t0 + 1.2, t0 + 5.2, t)
  drawWorld(ctx, S, t, cam, { carAlpha: fade, headlight: smoothstep(t0 + 2.5, t0 + 5, t) })

  // 굉음 — 충격파 링
  const bw = at(t, t0, t0 + 1.1)
  if (bw > 0 && bw < 1) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,220,200,${(1 - bw) * 0.6})`
    ctx.lineWidth = L.u * (1 + (1 - bw) * 5)
    ctx.beginPath(); ctx.arc(L.cx, L.cy, easeOut(bw) * Math.max(L.W, L.H) * 0.75, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
  flash(ctx, L.W, L.H, pulse(at(t, t0, t0 + 0.55)) * 0.9)
  flash(ctx, L.W, L.H, pulse(at(t, t0 + 0.1, t0 + 1.4)) * 0.25, '217,43,43')

  smokeField(ctx, L, t - t0, smoothstep(t0 + 0.3, t0 + 4.0, t))
  vignette(ctx, L.W, L.H, 0.8)
}

/* ── 8. 연기 속 헤드라이트가 SA 를 그린다 ──────────────── */
function seg(pts, n = 34) {
  // [x0,y0, cx,cy, x1,y1] 2차 베지에 목록을 점으로 편다
  const out = []
  for (const s of pts) {
    for (let i = 0; i <= n; i++) {
      const u = i / n, v = 1 - u
      out.push([
        v * v * s[0] + 2 * v * u * s[2] + u * u * s[4],
        v * v * s[1] + 2 * v * u * s[3] + u * u * s[5],
      ])
    }
  }
  return out
}
const PATH_S = seg([
  [0.88, 0.20, 0.88, 0.02, 0.50, 0.02],
  [0.12, 0.02, 0.12, 0.27, 0.50, 0.50],
  [0.88, 0.72, 0.88, 0.98, 0.50, 0.98],
  [0.12, 0.98, 0.12, 0.80, 0.12, 0.76],
])
const PATH_A = seg([
  [0.04, 0.99, 0.27, 0.50, 0.50, 0.02],
  [0.73, 0.50, 0.96, 0.99, 0.96, 0.99],
])
const PATH_ABAR = seg([[0.24, 0.66, 0.50, 0.66, 0.76, 0.66]])

/** 궤적을 progress 까지 긋고 끝에 헤드라이트를 놓는다 */
function beam(ctx, pts, progress, box, o = {}) {
  const { width = 3, color = '255,246,232', glow = 1, head = true } = o
  if (progress <= 0) return
  const map = p => [box.x + p[0] * box.w, box.y + p[1] * box.h]
  const nEnd = clamp(progress) * (pts.length - 1)
  const iEnd = Math.floor(nEnd)
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'lighter'
  for (const pass of [{ w: width * 7, a: 0.09 * glow }, { w: width * 3.2, a: 0.2 * glow }, { w: width * 1.5, a: 0.38 * glow }, { w: width * 0.55, a: 1 }]) {
    ctx.beginPath()
    for (let i = 0; i <= iEnd; i++) {
      const [x, y] = map(pts[i])
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    if (iEnd + 1 < pts.length) {
      const u = nEnd - iEnd
      const a = map(pts[iEnd]), b = map(pts[iEnd + 1])
      ctx.lineTo(lerp(a[0], b[0], u), lerp(a[1], b[1], u))
    }
    ctx.strokeStyle = `rgba(${color},${pass.a})`
    ctx.lineWidth = pass.w
    ctx.stroke()
  }
  if (head && progress < 1) {
    const u = nEnd - iEnd
    const a = map(pts[iEnd]), b = map(pts[Math.min(iEnd + 1, pts.length - 1)])
    const hx = lerp(a[0], b[0], u), hy = lerp(a[1], b[1], u)
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, width * 9)
    g.addColorStop(0, 'rgba(255,255,250,0.95)')
    g.addColorStop(0.35, `rgba(${color},0.5)`)
    g.addColorStop(1, `rgba(${color},0)`)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(hx, hy, width * 9, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

/* 약자 네 글자의 자리. 화면 한가운데를 도는 네 점 */
const ACRO = [
  { ch: 'L', en: 'LEAGUE',     ko: '리그',     sub: '흩어진 리그를 한 곳에',        ang: -2.356 },
  { ch: 'O', en: 'OPERATIONS', ko: '운영',     sub: '대회 개설부터 순위 정산까지',  ang: -0.785 },
  { ch: 'U', en: 'USER',       ko: '유저',     sub: '선수 · 팀 · 클랜의 기록',      ang: 0.785 },
  { ch: 'D', en: 'DATA',       ko: '데이터',   sub: '원본 그대로의 전적과 지표',    ang: 2.356 },
]

/** "CLOUD" 를 한 줄로 놓았을 때 각 글자의 중심 x */
function rowLayout(ctx, str, size, cx, cy, font = FONT.brand) {
  ctx.save()
  ctx.font = `400 ${size}px ${font}`
  const chars = [...str]
  const widths = chars.map(c => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0)
  ctx.restore()
  let x = cx - total / 2
  return chars.map((ch, i) => {
    const c = { ch, x: x + widths[i] / 2, y: cy, w: widths[i] }
    x += widths[i]
    return c
  })
}

function sceneReveal(ctx, S, t) {
  const { L } = S
  const [t0] = T.reveal
  const u = L.u

  // 배경: 아직 연기가 남아 있다
  ctx.fillStyle = C.page; ctx.fillRect(0, 0, L.W, L.H)
  const smokeAmt = lerp(1, 0.22, smoothstep(t0 + 3.4, t0 + 8.0, t))
  smokeField(ctx, L, t - T.smoke[0], smokeAmt)

  /* ── SA : 헤드라이트 궤적 ── */
  const saBox = { w: u * 26, h: u * 30 }
  const saCX = L.cx, saCY = L.cy - u * (L.vertical ? 6 : 2)
  const boxS = { x: saCX - saBox.w * 1.02, y: saCY - saBox.h / 2, w: saBox.w, h: saBox.h }
  const boxA = { x: saCX + saBox.w * 0.02, y: saCY - saBox.h / 2, w: saBox.w, h: saBox.h }
  const pS = at(t, t0 + 0.3, t0 + 2.9)
  const pA = at(t, t0 + 1.4, t0 + 3.7)
  const pBar = at(t, t0 + 3.5, t0 + 4.1)
  // 궤적이 굳어 글자가 되면 빛줄기는 잦아든다
  const solid = smoothstep(t0 + 4.1, t0 + 5.4, t)
  const beamA = 1 - solid * 0.75
  // 락업으로 넘어가며 SA 는 작아져 왼쪽으로 물러난다
  const park = smoothstep(t0 + 5.4, t0 + 6.6, t)
  const parkScale = lerp(1, 0.42, park)
  const parkX = lerp(0, -u * 1, park)
  const parkY = lerp(0, -u * (L.vertical ? 30 : 24), park)

  ctx.save()
  ctx.translate(saCX + parkX, saCY + parkY)
  ctx.scale(parkScale, parkScale)
  ctx.translate(-saCX, -saCY)
  ctx.globalAlpha = beamA
  beam(ctx, PATH_S, pS, boxS, { width: u * 0.85 })
  beam(ctx, PATH_A, pA, boxA, { width: u * 0.85 })
  beam(ctx, PATH_ABAR, pBar, boxA, { width: u * 0.85, head: false })
  ctx.globalAlpha = 1
  if (solid > 0) {
    text(ctx, 'SA', saCX, saCY + saBox.h * 0.40, {
      size: u * 34, font: FONT.brand, color: C.strong, align: 'center', alpha: solid,
    })
  }
  ctx.restore()
  flash(ctx, L.W, L.H, pulse(at(t, t0 + 4.0, t0 + 4.8)) * 0.35)

  /* ── 약자 네 글자 ── */
  const beat0 = t0 + 6.4
  const BEAT = 1.7
  const R = u * (L.vertical ? 27 : 24)
  const scatterAt = beat0 + 4 * BEAT           // 네 글자가 모두 자리에 선 시각
  const connectAt = scatterAt + 1.4
  const linkAt = connectAt + 1.6
  const cloudAt = linkAt + 2.4

  const cloudRow = rowLayout(ctx, 'CLOUD', u * 15, L.cx, L.cy + u * (L.vertical ? 2 : 0))

  ACRO.forEach((a, i) => {
    const bt = beat0 + i * BEAT
    const inA = at(t, bt, bt + 0.3)
    if (inA <= 0) return
    const fly = at(t, bt + 1.05, bt + 1.75)              // 가운데 → 제자리
    const toCloud = at(t, cloudAt - 1.2, cloudAt)        // 제자리 → CLOUD 한 줄
    const home = { x: L.cx + Math.cos(a.ang) * R, y: L.cy + Math.sin(a.ang) * R }
    const target = cloudRow[i + 1]                       // C 다음이 L,O,U,D
    const x = lerp(lerp(L.cx, home.x, easeInOut(fly)), target.x, easeInOut(toCloud))
    const y = lerp(lerp(L.cy, home.y, easeInOut(fly)), target.y, easeInOut(toCloud))
    const size = lerp(lerp(u * 26, u * 11, easeInOut(fly)), u * 15, easeInOut(toCloud))
    // 자기 차례가 지나면 살짝 어두워졌다가, 연결될 때 다시 켜진다
    const lit = i === Math.floor((t - beat0) / BEAT) ? 1 : lerp(0.45, 1, at(t, linkAt + i * 0.28, linkAt + i * 0.28 + 0.4))
    text(ctx, a.ch, x, y + size * 0.36, {
      size, font: FONT.brand, align: 'center',
      color: toCloud > 0.5 ? C.strong : C.accent,
      alpha: inA * lerp(0.55, 1, lit),
    })
    // 자기 차례에만 단어와 설명을 붙인다
    const own = clamp(1 - Math.abs(t - (bt + 0.75)) / 0.95)
    if (own > 0.01) {
      text(ctx, a.en, L.cx, L.cy + u * 20, {
        size: u * 5.4, font: FONT.brand, color: C.strong, align: 'center', alpha: own, tracking: u * 0.3,
      })
      text(ctx, a.ko, L.cx, L.cy + u * 27, {
        size: u * 4.2, font: FONT.display, color: C.accent, align: 'center', alpha: own,
      })
      text(ctx, a.sub, L.cx, L.cy + u * 32, {
        size: u * 1.9, font: FONT.body, weight: 700, color: C.meta, align: 'center', alpha: own,
      })
    }
  })

  if (t > scatterAt && t < connectAt + 0.4) {
    text(ctx, '네 개의 축. 아직은 따로 놀고 있다.', L.cx, L.H - u * (L.vertical ? 22 : 14), {
      size: u * 2.2, font: FONT.body, weight: 700, color: C.meta, align: 'center',
      alpha: pulse(at(t, scatterAt, connectAt + 0.4)),
    })
  }

  /* ── CONNECT 단독 등장 → 선이 뻗어 네 글자를 잇는다 ── */
  const cIn = at(t, connectAt, connectAt + 0.45)
  if (cIn > 0) {
    const toCloud = at(t, cloudAt - 1.2, cloudAt)
    const target = cloudRow[0]
    const size = lerp(u * 22, u * 15, easeInOut(toCloud))
    const cx = lerp(L.cx, target.x, easeInOut(toCloud))
    const cy = lerp(L.cy, target.y, easeInOut(toCloud))

    // 연결선
    ACRO.forEach((a, i) => {
      const lp = at(t, linkAt + i * 0.28, linkAt + i * 0.28 + 0.5)
      if (lp <= 0) return
      const home = { x: L.cx + Math.cos(a.ang) * R, y: L.cy + Math.sin(a.ang) * R }
      const ex = lerp(cx, home.x, easeOut(lp)), ey = lerp(cy, home.y, easeOut(lp))
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = rgba(C.accent, 0.85 * (1 - toCloud))
      ctx.lineWidth = u * 0.32
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
      // 선을 타고 흐르는 펄스
      if (lp >= 1) {
        const k = ((t - (linkAt + i * 0.28)) * 1.5) % 1
        const px = lerp(cx, home.x, k), py = lerp(cy, home.y, k)
        const g = ctx.createRadialGradient(px, py, 0, px, py, u * 2.2)
        g.addColorStop(0, 'rgba(255,235,235,0.9)'); g.addColorStop(1, 'rgba(217,43,43,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, u * 2.2, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    })

    text(ctx, 'C', cx, cy + size * 0.36, {
      size, font: FONT.brand, align: 'center', color: toCloud > 0.5 ? C.strong : C.accent, alpha: cIn,
    })
    const own = clamp(1 - Math.abs(t - (connectAt + 0.7)) / 1.0)
    if (own > 0.01) {
      text(ctx, 'CONNECT', L.cx, L.cy + u * 20, {
        size: u * 5.4, font: FONT.brand, color: C.accent, align: 'center', alpha: own, tracking: u * 0.3,
      })
      text(ctx, '연결', L.cx, L.cy + u * 27, { size: u * 4.2, font: FONT.display, color: C.strong, align: 'center', alpha: own })
      text(ctx, '네 축을 하나로 잇는다', L.cx, L.cy + u * 32, {
        size: u * 1.9, font: FONT.body, weight: 700, color: C.meta, align: 'center', alpha: own,
      })
    }
  }
  flash(ctx, L.W, L.H, pulse(at(t, cloudAt - 0.25, cloudAt + 0.35)) * 0.55)
  vignette(ctx, L.W, L.H, 0.55)
}

/* ── 9. SA CLOUD 락업 ───────────────────────────────── */
function sceneLockup(ctx, S, t) {
  const { L } = S
  const [t0, t1] = T.lockup
  const u = L.u
  ctx.fillStyle = C.page; ctx.fillRect(0, 0, L.W, L.H)
  smokeField(ctx, L, t - T.smoke[0], lerp(0.22, 0.06, at(t, t0, t0 + 4)))

  const joinU = easeInOut(at(t, t0, t0 + 1.3))
  const cy = L.cy - u * (L.vertical ? 6 : 2)
  const full = rowLayout(ctx, 'SA CLOUD', u * 13, L.cx, cy)
  const cloudOnly = rowLayout(ctx, 'CLOUD', u * 15, L.cx, cy)

  // CLOUD 는 제자리에서 최종 위치로, SA 는 왼쪽에서 붙는다
  const cloudChars = full.slice(3)
  cloudChars.forEach((c, i) => {
    const from = cloudOnly[i]
    text(ctx, c.ch, lerp(from.x, c.x, joinU), cy + lerp(u * 15, u * 13, joinU) * 0.36, {
      size: lerp(u * 15, u * 13, joinU), font: FONT.brand, color: C.strong, align: 'center',
    })
  })
  const saChars = full.slice(0, 2)
  saChars.forEach((c, i) => {
    const fromX = c.x - u * 30
    const fromY = cy - u * (L.vertical ? 30 : 24)
    text(ctx, c.ch, lerp(fromX, c.x, joinU), lerp(fromY, cy, joinU) + u * 13 * 0.36, {
      size: u * 13, font: FONT.brand, color: C.accent, align: 'center', alpha: joinU,
    })
  })
  flash(ctx, L.W, L.H, pulse(at(t, t0 + 1.0, t0 + 1.7)) * 0.4)

  // 약자 풀이 — 사이트 소개문과 같은 문장이다
  const la = at(t, t0 + 1.5, t0 + 2.6)
  if (la > 0) {
    const parts = [['C', 'ONNECT'], ['L', 'EAGUE'], ['O', 'PERATIONS'], ['U', 'SER'], ['D', 'ATA']]
    const y = cy + u * 12
    ctx.save()
    ctx.font = `700 ${u * 1.9}px ${FONT.tech}`
    const widths = parts.map(p => ctx.measureText(p[0] + p[1]).width)
    const gap = u * 2.6
    const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)
    let x = L.cx - total / 2
    parts.forEach((p, i) => {
      const a = clamp(la * 5 - i * 0.7)
      text(ctx, p[0], x, y, { size: u * 1.9, font: FONT.tech, weight: 700, color: C.accent, alpha: a })
      const w0 = ctx.measureText(p[0]).width
      text(ctx, p[1], x + w0, y, { size: u * 1.9, font: FONT.tech, weight: 700, color: C.meta, alpha: a })
      x += widths[i] + gap
    })
    ctx.restore()
  }

  const ta = at(t, t0 + 3.0, t0 + 4.2)
  text(ctx, '서든어택 클랜전 기록 · 리그 · 래더', L.cx, cy + u * 22, {
    size: u * 3.4, font: FONT.display, color: C.strong, align: 'center', alpha: ta,
  })
  text(ctx, '흩어진 기록을 한 곳에서 본다', L.cx, cy + u * 27.5, {
    size: u * 2.0, font: FONT.body, weight: 700, color: C.meta, align: 'center', alpha: at(t, t0 + 3.6, t0 + 4.8),
  })

  // 하단 고지 — 이 레이스는 연출이지 순위가 아니다
  const na = at(t, t0 + 5.0, t0 + 6.0)
  text(ctx, '영상 속 레이스는 연출입니다. 클랜 순위·전적은 사이트의 실제 기록입니다.',
    L.cx, L.H - u * (L.vertical ? 9 : 5.5), {
      size: u * 1.35, font: FONT.body, weight: 400, color: C.faint, align: 'center', alpha: na * 0.9,
    })

  // 끝은 검게 닫는다
  flash(ctx, L.W, L.H, at(t, t1 - 1.0, t1) * 1.0, '6,5,5')
  vignette(ctx, L.W, L.H, 0.5)
}

/* ── 디스패처 ───────────────────────────────────────── */
export function render(ctx, t, S) {
  const { L } = S
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = C.page
  ctx.fillRect(0, 0, L.W, L.H)

  if (t < T.grid[1]) sceneGrid(ctx, S, t)
  else if (t < T.rollcall[1]) sceneRollcall(ctx, S, t)
  else if (t < T.lights[1]) sceneLights(ctx, S, t)
  else if (t < T.battle[1]) sceneRace(ctx, S, t)
  else if (t < T.final[1]) sceneFinal(ctx, S, t)
  else if (t < T.smoke[1]) sceneSmoke(ctx, S, t)
  else if (t < T.reveal[1]) sceneReveal(ctx, S, t)
  else sceneLockup(ctx, S, t)

  grain(ctx, L.W, L.H, t, 0.03)
  // 앞뒤 페이드
  flash(ctx, L.W, L.H, 1 - at(t, 0, 0.7), '6,5,5')
}
