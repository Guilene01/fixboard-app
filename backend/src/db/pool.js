const { Pool } = require('pg');
const { databaseUrl } = require('../config/env');

const pool = new Pool({ connectionString: databaseUrl });

module.exports = pool;
