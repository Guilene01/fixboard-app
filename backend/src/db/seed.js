const bcrypt = require('bcrypt');
const pool = require('./pool');
const { getInitials } = require('../utils/initials');

const TAGS = [
  'Kubernetes',
  'Docker',
  'CI/CD',
  'Terraform',
  'AWS',
  'Networking',
  'Monitoring/Observability',
  'Linux',
  'Git',
  'Security',
  'Ansible',
  'Python',
];

const TEST_USER = {
  name: 'Test Student',
  email: 'test@fixboard.dev',
  password: 'password123',
  role: 'student',
};

const TEST_INSTRUCTOR = {
  name: 'Test Instructor',
  email: 'instructor@fixboard.dev',
  password: 'password123',
  role: 'instructor',
};

async function seedTags() {
  for (const name of TAGS) {
    await pool.query(
      'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name]
    );
  }
}

async function seedUser({ name, email, password, role }) {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length > 0) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, avatar_initials)
     VALUES ($1, $2, $3, $4, $5)`,
    [name, email, passwordHash, role, getInitials(name)]
  );
}

async function seed() {
  await seedTags();
  await seedUser(TEST_USER);
  await seedUser(TEST_INSTRUCTOR);
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed complete.');
      console.log(`Student account    -> email: ${TEST_USER.email}, password: ${TEST_USER.password}`);
      console.log(`Instructor account -> email: ${TEST_INSTRUCTOR.email}, password: ${TEST_INSTRUCTOR.password}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = seed;
