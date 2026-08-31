/* 그리기 레이어. 모든 함수는 좌표와 t 만 받는다 — 내부 상태를 두지 않는다. */
import { TRACK, trackAt, trackPos, TRACK_HALF_WIDTH as HW, C, FONT, rgba, clamp, lerp, hash2 } from './core.js'

/* ── 트랙 ─────────────────────────────────────────────── */
let trackPaths = null
function buildTrackPaths() {
  const outer = new Path2D(), inner = new Path2D(), ribbon = new Path2D()
  const N = 600, L = TRACK.L
  const edge = (side, path) => {
    for (let i = 0; i <= N; i++) {
      const p = trackPos((i / N) * L, side * HW)
      i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)
    }
    path.closePath()
  }
  edge(1, outer); edge(-1, inner)
  // 리본은 바깥 테두리를 시계방향, 안쪽을 반시계로 그려 evenodd 로 도넛을 만든다
  for (let i = 0; i <= N; i++) {
    const p = trackPos((i / N) * L, HW)
    i === 0 ? ribbon.moveTo(p.x, p.y) : ribbon.lineTo(p.x, p.y)
  }
  ribbon.closePath()
  for (let i = N; i >= 0; i--) {
    const p = trackPos((i / N) * L, -HW)
    i === N ? ribbon.moveTo(p.x, p.y) : ribbon.lineTo(p.x, p.y)
  }
  ribbon.closePath()
  trackPaths = { outer, inner, ribbon }
  return trackPaths
}

/** 커브가 심한 구간에만 커브(적백 연석)를 놓는다 */
let kerbSegs = null
function buildKerbs() {
  const segs = []
  const N = 900, L = TRACK.L
  let run = null
  for (let i = 0; i < N; i++) {
    const s = (i / N) * L
    const a = trackAt(s - 12).heading, b = trackAt(s + 12).heading
    let da = b - a
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    const turning = Math.abs(da) > 0.10
    if (turning) {
      if (!run) run = { s0: s, side: da > 0 ? 1 : -1 }
    } else if (run) { run.s1 = s; if (run.s1 - run.s0 > 25) segs.push(run); run = null }
  }
  if (run) { run.s1 = L; segs.push(run) }
  kerbSegs = segs
  return segs
}

export function drawTrack(ctx, t) {
  const P = trackPaths || buildTrackPaths()
  const K = kerbSegs || buildKerbs()

  // 런오프 (트랙 밖 회색 지대)
  ctx.save()
  ctx.lineWidth = HW * 2 + 26
  ctx.strokeStyle = '#070606'
  ctx.lineJoin = 'round'
  ctx.stroke(P.outer)
  ctx.restore()

  // 노면
  ctx.save()
  ctx.fillStyle = C.asphalt
  ctx.fill(P.ribbon, 'evenodd')
  ctx.restore()

  // 노면 결 — 진행방향으로 흐르는 옅은 줄
  ctx.save()
  ctx.clip(P.ribbon, 'evenodd')
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = C.asphalt2
  ctx.lineWidth = 3.2
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath()
    for (let i = 0; i <= 400; i++) {
      const p = trackPos((i / 400) * TRACK.L, k * 5.4)
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }
  ctx.restore()

  // 흰 경계선
  ctx.save()
  ctx.lineWidth = 0.75
  ctx.strokeStyle = 'rgba(226,214,214,0.62)'
  ctx.stroke(P.outer); ctx.stroke(P.inner)
  ctx.restore()

  // 커브 — 사이트 강조색(진홍)과 흰색을 번갈아
  ctx.save()
  ctx.lineWidth = 2.4
  for (const seg of K) {
    const side = seg.side
    for (let s = seg.s0; s < seg.s1; s += 6) {
      const a = trackPos(s, side * (HW - 1.2))
      const b = trackPos(Math.min(s + 6, seg.s1), side * (HW - 1.2))
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = (Math.round(s / 6) % 2) ? C.accent : '#e8dede'
      ctx.stroke()
    }
  }
  ctx.restore()

  drawFinishLine(ctx)
}

export function drawFinishLine(ctx) {
  const cols = 12, rows = 3
  ctx.save()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = -r * 1.5
      const d = -HW + (c / cols) * HW * 2
      const p = trackPos(s, d + HW / cols)
      ctx.save()
      ctx.translate(p.x, p.y); ctx.rotate(p.heading)
      ctx.fillStyle = ((r + c) % 2) ? '#f6eded' : '#151010'
      ctx.fillRect(-0.75, -HW / cols, 1.5, (HW * 2) / cols)
      ctx.restore()
    }
  }
  ctx.restore()
}

/* ── F1 카 (부감) ────────────────────────────────────────
 * 차는 +x 를 향해 놓는다. 길이 4.6m · 폭 2.0m.
 * 클랜마크는 엔진커버에, 클랜명은 리어윙에, 리그는 플로어에 새긴다.
 */
export function drawCar(ctx, clan, marks, opt = {}) {
  const { alpha = 1, showDecals = true, headlight = 0, damage = 0 } = opt
  const col = clan.color, dark = clan.color_dark, light = clan.color_light

  ctx.save()
  ctx.globalAlpha = alpha

  // 그림자
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.filter = 'blur(2px)'
  ctx.beginPath(); ctx.ellipse(-0.15, 0.3, 2.6, 1.25, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  const tyre = (x, y) => {
    ctx.fillStyle = '#151212'
    roundRect(ctx, x - 0.62, y - 0.3, 1.24, 0.6, 0.14); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.13)'
    roundRect(ctx, x - 0.56, y - 0.24, 0.55, 0.48, 0.12); ctx.fill()
  }
  tyre(-1.42, -0.98); tyre(-1.42, 0.98)   // 리어
  tyre(1.16, -0.95); tyre(1.16, 0.95)     // 프런트

  // 리어윙
  ctx.fillStyle = dark
  roundRect(ctx, -2.5, -1.16, 0.5, 2.32, 0.09); ctx.fill()
  ctx.fillStyle = rgba(col, 0.92)
  roundRect(ctx, -2.4, -1.06, 0.2, 2.12, 0.07); ctx.fill()

  // 바디 — 뒤가 넓고 앞으로 좁아진다
  ctx.beginPath()
  ctx.moveTo(-2.05, -0.80); ctx.lineTo(-0.55, -0.92)
  ctx.quadraticCurveTo(0.45, -0.88, 0.86, -0.30)
  ctx.lineTo(1.74, -0.16); ctx.lineTo(1.82, 0); ctx.lineTo(1.74, 0.16)
  ctx.lineTo(0.86, 0.30)
  ctx.quadraticCurveTo(0.45, 0.88, -0.55, 0.92)
  ctx.lineTo(-2.05, 0.80); ctx.closePath()
  const grad = ctx.createLinearGradient(0, -0.95, 0, 0.95)
  grad.addColorStop(0, light); grad.addColorStop(0.42, col); grad.addColorStop(1, dark)
  ctx.fillStyle = grad; ctx.fill()
  ctx.lineWidth = 0.07; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.stroke()

  // 사이드포드 흡기구
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(ctx, -0.6, -0.94, 0.95, 0.24, 0.07); ctx.fill()
  roundRect(ctx, -0.6, 0.70, 0.95, 0.24, 0.07); ctx.fill()

  // 콕핏 + 헤일로
  ctx.fillStyle = '#0a0808'
  ctx.beginPath(); ctx.ellipse(0.42, 0, 0.44, 0.3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = 'rgba(230,220,220,0.5)'; ctx.lineWidth = 0.08
  ctx.beginPath(); ctx.arc(0.42, 0, 0.4, -1.15, 1.15); ctx.stroke()

  // 프런트윙
  ctx.fillStyle = dark
  roundRect(ctx, 1.72, -1.2, 0.42, 2.4, 0.08); ctx.fill()
  ctx.fillStyle = rgba(col, 0.88)
  roundRect(ctx, 1.8, -1.1, 0.16, 2.2, 0.06); ctx.fill()

  if (showDecals) {
    // 엔진커버 위 클랜마크
    const m = marks[clan.key]
    if (m && m.front && m.front.complete) {
      const S = 1.28
      ctx.save()
      ctx.translate(-1.02, 0); ctx.rotate(Math.PI / 2)   // 마크를 진행방향으로 세운다
      if (m.bg && m.bg.complete) ctx.drawImage(m.bg, -S / 2, -S / 2, S, S)
      ctx.drawImage(m.front, -S / 2, -S / 2, S, S)
      ctx.restore()
    }
    // 리그 표기 — 플로어
    ctx.save()
    ctx.translate(-1.78, 0); ctx.rotate(Math.PI / 2)
    ctx.font = `700 0.5px ${FONT.tech}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const lw = ctx.measureText(clan.league).width
    ctx.fillStyle = clan.league === 'IPL' ? 'rgba(10,8,8,0.82)' : C.accent
    roundRect(ctx, -lw / 2 - 0.14, -0.32, lw + 0.28, 0.64, 0.1); ctx.fill()
    ctx.fillStyle = clan.league === 'IPL' ? '#f6eded' : '#0b0707'
    ctx.fillText(clan.league, 0, 0)
    ctx.restore()
    // 클랜명 — 리어윙
    ctx.save()
    ctx.translate(-2.32, 0); ctx.rotate(Math.PI / 2)
    ctx.font = `700 0.4px ${FONT.body}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(fit(ctx, clan.name, 2.0), 0, 0)
    ctx.restore()
  }

  if (damage > 0) {
    ctx.globalAlpha = alpha * damage
    ctx.fillStyle = 'rgba(20,16,16,0.8)'
    ctx.beginPath(); ctx.ellipse(1.5, -0.7, 0.4, 0.25, 0.4, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = alpha
  }

  if (headlight > 0) {
    ctx.globalAlpha = alpha * headlight
    const g = ctx.createRadialGradient(2.1, 0, 0.1, 2.1, 0, 9)
    g.addColorStop(0, 'rgba(255,248,235,0.55)'); g.addColorStop(1, 'rgba(255,248,235,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(2.0, -0.5); ctx.lineTo(11, -3.4); ctx.lineTo(11, 3.4); ctx.lineTo(2.0, 0.5)
    ctx.closePath(); ctx.fill()
  }

  ctx.restore()
}

/** 글자가 폭을 넘으면 잘라 준다 — 클랜명이 윙 밖으로 새는 것을 막는다 */
export function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ── 파티클 : 전부 t 의 함수다 ───────────────────────────── */

/** 타이어 연기 한 뭉치. age 0..1 */
export function puff(ctx, x, y, age, scale, tint = 'rgba(190,180,178,') {
  if (age <= 0 || age >= 1) return
  const r = scale * (0.35 + age * 1.8)
  const a = (1 - age) * (1 - age) * 0.42
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, tint + (a * 0.9) + ')')
  g.addColorStop(0.55, tint + (a * 0.45) + ')')
  g.addColorStop(1, tint + '0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

/** 접촉 불꽃 */
export function sparks(ctx, x, y, heading, age, scale = 1) {
  if (age <= 0 || age >= 1) return
  ctx.save()
  ctx.translate(x, y); ctx.rotate(heading)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 26; i++) {
    const r1 = hash2(i * 31, 7), r2 = hash2(i * 17, 91)
    const ang = Math.PI + (r1 - 0.5) * 1.9
    const spd = (0.6 + r2 * 2.6) * scale
    const px = Math.cos(ang) * spd * age * 9
    const py = Math.sin(ang) * spd * age * 9 + age * age * 5
    const a = (1 - age) * (0.9 - r1 * 0.4)
    ctx.fillStyle = `rgba(255,${180 + Math.floor(r2 * 60)},90,${a})`
    ctx.fillRect(px, py, 0.34 * scale, 0.34 * scale)
  }
  ctx.restore()
}
