import * as vercelModule from '../backend/dist/vercel.js';

type HttpHandler = (request: Request) => Promise<Response>;

export const GET: HttpHandler = vercelModule.GET;
export const POST: HttpHandler = vercelModule.POST;
export const PUT: HttpHandler = vercelModule.PUT;
export const DELETE: HttpHandler = vercelModule.DELETE;
export const PATCH: HttpHandler = vercelModule.PATCH;
export const OPTIONS: HttpHandler = vercelModule.OPTIONS;
export const HEAD: HttpHandler = vercelModule.HEAD;
