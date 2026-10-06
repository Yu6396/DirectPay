"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("device_push_tokens", {
      device_push_token_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      token: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true, // same physical device re-registering just updates its row
      },
      platform: {
        type: Sequelize.ENUM("ios", "android"),
        allowNull: false,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex("device_push_tokens", ["user_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("device_push_tokens");
  },
};