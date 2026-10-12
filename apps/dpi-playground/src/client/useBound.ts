import { useState } from "react";

/**
 * A form value bound one way to a source the server updates: the user's change shows at once and
 * stays until the source itself changes (a controlled input would snap back while the save is in flight).
 */
export function useBound<T>(source: T): [T, (value: T) => void] {
  const [chosen, setChosen] = useState<{ value: T }>();
  const [seen, setSeen] = useState(source);
  if (!Object.is(seen, source)) {
    setSeen(source);
    setChosen(undefined);
  }
  return [chosen ? chosen.value : source, (value) => setChosen({ value })];
}
