const {
  BillTransaction,
  BillProvider,
  BillProduct,
  Wallet,
  BillCategory,
  Transaction,
} = require("../../models");
const vtpass = require("../services/vtPassServices");
const { sequelize } = require("../../models");
const { v4: uuidv4 } = require("uuid");
const { generateRequestId, verifyPin } = require("../utils");
const { getFriendlyMessage } = require("../utils/vtpassErrorMap");
const { Op } = require("sequelize");
const { createNotification } = require("../services/NotificationService");

async function debitWallet(user_id, amount, payment_reference = null) {
  try {
    const wallet = await Wallet.findOne({
      where: { user_id },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (Number(wallet.balance) < Number(amount)) {
      throw new Error("Insufficient balance");
    }

    wallet.balance = Number(wallet.balance) - Number(amount);

    await wallet.save();

    await Transaction.create({
      user_id,
      wallet_id: wallet.wallet_id,
      amount: Number(amount),
      type: "debit",
      status: "successful",
      payment_reference,
    });

    return wallet;
  } catch (error) {
    throw new Error(error.message || "Failed to debit wallet");
  }
}
function extractElectricityToken(data) {
  const rawToken = data?.token || data?.Token || data?.purchased_code;

  if (!rawToken) {
    return null;
  }

  return rawToken.replace(/^token\s*:\s*/i, "").trim();
}
const payAirtime = async (req, res) => {
  try {
    const { provider_id, phone, amount, pin } = req.body;
    const { user_id } = req.user;

    const checkPin = await verifyPin(req.user, pin);

    if (!checkPin.valid) {
      return res.status(400).json({
        message: checkPin.message,
      });
    }

    const provider = await BillProvider.findByPk(provider_id);

    if (!provider) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    // Generate reference BEFORE wallet debit
    const requestId = generateRequestId();

    // Create bill transaction as pending
    const transaction = await BillTransaction.create({
      user_id,
      category_id: provider.category_id,
      provider_id,
      amount,
      total_amount: amount,
      service_charge: 0,
      transaction_ref: requestId,
      status: "pending",
      payment_method: "wallet",
      customer_info: phone,
    });

    // Debit wallet + create wallet transaction
    await debitWallet(user_id, amount, requestId);

    const result = await vtpass.buyAirtime({
      requestId,
      phone,
      amount,
      network: provider.code,
    });

    const successful = result.success && result?.data?.code === "000";

    await transaction.update({
      vtpass_reference: result?.data?.requestId || requestId,

      status: successful ? "success" : "failed",
    });

    // Immediate-failure notification — covers the case processRequery
    // never sees, since this transaction resolves synchronously and never
    // sits in "pending" long enough for the cron to pick it up.
    if (!successful) {
      try {
        await createNotification({
          user_id,
          title: "Airtime purchase failed",
          message: `Your ₦${amount} airtime purchase failed. A refund will be processed shortly.`,
          type: "transaction",
          transaction_id: transaction.transaction_id,
          transaction_source: "bill",
        });
      } catch (notificationError) {
        console.error(
          `⚠️ Notification failed for ${transaction.transaction_ref}:`,
          notificationError.message,
        );
      }
    }

    return res.json({
      message: getFriendlyMessage(
        result?.data?.code,
        result?.data?.response_description,
      ),
      transaction,
      vtpass: result,
      status: successful ? "success" : "failed",
    });
  } catch (err) {
    console.error("Pay Airtime Error:", err.message);

    return res.status(400).json({
      message: err.message,
    });
  }
};

const payData = async (req, res) => {
  try {
    const { provider_id, phone, variation_code, pin } = req.body;
    const { user_id } = req.user;

    if (!provider_id || !phone || !variation_code || !pin) {
      return res.status(400).json({
        message: "provider_id, phone, variation_code and pin are required",
      });
    }

    const checkPin = await verifyPin(req.user, pin);

    if (!checkPin.valid) {
      return res.status(400).json({
        message: checkPin.message,
      });
    }

    const provider = await BillProvider.findOne({
      where: {
        provider_id,
        is_active: true,
      },
    });

    if (!provider) {
      return res.status(404).json({
        message: "Provider not found",
      });
    }

    const product = await BillProduct.findOne({
      where: {
        provider_id,
        variation_code,
      },
    });

    if (!product) {
      return res.status(404).json({
        message: "Data plan not found",
      });
    }

    const amount = Number(product.price);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: "Invalid data plan price",
      });
    }

    const requestId = generateRequestId();

    const transaction = await BillTransaction.create({
      user_id,
      category_id: provider.category_id,
      provider_id,
      amount,
      service_charge: 0,
      total_amount: amount,
      transaction_ref: requestId,
      status: "pending",
      payment_method: "wallet",
      customer_info: phone,
    });

    await debitWallet(user_id, amount, requestId);

    const result = await vtpass.buyData({
      requestId,
      network: provider.code,
      phone,
      variationCode: variation_code,
    });

    const successful = result.success && result?.data?.code === "000";

    await transaction.update({
      vtpass_reference: result?.data?.requestId || requestId,

      status: successful ? "success" : "failed",

      amount: result?.data?.content?.transactions?.amount || amount,
    });

    if (!successful) {
      try {
        await createNotification({
          user_id,
          title: "Data purchase failed",
          message: `Your ₦${amount} data purchase failed. A refund will be processed shortly.`,
          type: "transaction",
          transaction_id: transaction.transaction_id,
          transaction_source: "bill",
        });
      } catch (notificationError) {
        console.error(
          `⚠️ Notification failed for ${transaction.transaction_ref}:`,
          notificationError.message,
        );
      }
    }

    return res.json({
      message: getFriendlyMessage(
        result?.data?.code,
        result?.data?.response_description,
      ),
      transaction,
      vtpass: result,
      status: successful ? "success" : "failed",
    });
  } catch (err) {
    console.error("Pay Data Error:", err.message);

    return res.status(400).json({
      message: err.message,
    });
  }
};

const payElectricity = async (req, res) => {
  try {
    const { provider_id, meter_no, type, amount, pin } = req.body;
    const { user_id } = req.user;
    const phone = req.user.phone_number;
    const checkPin = await verifyPin(req.user, pin);
    if (!checkPin.valid) {
      return res.status(400).json({ message: checkPin.message });
    }

    const provider = await BillProvider.findByPk(provider_id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const requestId = generateRequestId();

    const transaction = await BillTransaction.create({
      user_id,
      category_id: provider.category_id,
      provider_id,
      amount,
      service_charge: 0,
      total_amount: amount,
      transaction_ref: requestId,
      status: "pending",
      payment_method: "wallet",
      customer_info: meter_no,
    });

    await debitWallet(user_id, amount, requestId);
    const result = await vtpass.payElectricity({
      requestId,
      disco: provider.code,
      meterNo: meter_no,
      type,
      amount,
      phone,
    });

    const successful = result.success && result?.data?.code === "000";

    // Removed dead code here — a leftover, unassigned fallback-chain
    // expression (result?.data?.token || result?.data?.Token || ...)
    // that evaluated and discarded its result. extractElectricityToken
    // already handles this fallback logic internally.
    const token = extractElectricityToken(result?.data);

    await transaction.update({
      vtpass_reference: result?.data?.requestId || requestId,

      token,

      status: successful ? "success" : "failed",
    });

    if (!successful) {
      try {
        await createNotification({
          user_id,
          title: "Electricity payment failed",
          message: `Your ₦${amount} electricity payment failed. A refund will be processed shortly.`,
          type: "transaction",
          transaction_id: transaction.transaction_id,
          transaction_source: "bill",
        });
      } catch (notificationError) {
        console.error(
          `⚠️ Notification failed for ${transaction.transaction_ref}:`,
          notificationError.message,
        );
      }
    }

    return res.json({
      message: getFriendlyMessage(
        result?.data?.code,
        result?.data?.response_description,
      ),
      transaction,
      vtpass: result,
      status: successful ? "success" : "failed",
    });
  } catch (err) {
    console.error("Pay Electricity Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

const payTV = async (req, res) => {
  try {
    const { provider_id, smart_card, variation_code, amount, pin } = req.body;
    const { user_id } = req.user;

    const phone = req.user.phone_number;

    const checkPin = await verifyPin(req.user, pin);
    if (!checkPin.valid) {
      return res.status(400).json({ message: checkPin.message });
    }

    const provider = await BillProvider.findByPk(provider_id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const requestId = generateRequestId();

    const transaction = await BillTransaction.create({
      user_id,
      category_id: provider.category_id,
      provider_id,
      amount,
      service_charge: 0,
      total_amount: amount,
      status: "pending",
      transaction_ref: requestId,
      payment_method: "wallet",
      customer_info: smart_card,
    });

    await debitWallet(user_id, amount, requestId);

    const result = await vtpass.payTV({
      requestId,
      provider: provider.code,
      smartCard: smart_card,
      variationCode: variation_code,
      phone,
    });

    const successful = result.success && result?.data?.code === "000";

    await transaction.update({
      vtpass_reference: result?.data?.requestId || requestId,
      expiry_date: result?.data?.content?.transactions?.expiry_date,
      amount: result?.data?.content?.transactions?.amount || amount,
      status: successful ? "success" : "failed",
    });

    if (!successful) {
      try {
        await createNotification({
          user_id,
          title: "TV subscription failed",
          message: `Your ₦${amount} TV subscription failed. A refund will be processed shortly.`,
          type: "transaction",
          transaction_id: transaction.transaction_id,
          transaction_source: "bill",
        });
      } catch (notificationError) {
        console.error(
          `⚠️ Notification failed for ${transaction.transaction_ref}:`,
          notificationError.message,
        );
      }
    }

    return res.json({
      message: getFriendlyMessage(
        result?.data?.code,
        result?.data?.response_description,
      ),
      transaction,
      vtpass: result,
      status: successful ? "success" : "failed",
    });
  } catch (err) {
    console.error("Pay TV Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

const getBillProviders = async (req, res) => {
  try {
    const { category } = req.query;

    const providerWhere = {
      is_active: true,
    };

    const categoryWhere = {
      is_active: true,
    };

    if (category) {
      categoryWhere.name = {
        [Op.iLike]: category,
      };
    }

    const providers = await BillProvider.findAll({
      where: providerWhere,

      attributes: [
        "provider_id",
        "name",
        "code",
        "description",
        "service_charge",
      ],

      include: [
        {
          model: BillCategory,
          as: "category",
          attributes: ["category_id", "name"],
          where: category ? categoryWhere : undefined,
          required: !!category,
        },
      ],

      order: [["name", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      providers,
    });
  } catch (error) {
    console.error("Get bill providers error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch bill providers",
    });
  }
};

const getBillProducts = async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await BillProvider.findOne({
      where: {
        provider_id: providerId,
        is_active: true,
      },
      attributes: ["provider_id", "name", "code"],
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Bill provider not found",
      });
    }

    const products = await BillProduct.findAll({
      where: {
        provider_id: providerId,
      },
      attributes: ["product_id", "name", "variation_code", "price"],
      order: [["price", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      provider,
      products,
    });
  } catch (error) {
    console.error("Get bill products error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch bill products",
    });
  }
};

const verifyElectricityMeter = async (req, res) => {
  try {
    const { provider_id, meter_number, meter_type } = req.body;

    if (!provider_id || !meter_number || !meter_type) {
      return res.status(400).json({
        success: false,
        message: "provider_id, meter_number and meter_type are required",
      });
    }

    if (!["prepaid", "postpaid"].includes(meter_type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "meter_type must be prepaid or postpaid",
      });
    }

    const provider = await BillProvider.findOne({
      where: {
        provider_id,
        is_active: true,
      },
      attributes: ["provider_id", "name", "code"],
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Electricity provider not found",
      });
    }

    const result = await vtpass.verifyElectricity({
      serviceID: provider.code,
      meterNo: meter_number,
      meterType: meter_type.toLowerCase(),
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const vtpassData = result.data;

    const wrongMeter = vtpassData.content?.WrongBillersCode === true;

    if (vtpassData.code !== "000" || wrongMeter) {
      return res.status(400).json({
        success: false,
        verified: false,
        message:
          vtpassData.content?.error ||
          vtpassData.response_description ||
          "Meter verification failed",
      });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      provider: {
        provider_id: provider.provider_id,
        name: provider.name,
        code: provider.code,
      },
      customer: vtpassData.content,
    });
  } catch (error) {
    console.error("Electricity verification controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify electricity meter",
    });
  }
};

const verifyTVSmartCard = async (req, res) => {
  try {
    const { provider_id, smartcard_number } = req.body;

    if (!provider_id || !smartcard_number) {
      return res.status(400).json({
        success: false,
        message: "provider_id and smartcard_number are required",
      });
    }

    const provider = await BillProvider.findOne({
      where: {
        provider_id,
        is_active: true,
      },
      attributes: ["provider_id", "name", "code"],
    });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "TV provider not found",
      });
    }

    const result = await vtpass.verifyTV({
      serviceID: provider.code,
      smartCard: smartcard_number,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const vtpassData = result.data;

    if (vtpassData.code !== "000") {
      return res.status(400).json({
        success: false,
        message:
          vtpassData.response_description || "Smartcard verification failed",
      });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      provider: {
        provider_id: provider.provider_id,
        name: provider.name,
        code: provider.code,
      },
      customer: vtpassData.content,
    });
  } catch (error) {
    console.error("TV verification controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify TV smartcard",
    });
  }
};

const getUserBillTransactions = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await BillTransaction.findAndCountAll(
      {
        where: { user_id },

        include: [
          {
            model: BillCategory,
            as: "category",
            attributes: ["category_id", "name"],
          },
          {
            model: BillProvider,
            as: "provider",
            attributes: ["provider_id", "name"],
          },
        ],

        order: [["created_at", "DESC"]],

        limit,
        offset,
      },
    );

    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction.transaction_id,

      reference: transaction.transaction_ref,

      amount: Number(transaction.total_amount),

      status:
        transaction.status === "success" ? "successful" : transaction.status,

      token: transaction.token,

      expiry_date: transaction.expiry_date,

      customer_info: transaction.customer_info,

      payment_method: transaction.payment_method,

      category: transaction.category
        ? {
            id: transaction.category.category_id,
            name: transaction.category.name,
          }
        : null,

      provider: transaction.provider
        ? {
            id: transaction.provider.provider_id,
            name: transaction.provider.name,
          }
        : null,

      created_at: transaction.createdAt,
    }));

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      message: "Bill transactions retrieved successfully",

      transactions: formattedTransactions,

      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get user bill transactions error:", error);

    return res.status(500).json({
      message: "Failed to retrieve bill transactions",
    });
  }
};
const requeryTransaction = async (req, res) => {
  try {
    const { transaction_ref } = req.params;
    const transaction = await BillTransaction.findOne({
      where: { transaction_ref },
    });
    if (!transaction)
      return res.status(404).json({ message: "Transaction not found" });

    const result = await vtpass.requery(transaction_ref);

    if (result.success && result.data) {
      let newStatus = transaction.status;

      // VTpass success code
      if (result.data.code === "000") {
        newStatus = "success";
      } else if (["016", "099"].includes(result.data.code)) {
        // 016 = pending, 099 = still processing
        newStatus = "pending";
      } else {
        newStatus = "failed";
      }

      await transaction.update({
        status: newStatus,
      });
    }

    return res.json({
      message: "Requery complete",
      transaction,
      vtpass: result,
    });
  } catch (err) {
    console.error("Requery Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

const getBillTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.user_id;

    const transaction = await BillTransaction.findOne({
      where: {
        transaction_id: id,
        user_id: userId,
      },
      include: [
        {
          model: BillCategory,
          as: "category",
          attributes: ["category_id", "name"],
        },
        {
          model: BillProvider,
          as: "provider",
          attributes: ["provider_id", "name"],
        },
      ],
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Bill transaction not found",
      });
    }

    return res.status(200).json({
      message: "Bill transaction retrieved successfully",
      transaction: {
        id: transaction.transaction_id,
        reference: transaction.transaction_ref,
        amount: Number(transaction.amount),
        service_charge: Number(transaction.service_charge),
        total_amount: Number(transaction.total_amount),
        status:
          transaction.status === "success" ? "successful" : transaction.status,
        token: transaction.token,
        expiry_date: transaction.expiry_date,
        customer_info: transaction.customer_info,
        payment_method: transaction.payment_method,
        created_at: transaction.createdAt,
        category: transaction.category
          ? {
              id: transaction.category.category_id,
              name: transaction.category.name,
            }
          : null,
        provider: transaction.provider
          ? {
              id: transaction.provider.provider_id,
              name: transaction.provider.name,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get bill transaction error:", error);

    return res.status(500).json({
      message: "Failed to retrieve bill transaction",
    });
  }
};

module.exports = {
  payAirtime,
  payData,
  payElectricity,
  payTV,
  requeryTransaction,
  getUserBillTransactions,
  getBillTransactionById,
  getBillProviders,
  getBillProducts,
  verifyElectricityMeter,
  verifyTVSmartCard,
};
