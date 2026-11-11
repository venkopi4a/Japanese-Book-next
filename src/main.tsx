import { render } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import './styles.css';
import { App } from './App';
import { autoProfile, loadProfiles, rememberProfile, type Profile } from './app/profiles';
import { AppProvider } from './app/state';
import { ProfilePicker } from './ui/ProfilePicker';

function Root() {
  const [profile, setProfile] = useState<Profile | null>(() => autoProfile(loadProfiles()));
  const pick = (p: Profile) => { rememberProfile(p.id); setProfile(p); };
  const switchProfile = useCallback(() => setProfile(null), []);
  if (!profile) return <ProfilePicker onPick={pick} />;
  return <AppProvider key={profile.id} profile={profile} onSwitch={switchProfile}><App /></AppProvider>;
}

render(<Root />, document.getElementById('app')!);

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
