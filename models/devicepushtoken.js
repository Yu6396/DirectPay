"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class DevicePushToken extends Model {
    static associate(models) {
      DevicePushToken.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    }
  }

  DevicePushToken.init(
    {
      device_push_token_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      token: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      platform: {
        type: DataTypes.ENUM("ios", "android"),
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "DevicePushToken",
      tableName: "device_push_tokens",
      underscored: true,
    },
  );

  return DevicePushToken;
};