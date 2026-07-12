import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

// Polyfill TextEncoder and TextDecoder unconditionally to avoid Hermes/React Native URIError bugs
(global as any).TextEncoder = class TextEncoder {
  encode(str: string): Uint8Array {
    const arr = [];
    for (let i = 0; i < str.length; i++) {
      arr.push(str.charCodeAt(i));
    }
    return new Uint8Array(arr);
  }
};

(global as any).TextDecoder = class TextDecoder {
  decode(arr: Uint8Array): string {
    if (!arr) return '';
    let out = "";
    let i = 0;
    while (i < arr.length) {
      let c = arr[i++];
      if (c < 128) {
        out += String.fromCharCode(c);
      } else if (c > 191 && c < 224) {
        if (i >= arr.length) { out += "\uFFFD"; break; }
        let c2 = arr[i++];
        out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
      } else if (c > 223 && c < 240) {
        if (i + 1 >= arr.length) { out += "\uFFFD"; break; }
        let c2 = arr[i++];
        let c3 = arr[i++];
        out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
      } else if (c > 239 && c < 248) {
        if (i + 2 >= arr.length) { out += "\uFFFD"; break; }
        let c2 = arr[i++];
        let c3 = arr[i++];
        let c4 = arr[i++];
        let u = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
        if (u < 0) {
          out += "\uFFFD";
        } else {
          out += String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 1023));
        }
      } else {
        out += "\uFFFD";
      }
    }
    return out;
  }
};

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Global hook to trace malformed decodeURIComponent calls
const origDecodeURIComponent = global.decodeURIComponent;
(global as any).decodeURIComponent = function (str: string) {
  try {
    return origDecodeURIComponent(str);
  } catch (e: any) {
    if (e instanceof URIError) {
      console.error('[Diagnostic Polyfill] decodeURIComponent failed on string:', JSON.stringify(str));
      console.error(e.stack);
    }
    throw e;
  }
};

// Polyfill global crypto and getRandomValues
if (typeof global.crypto === 'undefined') {
  global.crypto = {} as any;
}
if (typeof global.crypto.getRandomValues === 'undefined') {
  global.crypto.getRandomValues = (array: any) => {
    const randomBytes = Crypto.getRandomBytes(array.length);
    array.set(randomBytes);
    return array;
  };
}
