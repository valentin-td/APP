import { useRef, useLayoutEffect, useEffect } from 'react';
import './LiquidTabBar.css';

/* ==========================================================================
   VIBRATION (haptique)
   - Android / Chrome : navigator.vibrate
   - iPhone (Safari / PWA, iOS 17.4+) : astuce du <input type="checkbox" switch>,
     qui déclenche le retour haptique natif quand on le "clique" par code.
   ========================================================================== */
let hapticLabel = null;
export function haptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
      return;
    }
  } catch (e) { /* ignore */ }
  try {
    if (!hapticLabel) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      document.head.appendChild(label);
      hapticLabel = label;
    }
    hapticLabel.click();
  } catch (e) { /* ignore */ }
}

/* ==========================================================================
   BARRE D'ONGLETS "LIQUID GLASS"
   - clic simple sur un onglet : la lentille glisse dessus (ressort) + vibration
   - appui maintenu + glissement : la lentille grossit, suit le doigt, agrandit
     les icônes ; au relâchement elle se pose sur l'onglet choisi
   Props :
     items       [{ key, label, icon, badge, onSelect }]
     activeIndex index de l'onglet actif
   ========================================================================== */
const ROW_H = 54;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function LiquidTabBar({ items, activeIndex }) {
  const rowRef = useRef(null);
  const lensRef = useRef(null);
  const innerRef = useRef(null);
  const cloneRef = useRef(null);
  const tabRefs = useRef([]);
  const itemsRef = useRef(items);
  const activeRef = useRef(activeIndex);
  const engine = useRef(null);

  itemsRef.current = items;
  activeRef.current = activeIndex;

  useLayoutEffect(() => {
    const row = rowRef.current;
    const lens = lensRef.current;
    const inner = innerRef.current;
    const clone = cloneRef.current;
    if (!row || !lens || !inner || !clone) return undefined;

    const count = () => itemsRef.current.length;
    const s = {
      cx: 0, vx: 0, targetCx: 0,          // position horizontale de la lentille (centre)
      press: 0, pv: 0, pressTarget: 0,    // 0 = pilule au repos, 1 = lentille "attrapée"
      dragging: false, moved: false, startX: 0,
      hover: activeRef.current, rest: activeRef.current,
      rowW: 0, tabW: 0, left: 0, raf: 0, last: 0,
    };
    engine.current = s;

    const centerOf = (i) => (i + 0.5) * s.tabW;

    const measure = () => {
      s.rowW = row.offsetWidth;
      s.left = row.getBoundingClientRect().left;
      s.tabW = s.rowW / Math.max(1, count());
      inner.style.width = s.rowW + 'px';
      clone.style.width = s.rowW + 'px';
    };

    const apply = () => {
      const speed = Math.abs(s.vx);
      const grow = Math.max(s.press, Math.min(1, speed / 900) * 0.85);
      const stretch = Math.min(speed / 60, 12);
      const W = s.tabW - 8 + 26 * grow + stretch;
      const H = ROW_H + 22 * grow - stretch * 0.3;
      const L = s.cx - W / 2;
      const T = (ROW_H - H) / 2;
      const amt = clamp(grow, 0, 1);

      lens.style.width = W + 'px';
      lens.style.height = H + 'px';
      lens.style.transform = `translate3d(${L}px, ${T}px, 0)`;
      lens.style.setProperty('--amt', amt.toFixed(3));
      lens.classList.toggle('is-lit', amt > 0.02);   // le filtre "verre" ne s'active que lorsque la lentille est levée
      inner.style.transform = `translate3d(${-L}px, ${-T}px, 0)`;
      clone.style.transform = `scale(${1 + 0.17 * grow})`;
      clone.style.transformOrigin = `${s.cx}px ${ROW_H / 2}px`;

      // Les onglets recouverts par la lentille s'effacent : c'est la copie agrandie qui les remplace
      const tabs = tabRefs.current;
      for (let i = 0; i < tabs.length; i++) {
        const el = tabs[i];
        if (!el) continue;
        const a = i * s.tabW;
        const overlap = Math.max(0, Math.min(a + s.tabW, L + W) - Math.max(a, L)) / (s.tabW || 1);
        el.style.opacity = String(1 - amt * clamp(overlap * 1.15, 0, 1));
      }
    };

    // Animation à ressorts (léger rebond, effet "liquide")
    const step = (now) => {
      let dt = s.last ? (now - s.last) / 1000 : 1 / 60;
      s.last = now;
      dt = Math.min(dt, 0.05);
      const h = 1 / 240;
      while (dt > 1e-6) {
        const d = Math.min(h, dt);
        dt -= d;
        s.vx += (420 * (s.targetCx - s.cx) - 28 * s.vx) * d;
        s.cx += s.vx * d;
        s.pv += (330 * (s.pressTarget - s.press) - 22 * s.pv) * d;
        s.press += s.pv * d;
      }
      apply();
      const settled =
        Math.abs(s.targetCx - s.cx) < 0.05 && Math.abs(s.vx) < 0.5 &&
        Math.abs(s.pressTarget - s.press) < 0.002 && Math.abs(s.pv) < 0.01;
      if (settled) {
        s.cx = s.targetCx; s.press = s.pressTarget; s.vx = 0; s.pv = 0;
        apply();
        s.raf = 0; s.last = 0;
      } else {
        s.raf = requestAnimationFrame(step);
      }
    };
    const kick = () => {
      if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(step); }
    };
    s.kick = kick;

    const idxAt = (clientX) => clamp(Math.floor((clientX - s.left) / s.tabW), 0, count() - 1);

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      measure();
      s.dragging = true;
      s.moved = false;
      s.startX = e.clientX;
      s.hover = idxAt(e.clientX);
      s.pressTarget = 1;
      s.targetCx = centerOf(s.hover);
      try { row.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      kick();
    };

    const onMove = (e) => {
      if (!s.dragging) return;
      if (!s.moved && Math.abs(e.clientX - s.startX) > 5) s.moved = true;
      const idx = idxAt(e.clientX);
      if (idx !== s.hover) { s.hover = idx; haptic(); }
      s.targetCx = s.moved
        ? clamp(e.clientX - s.left, s.tabW / 2, s.rowW - s.tabW / 2)
        : centerOf(s.hover);
      kick();
    };

    const finish = (commit) => (e) => {
      if (!s.dragging) return;
      const wasMoved = s.moved;
      s.dragging = false;
      s.moved = false;
      s.pressTarget = 0;
      try { row.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (commit) {
        const idx = s.hover;
        if (!wasMoved && idx !== activeRef.current) haptic();
        s.rest = idx;
        s.targetCx = centerOf(idx);
        const it = itemsRef.current[idx];
        if (it && typeof it.onSelect === 'function') it.onSelect();
      } else {
        s.rest = activeRef.current;
        s.targetCx = centerOf(s.rest);
      }
      kick();
    };
    const onUp = finish(true);
    const onCancel = finish(false);
    const onContext = (e) => e.preventDefault();

    row.addEventListener('pointerdown', onDown);
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onCancel);
    row.addEventListener('contextmenu', onContext);

    // Position initiale (sans animation) + recalage si la taille change
    const snap = () => {
      measure();
      s.cx = s.targetCx = centerOf(s.dragging ? s.hover : s.rest);
      s.vx = 0;
      apply();
    };
    snap();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => snap());
      ro.observe(row);
    } else {
      window.addEventListener('resize', snap);
    }

    return () => {
      row.removeEventListener('pointerdown', onDown);
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', onUp);
      row.removeEventListener('pointercancel', onCancel);
      row.removeEventListener('contextmenu', onContext);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', snap);
      if (s.raf) cancelAnimationFrame(s.raf);
      engine.current = null;
    };
  }, []);

  // Quand l'onglet actif change ailleurs dans l'app (ex : fermeture du menu Outils), la lentille glisse vers lui
  useEffect(() => {
    const s = engine.current;
    if (!s || s.dragging) return;
    s.rest = activeIndex;
    s.targetCx = (activeIndex + 0.5) * s.tabW;
    s.kick();
  }, [activeIndex]);

  const renderTabs = (isClone) =>
    items.map((it, i) => (
      <div
        key={it.key}
        ref={isClone ? undefined : (el) => { tabRefs.current[i] = el; }}
        className={`lg-tab${!isClone && i === activeIndex ? ' is-active' : ''}`}
        role={isClone ? undefined : 'tab'}
        aria-selected={isClone ? undefined : i === activeIndex}
        aria-label={isClone ? undefined : it.label}
      >
        <span className="lg-icon">
          {it.badge && <span className="badge-ia-rouge"></span>}
          {it.icon}
        </span>
        <span className="lg-label">{it.label}</span>
      </div>
    ));

  return (
    <div ref={rowRef} className="lg-row" role="tablist">
      {renderTabs(false)}
      <div ref={lensRef} className="lg-lens" aria-hidden="true">
        <div className="lg-lens-shadow"></div>
        <div className="lg-lens-clip">
          <div className="lg-lens-rest"></div>
          <div ref={innerRef} className="lg-lens-inner">
            <div ref={cloneRef} className="lg-clone">{renderTabs(true)}</div>
          </div>
          <div className="lg-lens-glass"></div>
        </div>
      </div>
    </div>
  );
}
