/**
 * Adds a value to the list under `key`, creating it on first use. Pushes in place: copying the
 * list on every add (`[...list, value]`) is quadratic, which a large tenant's hundreds of
 * thousands of edges turn into seconds.
 */
export function appendTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
