import type { Response } from 'express';

/**
 * Row 59. A stand-in Express response that records what a handler would send
 * instead of sending it.
 *
 * The export route reuses the exact handler that serves a report to the screen,
 * so the file and the screen cannot disagree about a figure. Every report
 * handler answers only through `res.status(...).json(...)`, so capturing those
 * two methods is the whole of it. Anything else a handler might reach for is a
 * no-op here rather than an absent-method crash; the route never writes through
 * this object, it only reads what was captured.
 */
export interface CapturedResponse {
  statusCode: number;
  body: unknown;
  sent: boolean;
}

export function createCaptureResponse(): { res: Response; captured: () => CapturedResponse } {
  const state: CapturedResponse = { statusCode: 200, body: undefined, sent: false };
  const response = {
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      state.body = payload;
      state.sent = true;
      return response;
    },
    send(payload: unknown) {
      state.body = payload;
      state.sent = true;
      return response;
    },
    setHeader() {
      return response;
    },
    header() {
      return response;
    },
    type() {
      return response;
    },
    end() {
      state.sent = true;
      return response;
    },
  };
  return { res: response as unknown as Response, captured: () => ({ ...state }) };
}
