declare namespace Express {
  interface Request {
    /** Raw request body buffer captured before JSON parsing, used for HMAC signature verification. */
    rawBody?: Buffer;
    /** Authenticated agent identity, set by authenticateAgentJwt middleware. */
    agent?: {
      id: string;
      username: string;
      name: string;
      role: 'agent' | 'admin';
    };
  }
}
