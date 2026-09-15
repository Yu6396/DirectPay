// models/Notification.js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }

  Notification.init(
    {
      notification_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("transaction", "security", "promotion"),
        defaultValue: "transaction",
      },
      status: {
        type: DataTypes.ENUM("unread", "read"),
        defaultValue: "unread",
      },
      transaction_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      transaction_source: {
        type: DataTypes.ENUM("wallet", "bill"),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Notification",
      tableName: "notifications",
      underscored: true,
    }
  );

  return Notification;
};