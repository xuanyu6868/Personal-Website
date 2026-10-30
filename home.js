const items = Array.from(document.querySelectorAll('.journey-item'));
const output = document.querySelector('#journey-detail-text');
const list = document.querySelector('.hero__timeline-list');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let selected = items.find(item => item.classList.contains('is-active')) || items[0];
let displayed = selected;
let changeId = 0;
const marker = document.createElement('span');
marker.className = 'journey-marker';
marker.setAttribute('aria-hidden', 'true');
list.appendChild(marker);
list.classList.add('js-journey');
function placeMarker(item) {
  const dot = item.querySelector('i');
  const rect = dot.getBoundingClientRect();
  const origin = list.getBoundingClientRect();
  marker.style.transform = `translate(${rect.left - origin.left}px, ${rect.top - origin.top}px)`;
}
function showDetail(next) {
  if (output.dataset.requested === next) return;
  output.dataset.requested = next;
  const revision = ++changeId;
  output.getAnimations().forEach(animation => animation.cancel());
  if (reduced.matches || typeof output.animate !== 'function') { output.textContent = next; return; }
  const hide = output.animate([{opacity:1, transform:'translateY(0)'},{opacity:0, transform:'translateY(-4px)'}], {duration:110, easing:'ease-in', fill:'forwards'});
  hide.onfinish = () => {
    if (revision !== changeId) return;
    output.textContent = next;
    hide.cancel();
    output.animate([{opacity:0, transform:'translateY(4px)'},{opacity:1, transform:'translateY(0)'}], {duration:190, easing:'ease-out'});
  };
}
function activate(item, preview = false) {
  if (!item) return;
  displayed = item;
  items.forEach(entry => {
    entry.classList.toggle('is-active', entry === item);
    entry.setAttribute('aria-pressed', String(entry === selected));
  });
  marker.classList.toggle('is-preview', preview);
  placeMarker(item);
  showDetail(item.dataset.detail);
}
items.forEach(item => {
  item.addEventListener('click', () => { selected = item; activate(item); });
  item.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') activate(item, item !== selected); });
  item.addEventListener('focus', () => activate(item, item !== selected));
});
list.addEventListener('pointerleave', () => activate(selected));
list.addEventListener('focusout', event => { if (!list.contains(event.relatedTarget)) activate(selected); });
window.addEventListener('resize', () => placeMarker(displayed));
output.dataset.requested = output.textContent;
placeMarker(selected);
requestAnimationFrame(() => marker.classList.add('is-ready'));
if (!reduced.matches) {
  document.querySelectorAll('.metric-number').forEach(number => {
    const target = Number(number.dataset.target), duration = 1000;
    let start;
    function tick(time) { if (start === undefined) start = time; const progress = Math.min((time - start) / duration, 1); number.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3)))); if (progress < 1) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  });
}
