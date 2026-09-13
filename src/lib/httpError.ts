// A tiny typed error so service functions can signal the right HTTP status
// (404, 409, ...) without reaching into `res` directly -- they just throw,
// and errorHandler.ts turns it into a response.
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
