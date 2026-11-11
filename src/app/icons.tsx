const P: Record<string, string> = {
  today: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  notebook: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 17h11"/>',
  practice: '<path d="M5 19l1-4L16 5l3 3L9 18z"/>',
  progress: '<path d="M5 19v-8M12 19V5M19 19v-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6"/>',
  gear: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
};
export function Icon({ name, size = 22, fill = false }: { name: keyof typeof P; size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] ?? '' }} />
  );
}

/** A five-petal cherry blossom. It is used for progress and rewards. */
export function Blossom({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style="display:block">
      <g fill="currentColor">{[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="12" cy="6.4" rx="3.5" ry="5.3" transform={`rotate(${r} 12 12)`} />)}</g>
      <circle cx="12" cy="12" r="2.1" style="fill:var(--eye,#C9442C)" opacity=".85" />
    </svg>
  );
}
