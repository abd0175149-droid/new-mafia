import { connectDB, disconnectDB } from '../src/config/db.js';
import { activities } from '../src/schemas/admin.schema.js';

async function check() {
  const db = await connectDB();
  const all = await db.select({ id: activities.id, name: activities.name, driveLink: activities.driveLink }).from(activities);
  console.log(JSON.stringify(all, null, 2));
  await disconnectDB();
}

check().catch(console.error);
