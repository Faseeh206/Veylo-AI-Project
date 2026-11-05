/**
 * SMART OFFICE — REACT BITS PRO ADAPTATION
 * Component: Gyroscope Cursor (Gyroscope Arrow with Inertial Orientation)
 *
 * An aerodynamic directional arrow cursor that dynamically banks and turns
 * in real-time toward its movement vector using angular velocity and LERP physics.
 *
 * Theme Colors:
 * - Dark Mode: Pure Radiant White (#ffffff) with luminous ambient depth.
 * - Light Mode: Deep Onyx / Black (#0f172a) with crisp architectural shadow.
 */

(function () {
  'use strict';

  // Only activate on devices with fine pointer (mouse/trackpad), not touchscreens
  if (typeof window === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    return;
  }

  // Respect accessibility preferences
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Prevent multiple initializations
  if (document.getElementById('gyroscope-cursor')) {
    return;
  }

  function initGyroscopeCursor() {
    const cursorRoot = document.createElement('div');
    cursorRoot.className = 'gyroscope-cursor';
    cursorRoot.id = 'gyroscope-cursor';
    cursorRoot.setAttribute('aria-hidden', 'true');

    cursorRoot.innerHTML = `
      <div class="gyro-ring-wrapper" id="gyro-ring">
        <svg class="gyro-ring-svg" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="18" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3.5 3.5" opacity="0.55" />
          <circle cx="22" cy="22" r="13" stroke="currentColor" stroke-width="0.75" opacity="0.3" />
          <!-- Cardinal Gyroscopic Calibrators -->
          <line x1="22" y1="1" x2="22" y2="4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <line x1="22" y1="39.5" x2="22" y2="43" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <line x1="1" y1="22" x2="4.5" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <line x1="39.5" y1="22" x2="43" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
      <div class="gyro-arrow-wrapper" id="gyro-arrow">
        <svg class="gyro-arrow-svg" viewBox="0 0 24 24" fill="none">
          <!-- Aerodynamic Prow with Recessed Stern -->
          <path d="M12 2.5L20 20L12 16.2L4 20L12 2.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <!-- Gyroscopic Central Core Pip -->
          <circle cx="12" cy="11.5" r="1.6" class="gyro-core-pip" />
        </svg>
      </div>
    `;

    document.body.appendChild(cursorRoot);
    document.body.classList.add('gyro-cursor-active');

    const arrowEl = document.getElementById('gyro-arrow');
    const ringEl = document.getElementById('gyro-ring');

    let mouseX = -100;
    let mouseY = -100;
    let cursorX = -100;
    let cursorY = -100;
    let ringX = -100;
    let ringY = -100;

    let currentAngle = -28; // Standard sleek resting slant
    let targetAngle = -28;
    let velocityX = 0;
    let velocityY = 0;
    let lastMoveTime = performance.now();
    let isVisible = false;

    // Linear interpolation
    const lerp = (start, end, factor) => start + (end - start) * factor;

    // Calculate shortest angular displacement across 360-degree boundary
    function normalizeAngleDiff(target, current) {
      let diff = (target - current) % 360;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return diff;
    }

    // Pointer move listener
    window.addEventListener('mousemove', (e) => {
      if (!isVisible) {
        isVisible = true;
        cursorRoot.classList.add('is-visible');
        cursorX = e.clientX;
        cursorY = e.clientY;
        ringX = e.clientX;
        ringY = e.clientY;
      }

      const prevMouseX = mouseX;
      const prevMouseY = mouseY;
      mouseX = e.clientX;
      mouseY = e.clientY;

      velocityX = mouseX - prevMouseX;
      velocityY = mouseY - prevMouseY;
      const speed = Math.hypot(velocityX, velocityY);

      lastMoveTime = performance.now();

      // Only reorient when moving with deliberate momentum
      if (speed > 1.2) {
        // 0 rad = right (+X), 90 deg offset aligns 0 deg to straight UP
        targetAngle = Math.atan2(velocityY, velocityX) * (180 / Math.PI) + 90;
      }
    }, { passive: true });

    // Window boundaries
    document.addEventListener('mouseenter', () => {
      isVisible = true;
      cursorRoot.classList.add('is-visible');
    });

    document.addEventListener('mouseleave', () => {
      isVisible = false;
      cursorRoot.classList.remove('is-visible');
    });

    // Tactile press response
    window.addEventListener('mousedown', () => {
      cursorRoot.classList.add('is-clicking');
    });

    window.addEventListener('mouseup', () => {
      cursorRoot.classList.remove('is-clicking');
    });

    // Interactive element hover detection via delegation
    document.addEventListener('mouseover', (e) => {
      const target = e.target;
      if (!target || !(target instanceof Element)) return;

      // Text input field check
      if (target.matches('input[type="text"], input[type="password"], input[type="email"], input[type="number"], input[type="search"], textarea')) {
        cursorRoot.classList.add('is-text-input');
        return;
      }

      // Clickable elements
      const clickable = target.closest('button, a, select, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], .tab-btn, .btn, .action-btn, .kpi-card, .menu-item, .chip, .badge[onclick], .segmented-item, .table-row');
      if (clickable) {
        cursorRoot.classList.add('is-hovering');
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target;
      if (!target || !(target instanceof Element)) return;

      if (target.matches('input[type="text"], input[type="password"], input[type="email"], input[type="number"], input[type="search"], textarea')) {
        cursorRoot.classList.remove('is-text-input');
      }

      const clickable = target.closest('button, a, select, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], .tab-btn, .btn, .action-btn, .kpi-card, .menu-item, .chip, .badge[onclick], .segmented-item, .table-row');
      if (clickable) {
        cursorRoot.classList.remove('is-hovering');
      }
    });

    // 60/120fps physics loop
    function render() {
      // Responsive follow for main arrow pointer
      cursorX = lerp(cursorX, mouseX, 0.42);
      cursorY = lerp(cursorY, mouseY, 0.42);

      // Elastic trailing lag for gyroscopic stabilizer ring
      ringX = lerp(ringX, mouseX, 0.16);
      ringY = lerp(ringY, mouseY, 0.16);

      const now = performance.now();
      const idleTime = now - lastMoveTime;

      // When resting for > 240ms, softly settle to classic -28deg slant
      if (idleTime > 240) {
        const restDiff = normalizeAngleDiff(-28, currentAngle);
        currentAngle += restDiff * 0.055;
      } else {
        // Fluid banking turn toward velocity vector
        const diff = normalizeAngleDiff(targetAngle, currentAngle);
        currentAngle += diff * 0.22;
      }

      // Aerodynamic velocity stretch
      const speed = Math.hypot(mouseX - cursorX, mouseY - cursorY);
      const stretch = Math.min(speed * 0.012, 0.26);
      const scaleY = 1 + stretch;
      const scaleX = 1 - stretch * 0.45;

      // GPU translate on composite layer
      cursorRoot.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;

      // Relative offset for trailing gyro ring
      const ringDeltaX = ringX - cursorX;
      const ringDeltaY = ringY - cursorY;
      ringEl.style.transform = `translate3d(${ringDeltaX}px, ${ringDeltaY}px, 0)`;

      // Arrow bank angle & stretch
      arrowEl.style.transform = `rotate(${currentAngle}deg) scale(${scaleX}, ${scaleY})`;

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGyroscopeCursor);
  } else {
    initGyroscopeCursor();
  }
})();
