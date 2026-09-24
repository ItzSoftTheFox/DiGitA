const previews = {
  workspace: {
    src: './images/workspace.png',
    alt: 'DiGitA: branch, changed files, and the latest commit in a local repository.',
    caption: 'Your repository. Everything that matters in one place.',
  },
  dashboard: {
    src: './images/dashboard.png',
    alt: 'DiGitA: teams, rooms, and invitations to a shared space.',
    caption: 'A place for your team. Join in and start together.',
  },
  'conflict-radar': {
    src: './images/conflict-radar.png',
    alt: 'DiGitA Conflict Radar: warnings about files changed by multiple room members.',
    caption: 'Working on the same file? Find out early.',
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
