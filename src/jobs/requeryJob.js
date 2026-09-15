const { BillTransaction, User } = require("../../models");
const { requery } = require("../services/vtPassServices");
const refundUser = require("../services/refundService");
const sendEmail = require("../services/emailService");
const { createNotification } = require("../services/NotificationService");

async function processRequery() {
  try {
    const pendingTxns = await BillTransaction.findAll({
      where: {
        status: "pending",
      },
    });

    console.log(`🔎 Found ${pendingTxns.length} pending transaction(s)`);

    for (const txn of pendingTxns) {
      try {
        console.log(`⏳ Requerying VTpass transaction: ${txn.transaction_ref}`);

        const resp = await requery(txn.transaction_ref);

        if (!resp.success || !resp.data) {
          console.log(
            `⚠️ No valid requery response for ${txn.transaction_ref}`,
          );

          continue;
        }

        console.log(
          "🔎 VTpass requery response:",
          txn.transaction_ref,
          JSON.stringify(resp.data, null, 2),
        );

        /*
         * VTpass status can come from either:
         *
         * resp.data.code
         *
         * or:
         *
         * resp.data.content.transactions.status
         */
        const vtCode = resp.data.code;

        const vtStatus = resp.data.content?.transactions?.status?.toLowerCase();

        let newStatus = "pending";

        /*
         * SUCCESS
         */
        if (
          vtCode === "000" ||
          vtStatus === "delivered" ||
          vtStatus === "success" ||
          vtStatus === "successful"
        ) {
          newStatus = "success";
        } else if (

        /*
         * STILL PROCESSING
         *
         * 007 = initiated
         * 016 / 099 = pending states
         */
          vtCode === "007" ||
          vtCode === "016" ||
          vtCode === "099" ||
          vtStatus === "pending" ||
          vtStatus === "initiated"
        ) {
          newStatus = "pending";
        } else {

        /*
         * FAILED
         */
          newStatus = "failed";
        }

        console.log(
          `📌 ${txn.transaction_ref}: VTpass code=${vtCode}, status=${vtStatus}, newStatus=${newStatus}`,
        );

        /*
         * Update BillTransaction FIRST.
         *
         * This is important because an email or notification
         * failure should not prevent the transaction status
         * from being saved.
         */
        await txn.update({
          status: newStatus,
          vtpass_response: resp.data,
        });

        /*
         * Still pending.
         *
         * Do not refund.
         * The next cron run will requery it again.
         */
        if (newStatus === "pending") {
          console.log(`⏳ Txn ${txn.transaction_ref} is still pending`);

          continue;
        }

        /*
         * Successful transaction.
         */
       /*
 * Successful transaction.
 */
// Successful transaction.
if (newStatus === "success") {
  console.log(`✅ Txn ${txn.transaction_ref} completed successfully`);
  // No notification here by convention — success is redundant with the
  // in-app screen. See notificationService.js doc comment.
  continue;
}

// Failed transaction — refund only once.
if (newStatus === "failed") {
  if (txn.refunded) {
    console.log(`ℹ️ Txn ${txn.transaction_ref} already refunded`);
    continue;
  }

  await refundUser(txn.user_id, txn.amount, txn);
  console.log(`💰 Refund completed for ${txn.transaction_ref}`);

  const user = await User.findByPk(txn.user_id);

  if (!user) {
    console.error(`⚠️ User not found for ${txn.transaction_ref}`);
    continue;
  }

  try {
    await sendEmail(
      user.email,
      "Refund Processed",
      { name: user.name, amount: txn.amount, category: txn.category_id, reference: txn.transaction_ref },
      "refundProcessed",
    );
  } catch (emailError) {
    console.error(`⚠️ Refund email failed for ${txn.transaction_ref}:`, emailError.message);
  }

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
    console.error(`⚠️ Notification failed for ${txn.transaction_ref}:`, notificationError.message);
  }
}

/*
 * Failed transaction.
 *
 * Refund only once.
 */
if (newStatus === "failed") {
  if (txn.refunded) {
    console.log(`ℹ️ Txn ${txn.transaction_ref} already refunded`);
    continue;
  }

  await refundUser(txn.user_id, txn.amount, txn);
  console.log(`💰 Refund completed for ${txn.transaction_ref}`);

  const user = await User.findByPk(txn.user_id);

  if (!user) {
    console.error(`⚠️ User not found for ${txn.transaction_ref}`);
    continue;
  }

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
      "refundProcessed",
    );

    console.log(`📧 Refund email sent for ${txn.transaction_ref}`);
  } catch (emailError) {
    console.error(
      `⚠️ Refund email failed for ${txn.transaction_ref}:`,
      emailError.message,
    );
  }

  try {
    await createNotification(
      user.user_id, // was user.id
      "Payment failed",
      `Your payment of ₦${txn.amount} failed and has been refunded to your wallet.`,
      {
        type: "transaction",
        transactionId: txn.transaction_id,
        transactionSource: "bill",
      },
    );

    console.log(`🔔 Refund notification created for ${txn.transaction_ref}`);
  } catch (notificationError) {
    console.error(
      `⚠️ Notification failed for ${txn.transaction_ref}:`,
      notificationError.message,
    );
  }
}
      } catch (err) {
        /*
         * One transaction failing should NOT stop
         * the other pending transactions from being processed.
         */
        console.error(
          `❌ Requery job error for ${txn.transaction_ref}:`,
          err.message,
        );
      }
    }

    console.log("✅ VTpass requery job finished");
  } catch (err) {
    console.error("❌ Process Requery Error:", err.message);
  }
}

module.exports = processRequery;
