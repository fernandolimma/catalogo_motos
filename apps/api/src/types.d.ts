import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string; ver: number };
    user: { sub: string; email: string; role: string; ver?: number };
  }
}
