const KEY = 'skyburst:v1';

export function loadSaved() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full quota: the demo works fine without persistence.
  }
}
