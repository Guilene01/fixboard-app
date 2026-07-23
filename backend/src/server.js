const app = require('./app');
const { port } = require('./config/env');
const runMigrations = require('./db/migrate');
const seed = require('./db/seed');

async function start() {
  await runMigrations();
  await seed();

  app.listen(port, () => {
    console.log(`FixBoard API listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
