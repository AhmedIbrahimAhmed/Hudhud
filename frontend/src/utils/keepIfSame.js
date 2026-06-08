// Returns `prev` when `next` is value-equal to it, so a functional setState can
// bail out of a re-render. Use for polled data that often comes back unchanged:
//   setItems((prev) => keepIfSame(prev, r.data.items));
export function keepIfSame(prev, next) {
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch {
    return next;
  }
}
