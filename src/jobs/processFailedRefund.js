const { BillTransaction, User } = require("../../models");
const refundUser = require("../services/refundService");
const sendEmail = require("../services/emailService");
const { createNotification } = require("../services/NotificationService");

async function processFailedRefunds() {
  try {
    const failedTxns = await BillTransaction.findAll({
      where: {
        status: "failed",
        refunded: false,
      },
    });

    if (failedTxns.length === 0) {
      return;
    }

    console.log(
      `💰 Found ${failedTxns.length} failed transaction(s) awaiting refund`
    );

    for (const txn of failedTxns) {
      try {
        await refundUser(txn.user_id, txn.amount, txn);

        console.log(`✅ Failed transaction ${txn.transaction_ref} refunded`);

        const user = await User.findByPk(txn.user_id);

        if (!user) {
          console.error(`⚠️ User not found for ${txn.transaction_ref}`);
          continue;
        }

        // Email should NOT undo/fail the refund
        try {
          await sendEmail(
            user.email,
            "Refund Processed",
            {
              name: user.name,
              amount: txn.amount,
              category: txn.category_id,
              reference: txn.transaction_ref,
            },
            "refundProcessed"
          );
        } catch (emailError) {
          console.error(
            `⚠️ Refund email failed for ${txn.transaction_ref}:`,
            emailError.message
          );
        }

        // Notification should NOT undo/fail the refund
        try {
          await createNotification({
            user_id: user.user_id,
            title: "Payment failed",
            message: `Your payment of ₦${txn.amount} failed and has been refunded to your wallet.`,
            type: "transaction",
            transaction_id: txn.transaction_id,
            transaction_source: "bill",
          });
        } catch (notificationError) {
          console.error(
            `⚠️ Refund notification failed for ${txn.transaction_ref}:`,
            notificationError.message
          );
        }
      } catch (err) {
        console.error(
          `❌ Refund failed for ${txn.transaction_ref}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("❌ Process Failed Refunds Error:", err.message);
  }
}

module.exports = processFailedRefunds;