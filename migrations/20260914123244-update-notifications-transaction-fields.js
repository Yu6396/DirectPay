"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("notifications", "transaction_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addColumn("notifications", "transaction_source", {
      type: Sequelize.ENUM("wallet", "bill"),
      allowNull: true,
    });

    // Rename existing enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_notifications_type"
      RENAME TO "enum_notifications_type_old";
    `);

    // Create new enum
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_notifications_type"
      AS ENUM ('transaction', 'security', 'promotion');
    `);

    // Remove old default before changing enum type
    await queryInterface.sequelize.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type" DROP DEFAULT;
    `);

    // Convert existing values
    await queryInterface.sequelize.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type"
      TYPE "enum_notifications_type"
      USING (
        CASE "type"::text
          WHEN 'system' THEN 'security'
          WHEN 'alert' THEN 'security'
          WHEN 'promo' THEN 'promotion'
          WHEN 'transaction' THEN 'transaction'
        END
      )::"enum_notifications_type";
    `);

    // Set new default
    await queryInterface.sequelize.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type"
      SET DEFAULT 'transaction';
    `);

    // Remove old enum
    await queryInterface.sequelize.query(`
      DROP TYPE "enum_notifications_type_old";
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "notifications",
      "transaction_id"
    );

    await queryInterface.removeColumn(
      "notifications",
      "transaction_source"
    );

    // Restore old enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_notifications_type"
      RENAME TO "enum_notifications_type_new";
    `);

    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_notifications_type"
      AS ENUM ('transaction', 'system', 'promo', 'alert');
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type" DROP DEFAULT;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type"
      TYPE "enum_notifications_type"
      USING (
        CASE "type"::text
          WHEN 'security' THEN 'system'
          WHEN 'promotion' THEN 'promo'
          WHEN 'transaction' THEN 'transaction'
        END
      )::"enum_notifications_type";
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type"
      SET DEFAULT 'system';
    `);

    await queryInterface.sequelize.query(`
      DROP TYPE "enum_notifications_type_new";
    `);
  },
};