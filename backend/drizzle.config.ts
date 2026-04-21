import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/schemas/admin.schema.ts', './src/schemas/game.schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
  },
});
