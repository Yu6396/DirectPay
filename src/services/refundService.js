const {
  User,
  Wallet,
  Transaction,
  BillTransaction,
  sequelize,
} = require("../../models");

async function refundUser(userId, amount, txn) {
  const t = await sequelize.transaction();

  try {
    // Re-fetch and lock the transaction row itself — this is the missing
    // guard. Without it, two concurrent cron runs can both pass the
    // refunded:false check done outside this function, then both credit
    // the wallet, since the wallet lock alone doesn't stop a second
    // call from proceeding once the first one commits and releases it.
    const lockedTxn = await BillTransaction.findByPk(txn.transaction_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!lockedTxn) {
      throw new Error("Transaction not found");
    }

    if (lockedTxn.refunded) {
      console.log(
        `ℹ️ Txn ${lockedTxn.transaction_ref} already refunded — skipping duplicate refund`,
      );
      await t.commit();
      return false;
    }

    const user = await User.findByPk(userId, {
      transaction: t,
    });

    if (!user) {
      throw new Error("User not found");
    }

    const wallet = await Wallet.findOne({
      where: {
        user_id: userId,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const refundAmount = Number(amount);

    wallet.balance = Number(wallet.balance) + refundAmount;

    await wallet.save({
      transaction: t,
    });

    await Transaction.create(
      {
        user_id: userId,
        wallet_id: wallet.wallet_id,
        amount: refundAmount,
        type: "credit",
        status: "successful",
        payment_reference: lockedTxn.transaction_ref,
      },
      {
        transaction: t,
      },
    );

    await lockedTxn.update(
      {
        refunded: true,
      },
      {
        transaction: t,
      },
    );

    await t.commit();

    console.log(`💰 Refunded ${refundAmount} to user ${userId}`);

    return true;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

module.exports = refundUser;