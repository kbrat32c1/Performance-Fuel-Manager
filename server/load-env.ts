// Local runs read .env (Vercel injects environment variables itself). Imported first in
// index.ts because routes.ts reads process.env while it is being imported.
if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on variables already in the environment
  }
}
