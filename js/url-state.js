// url-state.js — Parse and serialize URL query params with section prefixes.
// Convention: ret_* for §1 Retrieval, mod_* for §2 Modifier.

const URL_STATE = {
  /** Read params for one section. Returns {key: value} (without prefix). */
  read(prefix) {
    const params = new URLSearchParams(location.search);
    const out = {};
    for (const [k, v] of params) {
      if (k.startsWith(prefix + '_')) {
        out[k.slice(prefix.length + 1)] = v;
      }
    }
    return out;
  },

  /** Write params for one section. Preserves other sections' params + the hash. */
  write(prefix, sectionState) {
    const params = new URLSearchParams(location.search);
    // Drop existing keys with this prefix
    [...params.keys()].forEach(k => {
      if (k.startsWith(prefix + '_')) params.delete(k);
    });
    // Add the new ones
    for (const [k, v] of Object.entries(sectionState)) {
      if (v !== null && v !== undefined && v !== '') {
        params.set(prefix + '_' + k, v);
      }
    }
    const search = params.toString();
    const newUrl = location.pathname + (search ? '?' + search : '') + location.hash;
    history.replaceState(null, '', newUrl);
  },
};
