/** Path legado UPRIT. NM producción es Postgres-only salvo opt-in explícito. */
export function isChatbotMongoPathEnabled(): boolean {
  return process.env['CHATBOT_MONGO_ENABLED'] === 'true';
}

export function assertMongoPathEnabled(): void {
  if (!isChatbotMongoPathEnabled()) {
    throw new Error(
      'MongoDB está aislado en NM. No se usa en producción. Para el path legado UPRIT define CHATBOT_MONGO_ENABLED=true y MONGODB_URI.',
    );
  }
}
