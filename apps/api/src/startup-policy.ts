export function mayContinueAfterDatabaseFailure(
  environment: "development" | "production" | "test",
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    environment !== "production" &&
    env.ALLOW_OFFLINE_API_BOOT === "true"
  );
}

