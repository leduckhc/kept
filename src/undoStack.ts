type UndoEntry = { label: string; undoFn: () => Promise<void> | void; timestamp: number };
const _stack: UndoEntry[] = [];
const MAX_STACK = 5;

export function pushUndo(label: string, undoFn: () => Promise<void> | void) {
  _stack.push({ label, undoFn, timestamp: Date.now() });
  if (_stack.length > MAX_STACK) _stack.shift();
}

export function popUndo(): UndoEntry | undefined {
  return _stack.pop();
}

export function hasUndo(): boolean {
  return _stack.length > 0;
}
