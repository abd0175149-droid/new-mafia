const fs = require('fs');
const files = [
  'src/routes/locations.routes.ts',
  'src/routes/sounds.routes.ts',
  'src/routes/staff.routes.ts',
  'src/scripts/merge_players.ts',
  'src/scripts/recalculate_progression.ts',
  'src/services/booking.service.ts',
  'src/routes/dashboard.routes.ts',
  'src/routes/drive.routes.ts',
  'src/routes/foundational.routes.ts',
  'src/routes/auth.routes.ts',
  'src/routes/player-auth.routes.ts',
  'src/routes/player-notification.routes.ts',
  'src/routes/player.routes.ts',
  'src/routes/notifications.routes.ts',
  'src/routes/player-app.routes.ts'
];
for(const f of files) {
  if(fs.existsSync(f)) {
    let text = fs.readFileSync(f, 'utf8');
    text = text.replace(/\.set\(\{([\s\S]*?)\}\)/g, '.set({$1} as any)');
    text = text.replace(/\.values\(\{([\s\S]*?)\}\)/g, '.values({$1} as any)');
    text = text.replace(/\.values\(\[([\s\S]*?)\]\)/g, '.values([$1] as any)');
    fs.writeFileSync(f, text);
    console.log('Fixed ' + f);
  }
}
