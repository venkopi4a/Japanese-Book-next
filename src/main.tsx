import { render } from 'preact';
import './styles.css';
import { App } from './App';
import { AppProvider } from './app/state';

render(<AppProvider><App /></AppProvider>, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = document.createElement('div');
          bar.className = 'toast'; bar.setAttribute('role', 'status');
          bar.innerHTML = 'An update is ready <button>Reload</button>';
          bar.querySelector('button')!.addEventListener('click', () => { w.postMessage('SKIP_WAITING'); });
          document.body.appendChild(bar);
        }
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }).catch(() => { /* the app still works online without the offline worker */ });
}
