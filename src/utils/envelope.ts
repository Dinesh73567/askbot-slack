import type { Envelope } from '../types/index.js';

export const ok = <T>(data: T): Envelope<T> => ({
  success: true,
  data,
  error: null,
});

export const fail = <T>(error: string): Envelope<T> => ({
  success: false,
  data: null,
  error,
});
