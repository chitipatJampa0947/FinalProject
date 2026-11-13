// Type-check adapter only; does not emulate the Deno runtime.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
};
