import { Fragment, type ReactNode } from 'react';

/** Renderiza `**negrita**` y `` `código` `` dentro de un texto traducido. */
export function Rich({ text }: { text: string }): ReactNode {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>))}</>;
}
