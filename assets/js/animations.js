// =====================================================================
// Amoyni — Animation Helpers (confetti wrapper)
// Requires assets/vendor/confetti.browser.js to be loaded first
// (exposes window.confetti).
// =====================================================================
window.AmoyniFX = (function () {
  function fireConfetti(opts) {
    if (typeof window.confetti !== "function") return;
    const defaults = {
      particleCount: 90,
      spread: 70,
      startVelocity: 38,
      origin: { y: 0.6 },
      colors: ["#2563EB", "#7C3AED", "#22D3EE", "#FBBF24", "#16A34A"],
    };
    window.confetti(Object.assign({}, defaults, opts || {}));
  }

  function fireCelebration() {
    // Two bursts from either side, gaming-reward style
    fireConfetti({ angle: 60, origin: { x: 0.15, y: 0.65 } });
    setTimeout(function () {
      fireConfetti({ angle: 120, origin: { x: 0.85, y: 0.65 } });
    }, 180);
  }

  return { fireConfetti, fireCelebration };
})();
