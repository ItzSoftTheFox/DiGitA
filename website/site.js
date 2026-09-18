const previews = {
  workspace: {
    src: './images/workspace.png',
    alt: 'DiGitA: přehled větve, změněných souborů a posledního commitu v lokálním repozitáři.',
    caption: 'Váš repozitář. Vše podstatné na jednom místě.',
  },
  dashboard: {
    src: './images/dashboard.png',
    alt: 'DiGitA: přehled týmů, místností a pozvánek do společného prostoru.',
    caption: 'Váš tým má své místo. Připojte se a začněte společně.',
  },
  'conflict-radar': {
    src: './images/conflict-radar.png',
    alt: 'DiGitA Conflict Radar: upozornění na soubory upravované více členy místnosti.',
    caption: 'Společný soubor? Dozvíte se o něm včas.',
  },
};
const image = document.querySelector('#preview-image');
const caption = document.querySelector('#preview-caption');
const buttons = [...document.querySelectorAll('[data-preview]')];
for (const button of buttons) {
  button.addEventListener('click', () => {
    const preview = previews[button.dataset.preview];
    if (!preview) return;
    for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
    image.classList.remove('preview-change');
    image.src = preview.src;
    image.alt = preview.alt;
    caption.textContent = preview.caption;
    requestAnimationFrame(() => image.classList.add('preview-change'));
  });
}
// Essential content is visible without JavaScript. Only off-screen sections are revealed.
const motion = matchMedia('(prefers-reduced-motion: reduce)');
if (!motion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.remove('reveal-await');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08 });
  for (const item of document.querySelectorAll('.reveal')) {
    if (item.getBoundingClientRect().top > innerHeight) item.classList.add('reveal-await');
    observer.observe(item);
  }
  motion.addEventListener('change', (event) => {
    if (event.matches) {
      observer.disconnect();
      document.querySelectorAll('.reveal-await').forEach((item) => item.classList.remove('reveal-await'));
    }
  });
}
