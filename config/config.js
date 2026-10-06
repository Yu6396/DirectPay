require('dotenv').config();

module.exports = {
  development: {
    username: "postgres",
    password: "5582710",
    database: "directPay",
    host: "127.0.0.1",
    dialect: "postgres",
    port: 5432
  },
//   test: {
//     url: process.env.DB_URL,
//     dialect: 'postgres',
//     dialectOptions: {
//       ssl: {
//         require: true,
//         rejectUnauthorized: false,
//       },
//     },
//   },
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
