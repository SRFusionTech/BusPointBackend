/** True when MONGO_URI is set — notifications use Mongo; core data stays on Postgres. */
export function isMongoEnabled(): boolean {
  return Boolean(process.env.MONGO_URI?.trim());
}

export function getMongoUri(): string | undefined {
  const uri = process.env.MONGO_URI?.trim();
  return uri || undefined;
}
