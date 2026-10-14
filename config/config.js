
require('dotenv').config();

console.log(
  'DB_URL configured:',
  Boolean(process.env.DB_URL)
);

module.exports = {
  development: {
    username: "postgres",
    password: process.env.DB_PASSWORD,
    database: "directPay",
    host: "127.0.0.1",
    dialect: "postgres",
    port: 5432
  },

  production: {
    url: process.env.DB_URL,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};