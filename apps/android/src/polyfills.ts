import * as Crypto from 'expo-crypto';

// Polyfill TextEncoder and TextDecoder for curves
if (typeof global.TextEncoder === 'undefined') {
  (global as any).TextEncoder = class TextEncoder {
    encode(str: string): Uint8Array {
      const arr = [];
      for (let i = 0; i < str.length; i++) {
        arr.push(str.charCodeAt(i));
      }
      return new Uint8Array(arr);
    }
  };
}

if (typeof global.TextDecoder === 'undefined') {
  (global as any).TextDecoder = class TextDecoder {
    decode(arr: Uint8Array): string {
      let str = '';
      for (let i = 0; i < arr.length; i++) {
        str += String.fromCharCode(arr[i]);
      }
      return str;
    }
  };
}

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
