// The page's one Jotai store. Client modules read and write it directly; components render from it
// through <Provider store={store}>.
import { createStore, type Atom } from "jotai";

export const store = createStore();

/** Call fn with every new value of an atom (and once now, with `immediate`). */
export function watch<T>(
  target: Atom<T>,
  fn: (value: T, previous: T | undefined) => void,
  { immediate = false } = {},
) {
  let previous = store.get(target);
  if (immediate) fn(previous, undefined);
  return store.sub(target, () => {
    const value = store.get(target);
    if (Object.is(value, previous)) return;
    const last = previous;
    previous = value;
    fn(value, last);
  });
}
