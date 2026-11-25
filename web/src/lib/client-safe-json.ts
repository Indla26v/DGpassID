'use client';

// Client-side circular reference safety for DOM elements (e.g. HTMLCanvasElement with React Fiber nodes)
if (typeof window !== 'undefined') {
  try {
    // 1. Give HTMLCanvasElement and Element safe toJSON serialization to prevent circular fiber walking
    if (typeof HTMLCanvasElement !== 'undefined' && !(HTMLCanvasElement.prototype as any).toJSON) {
      (HTMLCanvasElement.prototype as any).toJSON = function () {
        return {
          tagName: 'CANVAS',
          width: this.width,
          height: this.height,
        };
      };
    }

    if (typeof Element !== 'undefined' && !(Element.prototype as any).toJSON) {
      (Element.prototype as any).toJSON = function () {
        return {
          tagName: this.tagName,
          id: this.id,
          className: this.className,
        };
      };
    }

    // 2. Wrap JSON.stringify with a circular reference fallback
    const nativeStringify = JSON.stringify;
    JSON.stringify = function (value: any, replacer?: any, space?: any) {
      try {
        return nativeStringify(value, replacer, space);
      } catch (err: any) {
        if (
          err?.message?.includes?.('circular') ||
          err?.message?.includes?.('Converting circular structure')
        ) {
          const seen = new WeakSet();
          return nativeStringify(
            value,
            (key, val) => {
              if (
                typeof key === 'string' &&
                (key.startsWith('__reactFiber') ||
                  key.startsWith('__reactInternalInstance') ||
                  key.startsWith('__reactContainer'))
              ) {
                return undefined;
              }
              if (typeof val === 'object' && val !== null) {
                if (typeof Element !== 'undefined' && val instanceof Element) {
                  return {
                    tagName: val.tagName,
                    id: val.id,
                    className: val.className,
                  };
                }
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
              }
              if (typeof replacer === 'function') {
                return replacer(key, val);
              }
              return val;
            },
            space
          );
        }
        throw err;
      }
    };
  } catch {
    // Silently continue if prototype patching is restricted
  }
}

export {};
