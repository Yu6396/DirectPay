const {
  User,
  Wallet,
  Transaction,
  BillTransaction,
  sequelize,
} = require("../../models");

async function refundUser(userId, amount, txn) {
  let t;

  try {
    if (!txn?.transaction_id) {
      throw new Error("Bill transaction ID is required");
    }

    t = await sequelize.transaction();

    // Lock the bill transaction to prevent concurrent refunds
    const lockedTxn = await BillTransaction.findByPk(
      txn.transaction_id,
      {
        transaction: t,
        lock: t.LOCK.UPDATE,
      }
    );

    if (!lockedTxn) {
      throw new Error("Transaction not found");
    }

    // Ensure the bill belongs to this user
    if (lockedTxn.user_id !== userId) {
      throw new Error("Refund user does not match bill transaction");
    }

    // Prevent duplicate refunds
    if (lockedTxn.refunded) {
      await t.commit();
      t = null;

      console.log(
        `Transaction ${lockedTxn.transaction_ref} already refunded`
      );

      return false;
    }

    // Refund failed transactions only
    if (lockedTxn.status !== "failed") {
      throw new Error("Only failed bill transactions can be refunded");
    }

    // Use the amount recorded on the bill transaction
    const refundAmount = Number(lockedTxn.total_amount);

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new Error("Invalid recorded refund amount");
    }

    const user = await User.findByPk(userId, {
      transaction: t,
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Lock the wallet before updating its balance
    const wallet = await Wallet.findOne({
      where: { user_id: userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const currentBalance = Number(wallet.balance || 0);

    if (!Number.isFinite(currentBalance)) {
      throw new Error("Invalid wallet balance");
    }

    wallet.balance = currentBalance + refundAmount;

    await wallet.save({ transaction: t });

    // Record the refund credit
    await Transaction.create(
      {
        user_id: userId,
        wallet_id: wallet.wallet_id,
        amount: refundAmount,
        type: "credit",
        status: "successful",
        payment_reference: lockedTxn.transaction_ref,
      },
      { transaction: t }
    );

    // Mark the bill as refunded in the same transaction
    await lockedTxn.update(
      { refunded: true },
      { transaction: t }
    );

    await t.commit();
    t = null;

    console.log(
      `Refunded ₦${refundAmount} to user ${userId}`
    );

    return true;
  } catch (error) {
    if (t && !t.finished) {
      try {
        await t.rollback();
      } catch (rollbackError) {
        console.error("Refund rollback error:", rollbackError);
      }
    }

    throw error;
  }
}

module.exports = refundUser;