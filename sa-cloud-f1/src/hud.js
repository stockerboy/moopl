/* 화면 좌표(HUD) 그리기 도구. 세로 9:16 과 가로 16:9 를 같은 코드로 담기 위해
 * 모든 치수를 u = min(W,H)/100 단위로 잡는다. */
import { C, FONT, rgba, clamp, lerp, easeOut } from './core.js'
import { roundRect, fit } from './draw.js'

export function layout(W, H) {
  const u = Math.min(W, H) / 100
  return { W, H, u, cx: W / 2, cy: H / 2, vertical: H > W }
}

export function text(ctx, str, x, y, o = {}) {
  const { size = 16, font = FONT.body, weight = 400, color = C.text,
          align = 'left', baseline = 'alphabetic', tracking = 0, alpha = 1, maxW = 0 } = o
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `${weight} ${size}px ${font}`
  ctx.textAlign = tracking ? 'left' : align
  ctx.textBaseline = baseline
  ctx.fillStyle = color
  let s = maxW ? fit(ctx, str, maxW) : str
  if (!tracking) { ctx.fillText(s, x, y); ctx.restore(); return ctx.measureText(s).width }
  // 자간을 벌릴 때는 글자를 하나씩 놓는다
  const chars = [...s]
  const w = chars.reduce((a, ch) => a + ctx.measureText(ch).width + tracking, -tracking)
  let px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  for (const ch of chars) { ctx.fillText(ch, px, y); px += ctx.measureText(ch).width + tracking }
  ctx.restore()
  return w
}

/** 좌측에 진홍 막대를 세운 라벨 — 사이트의 `.btn-line` 톤 */
export function kicker(ctx, str, x, y, u, o = {}) {
  const { alpha = 1, color = C.accent } = o
  ctx.save(); ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x, y - u * 1.1, u * 0.28, u * 1.5)
  ctx.restore()
  return text(ctx, str, x + u * 0.9, y, {
    size: u * 1.25, font: FONT.tech, weight: 700, color: C.meta,
    tracking: u * 0.16, alpha, baseline: 'alphabetic', ...o,
  })
}

/** 클랜마크 두 겹을 한 번에 */
export function drawMark(ctx, marks, key, x, y, size, alpha = 1) {
  const m = marks[key]
  if (!m) return
  ctx.save(); ctx.globalAlpha = alpha
  if (m.bg && m.bg.complete) ctx.drawImage(m.bg, x - size / 2, y - size / 2, size, size)
  if (m.front && m.front.complete) ctx.drawImage(m.front, x - size / 2, y - size / 2, size, size)
  ctx.restore()
}

/** IPL / DPL 뱃지 */
export function leagueBadge(ctx, league, x, y, u, alpha = 1) {
  const isIPL = league === 'IPL'
  const w = u * 5.2, h = u * 2.2
  ctx.save(); ctx.globalAlpha = alpha
  ctx.lineWidth = Math.max(1, u * 0.14)
  if (isIPL) {
    ctx.strokeStyle = 'rgba(246,237,237,0.85)'
    roundRect(ctx, x, y, w, h, u * 0.2); ctx.stroke()
    text(ctx, 'IPL', x + w / 2, y + h * 0.72, { size: u * 1.35, font: FONT.tech, weight: 700, color: C.strong, align: 'center', tracking: u * 0.14 })
  } else {
    ctx.fillStyle = C.accent
    roundRect(ctx, x, y, w, h, u * 0.2); ctx.fill()
    text(ctx, 'DPL', x + w / 2, y + h * 0.72, { size: u * 1.35, font: FONT.tech, weight: 700, color: '#0b0707', align: 'center', tracking: u * 0.14 })
  }
  ctx.restore()
  return w
}

/** 화면 전체 섬광 */
export function flash(ctx, W, H, amount, color = '255,255,255') {
  if (amount <= 0) return
  ctx.save()
  ctx.fillStyle = `rgba(${color},${clamp(amount)})`
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
}

/** 비네트 — 항상 마지막에 깐다 */
export function vignette(ctx, W, H, strength = 0.75) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore()
}

/** 필름 그레인 — t 로 패턴이 바뀌되 t 가 같으면 항상 같다 */
export function grain(ctx, W, H, t, amount = 0.035) {
  ctx.save()
  ctx.globalAlpha = amount
  const step = Math.max(3, Math.round(Math.min(W, H) / 260))
  const seed = Math.floor(t * 24)
  ctx.fillStyle = '#ffffff'
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0
      if ((h % 97) < 6) ctx.fillRect(x, y, step, step)
    }
  }
  ctx.restore()
}

/** 좌상단 순위 타워 — 클랜마크와 이름으로 지금 순위를 보여 준다 */
export function timingTower(ctx, L, clans, marks, rows, o = {}) {
  const { u } = L
  const { alpha = 1, title = 'LIVE ORDER', max = 10 } = o
  if (alpha <= 0.01) return
  const w = u * 27, rh = u * 3.3
  const x = u * 3.2, y = L.vertical ? u * 13 : u * 9
  ctx.save(); ctx.globalAlpha = alpha

  text(ctx, title, x, y - u * 1.1, { size: u * 1.15, font: FONT.tech, weight: 700, color: C.meta, tracking: u * 0.2 })
  for (let i = 0; i < Math.min(max, rows.length); i++) {
    const r = rows[i], clan = clans[r.ci]
    const ry = y + i * rh
    ctx.fillStyle = rgba(C.card, 0.82)
    roundRect(ctx, x, ry, w, rh - u * 0.35, u * 0.18); ctx.fill()
    // 왼쪽 3px 막대로 리그를 가른다 (사이트가 승패를 가르는 방식과 같다)
    ctx.fillStyle = clan.league === 'IPL' ? 'rgba(246,237,237,0.8)' : C.accent
    ctx.fillRect(x, ry, u * 0.32, rh - u * 0.35)
    text(ctx, String(i + 1).padStart(2, '0'), x + u * 1.5, ry + rh * 0.63,
      { size: u * 1.35, font: FONT.num, weight: 700, color: i === 0 ? C.accent : C.meta })
    drawMark(ctx, marks, clan.key, x + u * 5.2, ry + (rh - u * 0.35) / 2, u * 2.3)
    text(ctx, clan.name, x + u * 7.0, ry + rh * 0.63,
      { size: u * 1.35, font: FONT.body, weight: 700, color: C.strong, maxW: w - u * 8.2 })
  }
  ctx.restore()
}
