export const CSS = `
.lenslite {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 8, 12, 0.96);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .lenslite {
    background: rgba(14, 14, 20, 0.6);
    -webkit-backdrop-filter: blur(24px) saturate(1.6);
    backdrop-filter: blur(24px) saturate(1.6);
  }
  .lenslite__caption,
  .lenslite__counter,
  .lenslite__btn {
    background: rgba(40, 40, 55, 0.25);
    -webkit-backdrop-filter: blur(32px) saturate(1.8);
    backdrop-filter: blur(32px) saturate(1.8);
  }
  .lenslite__btn:hover {
    background: rgba(70, 70, 95, 0.45);
  }
}
.lenslite__stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.lenslite__track {
  position: absolute;
  inset: 0;
  will-change: transform;
}
.lenslite__track--animating {
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.lenslite__slide {
  position: absolute;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.lenslite__img {
  max-width: 100%;
  max-height: 100%;
  transform-origin: center center;
  transition: opacity 0.2s ease;
  will-change: transform;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.85), 0 6px 20px rgba(0, 0, 0, 0.6);
}
.lenslite__img--loading {
  opacity: 0;
}
.lenslite__img--glide {
  transition: transform 0.35s cubic-bezier(0.17, 0.89, 0.32, 1), opacity 0.2s ease;
}
.lenslite__spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 36px;
  height: 36px;
  margin: -18px 0 0 -18px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: rgba(255, 255, 255, 0.85);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  animation:
    lenslite-appear 0.2s ease 0.15s forwards,
    lenslite-spin 0.8s linear infinite;
}
@keyframes lenslite-appear {
  to { opacity: 1; }
}
@keyframes lenslite-spin {
  to { transform: rotate(360deg); }
}
.lenslite__error {
  color: rgba(255, 255, 255, 0.75);
  font: 14px/1.4 system-ui, sans-serif;
  text-align: center;
  padding: 0 24px;
}
.lenslite__btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: rgba(25, 25, 35, 0.75);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: opacity 0.2s ease, background 0.2s ease;
}
.lenslite__btn:hover {
  background: rgba(55, 55, 75, 0.85);
}
.lenslite__close {
  top: calc(12px + env(safe-area-inset-top, 0px));
  right: 12px;
}
.lenslite__prev {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}
.lenslite__next {
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}
.lenslite__counter {
  position: absolute;
  top: calc(19px + env(safe-area-inset-top, 0px));
  left: 16px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(25, 25, 35, 0.75);
  color: rgba(255, 255, 255, 0.92);
  font: 14px/1 system-ui, sans-serif;
  letter-spacing: 0.04em;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.35);
}
.lenslite__caption {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  max-width: calc(100% - 32px);
  box-sizing: border-box;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(25, 25, 35, 0.75);
  color: rgba(255, 255, 255, 0.92);
  font: 14px/1.4 system-ui, sans-serif;
  text-align: center;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: opacity 0.2s ease;
}
.lenslite__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.lenslite--chrome-hidden .lenslite__btn,
.lenslite--chrome-hidden .lenslite__counter,
.lenslite--chrome-hidden .lenslite__caption {
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .lenslite__track--animating,
  .lenslite__img,
  .lenslite__img--glide,
  .lenslite__btn,
  .lenslite__caption {
    transition: none;
  }
  .lenslite__spinner {
    animation: lenslite-appear 0.2s ease 0.15s forwards;
  }
}
`

/**
 * Injects the lenslite stylesheet into the document head exactly once.
 */
export function injectStyles(doc: Document = document): void {
  if (doc.head.querySelector('style[data-lenslite]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-lenslite', '')
  style.textContent = CSS
  doc.head.appendChild(style)
}
