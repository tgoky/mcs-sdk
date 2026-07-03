import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as dotenv from "dotenv";

// Explicitly load your environment variables from the .env file
dotenv.config({ path: ".env" });

if (!process.env.DIRECT_URL) {
  console.error("❌ Error: DIRECT_URL is not defined in your .env file!");
  process.exit(1);
}

// Open an unpooled, single-use migration connection
const migrationClient = postgres(process.env.DIRECT_URL, { max: 1, prepare: false });

async function runMigrations() {
  console.log("⏳ Connecting to Supabase and running migrations...");
  
  // Applies files sequentially from your generated drizzle/migrations folder
  await migrate(drizzle(migrationClient), { 
    migrationsFolder: "./drizzle/migrations" 
  });
  
  console.log("✅ Success! migration successful 🚀");
  
  // Cleanly close the database connection pool
  await migrationClient.end();
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error("❌ Migration failed with database error:");
  console.error(error);
  process.exit(1);
});