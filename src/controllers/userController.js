require("dotenv").config();
const { generateOtp } = require("../utils");
const {
  sequelize,
  User,
  Otp,
  Wallet,
  Transaction,
  Beneficiary,
  BillProvider,
  Notification,
} = require("../../models");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const sendEmail = require("../services/emailService");
const jwt = require("jsonwebtoken");
const {
  intializePayment,
  verifyPayment,
} = require("../services/paystackService");
const { TRANSACTION_STATUS } = require("../../constants/data");
const { saltAndHashPassword } = require("../utils");
const messages = require("../messages/index");
const { Op } = require("sequelize");

const normalizePhone = (phone = "") => {
  const trimmed = phone.trim();
  if (trimmed.startsWith("0")) {
    return `234${trimmed.slice(1)}`;
  }
  return trimmed;
};

const createUser = async (req, res) => {
  const { first_name, last_name, email, phone_number, password } = req.body;

  const transaction = await sequelize.transaction();

  try {
    const normalizedPhone = normalizePhone(phone_number);

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone_number: normalizedPhone }],
      },
      transaction,
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({ message: "Email already registered" });
      }
      if (existingUser.phone_number === normalizedPhone) {
        return res
          .status(409)
          .json({ message: "Phone number already registered" });
      }
    }

    const { salt, hashedPassword } = await saltAndHashPassword(password);

    const user_id = uuidv4();

    await User.create(
      {
        user_id,
        first_name,
        last_name,
        email,
        phone_number: normalizedPhone,
        password_salt: salt,
        password_hash: hashedPassword,
      },
      { transaction },
    );

    await Wallet.create(
      {
        wallet_id: uuidv4(),
        user_id,
        balance: 0,
      },
      { transaction },
    );

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 1 * 60 * 1000);

    await Otp.create(
      {
        email,
        otp: otpCode,
        expires_at: expiresAt,
      },
      { transaction },
    );

    await transaction.commit();

    await sendEmail(email, "Verify your OTP", { otp: otpCode }, "otp");

    return res.status(201).json({
      message: "Verification OTP sent to your email",
    });
  } catch (error) {
    await transaction.rollback();

    // Handle DB unique constraint (race condition safety)
    if (error.name === "SequelizeUniqueConstraintError") {
      const field = error.errors[0]?.path;
      return res.status(409).json({
        message: `${field.replace("_", " ")} already exists`,
      });
    }

    console.error("Create user error:", error);

    return res.status(400).json({
      message: "Failed to create user",
      error: error.message,
    });
  }
};
const checkAvailability = async (req, res) => {
  try {
    const { email, phone_number } = req.body;

    const result = {};

    if (email) {
      const emailExists = await User.findOne({ where: { email } });

      result.emailAvailable = !emailExists;
      result.emailMessage = emailExists ? "Email already registered" : null;
    }

    if (phone_number) {
      const phoneExists = await User.findOne({
        where: {
          phone_number: normalizePhone(phone_number),
        },
      });

      result.phoneAvailable = !phoneExists;
      result.phoneMessage = phoneExists
        ? "Phone number already registered"
        : null;
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      emilAvailable: result.emailAvailable,
      phoneAvailable: result.phoneAvailable,
      emailMessage: result.emailMessage,
      phoneMessage: result.phoneMessage,
      message: "Failed to check availability",
    });
  }
};

const verifyUser = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const existingUser = await Otp.findOne({ where: { email, otp } });

    if (!existingUser) {
      throw new Error("Invalid OTP");
    }

    if (new Date() > existingUser.expires_at) {
      throw new Error("OTP has expired");
    }

    await Otp.destroy({ where: { email } });
    await User.update({ is_verified: true }, { where: { email } });

    const userInfo = await User.findOne({ where: { email } });
    await sendEmail(
      email,
      "WELCOME HOME",
      { name: `${userInfo.first_name} ${userInfo.last_name}` },
      "welcome",
    );

    return res.status(200).json({
      message: "OTP verified successfully. Account activated.",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Internal server error",
    });
  }
};

const createPin = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        message: "PIN must be exactly 4 digits",
      });
    }

    const user = req.user;

    if (user.pin_hash) {
      return res.status(400).json({
        message: "PIN already exists. Use change PIN instead",
      });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    user.pin_hash = pinHash;
    await user.save();

    return res.status(200).json({
      message: "PIN created successfully",
    });
  } catch (error) {
    console.error("Create PIN error:", error);

    return res.status(500).json({
      message: "Failed to create PIN",
    });
  }
};
const changePin = async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;

    if (!currentPin || !/^\d{4}$/.test(currentPin)) {
      return res.status(400).json({
        message: "Current PIN must be exactly 4 digits",
      });
    }

    if (!newPin || !/^\d{4}$/.test(newPin)) {
      return res.status(400).json({
        message: "New PIN must be exactly 4 digits",
      });
    }

    const user = req.user;

    if (!user.pin_hash) {
      return res.status(400).json({
        message: "No PIN exists. Create a PIN first",
      });
    }

    const isCurrentPinValid = await bcrypt.compare(currentPin, user.pin_hash);

    if (!isCurrentPinValid) {
      return res.status(401).json({
        message: "Current PIN is incorrect",
      });
    }

    if (currentPin === newPin) {
      return res.status(400).json({
        message: "New PIN must be different from current PIN",
      });
    }

    const newPinHash = await bcrypt.hash(newPin, 10);

    user.pin_hash = newPinHash;
    await user.save();

    return res.status(200).json({
      message: "PIN changed successfully",
    });
  } catch (error) {
    console.error("Change PIN error:", error);

    return res.status(500).json({
      message: "Failed to change PIN",
    });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      },
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        has_pin: !!user.pin_hash,
        phone_number: user.phone_number,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
};

const resendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const otpRecord = await Otp.findOne({ where: { email } });

    if (otpRecord && otpRecord.expires_at > new Date()) {
      await sendEmail(email, "Your OTP", { otp: otpRecord.otp }, "otp");

      return res.status(200).json({
        message: "OTP resent successfully",
      });
    }

    const newOtp = generateOtp();
    const newExpiresAt = new Date(Date.now() + 1 * 60 * 1000); // 3 minutes

    await Otp.destroy({ where: { email } });

    await Otp.create({
      email,
      otp: newOtp,
      expires_at: newExpiresAt,
    });

    await sendEmail(email, "Your OTP", { otp: newOtp }, "otp");

    return res.status(200).json({
      message: "New OTP generated and sent",
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { oldPassword, newPassword } = req.body;

    const checkDBForPassword = await User.findOne({ where: { user_id } });
    const checkIfPasswordIsCorrect = await comparePassword(
      oldPassword,
      checkDBForPassword.password_hash,
    );

    if (checkIfPasswordIsCorrect === false) {
      throw new Error(messages.WRONG_PASSWORD);
    }
    if (newPassword === oldPassword) {
      throw new Error(messages.SAME_PASSWORD);
    }

    const { salt, hashedPassword } = await saltAndHashPassword(newPassword);

    await User.update(
      { where: { user_id } },
      {
        password_hash: hashedPassword,
        password_salt: salt,
      },
    );

    res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};
const startForgetPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const isEmailAvailable = await User.findOne({ where: { email } });
    if (!isEmailAvailable) {
      throw new Error(messages.USER_NOT_FOUND);
    }
    const newOtp = generateOtp();
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000);
    await Otp.create({ email, otp: newOtp, expires_at: expiredAt });
    await sendEmail(email, "Reset password", { otp: newOtp }, "resetPassword");

    res.status(200).json({
      message: "Otp sent successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};
const completeForgetPassword = async (req, res) => {
  const { newPassword, confirmPassword, email, otp } = req.body;
  try {
    const isEmailAvailable = await Otp.findOne({ where: { email, otp } });

    if (!isEmailAvailable) {
      throw new Error("Invalid OTP");
    }

    if (isEmailAvailable.expires_at <= new Date()) {
      throw new Error("OTP expired");
    }

    if (newPassword !== confirmPassword) {
      throw new Error("Passwords do not match");
    }

    const { salt, hashedPassword } = await saltAndHashPassword(newPassword);

    // Correct usage of update
    await User.update(
      {
        password_hash: hashedPassword,
        password_salt: salt,
      },
      {
        where: { email },
      },
    );

    // Correct usage of destroy
    await Otp.destroy({ where: { email } });

    res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { first_name, last_name } = req.body;

    const user = await User.findOne({ where: { user_id } });

    if (!user) {
      return res.status(404).json({
        message: messages.USER_NOT_FOUND,
      });
    }

    await User.update(
      {
        first_name,
        last_name,
      },
      {
        where: { user_id },
      },
    );

    return res.status(200).json({
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(400).json({
      message: "Failed to update profile",
    });
  }
};

const startFundAccount = async (req, res) => {
  try {
    const { amount } = req.body;
    const { email } = req.user;

    if (!amount || Number(amount) < 100) {
      return res.status(400).json({
        message: "Minimum funding amount is ₦100",
      });
    }

    const checkUser = await User.findOne({
      where: { email },
    });

    if (!checkUser || !checkUser.email) {
      throw new Error("User email is required");
    }

    const transaction = await intializePayment(email, Number(amount));

    if (transaction.data.status === false) {
      throw new Error("Payment cannot be initialized this moment");
    }

    return res.status(200).json({
      message: "Transaction initialized successfully",
      data: transaction.data.data,
    });
  } catch (error) {
    console.log("error", error);

    return res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};

const completeFundAccount = async (req, res) => {
  const { reference } = req.params;
  const { user_id } = req.user;

  if (!reference) {
    return res.status(400).json({
      error: "Payment reference is required",
    });
  }

  const t = await sequelize.transaction();

  try {
    // Get authenticated user
    const user = await User.findByPk(user_id, {
      transaction: t,
    });

    if (!user || !user.email) {
      throw new Error("User not found");
    }

    // Check if this reference has already been processed
    const existingTx = await Transaction.findOne({
      where: {
        payment_reference: reference,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (existingTx) {
      await t.rollback();

      return res.status(200).json({
        message: "Transaction already processed",
        new_balance: null,
      });
    }

    // Verify transaction directly with Paystack
    const verifyPaymentTransaction = await verifyPayment(reference);

    if (!verifyPaymentTransaction.data.status) {
      throw new Error("Transaction verification failed");
    }

    const data = verifyPaymentTransaction.data.data;

    // Make sure this Paystack transaction belongs to this user
    if (
      !data.customer ||
      data.customer.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new Error("Payment does not belong to this user");
    }

    // Make sure Paystack says payment was successful
    if (data.status !== "success") {
      throw new Error("Payment was not successful");
    }

    const amountInNaira = data.amount / 100;

    // Find user's wallet
    const wallet = await Wallet.findOne({
      where: {
        user_id,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Credit wallet
    wallet.balance = parseFloat(wallet.balance || 0) + amountInNaira;

    await wallet.save({
      transaction: t,
    });

    // Record transaction
    await Transaction.create(
      {
        transaction_id: uuidv4(),
        user_id,
        wallet_id: wallet.wallet_id,
        amount: amountInNaira,
        type: "credit",
        status: TRANSACTION_STATUS.SUCCESSFUL,
        payment_reference: reference,
      },
      {
        transaction: t,
      },
    );

    await t.commit();

    return res.status(200).json({
      message: "Wallet funded successfully",
      new_balance: wallet.balance,
    });
  } catch (error) {
    await t.rollback();

    console.error("Fund account error:", error);

    return res.status(400).json({
      error: error.message || "Payment verification failed",
    });
  }
};
const getUserWallet = async (req, res) => {
  try {
    const { user_id } = req.user;
    const wallet = await Wallet.findOne({ where: { user_id } });
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    res.status(200).json({
      message: "Wallet found successfully",
      data: wallet,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};

const getUserProfile = async (req, res) => {
  try {
    // Ensure middleware injected the user info
    if (!req.user?.user_id) {
      return res.status(401).json({
        message: "Unauthorized. Please log in again.",
      });
    }

    const user = await User.findOne({
      where: { user_id: req.user.user_id },
      attributes: { exclude: ["password_hash", "password_salt", "pin_hash"] }, // don’t expose password
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User found successfully",
      data: user,
    });
  } catch (error) {
    console.error("getUserProfile error:", error);
    res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
};

const getUserTransactions = async (req, res) => {
  try {
    const { user_id } = req.user;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where: {
        user_id,
      },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      message: "Transactions found successfully",
      data: transactions,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error("Get User Transactions Error:", err.message);

    return res.status(500).json({
      message: "Failed to fetch transactions",
    });
  }
};
const getUserTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.user;

    const transaction = await Transaction.findOne({
      where: {
        transaction_id: id,
        user_id,
      },
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      message: "Transaction retrieved successfully",

      transaction: {
        id: transaction.transaction_id,
        amount: Number(transaction.amount),

        type: transaction.type,

        status:
          transaction.status === "successful"
            ? "successful"
            : transaction.status,

        reference: transaction.payment_reference,
        created_at: transaction.createdAt,
      },
    });
  } catch (error) {
    console.error("Get transaction by ID error:", error);

    return res.status(500).json({
      message: "Failed to retrieve transaction",
    });
  }
};
const requestEmailChange = async (req, res) => {
  const { email } = req.body;
  const { user_id } = req.user;

  const transaction = await sequelize.transaction();
  try {
    const exists = await User.findOne({ where: { email }, transaction });
    if (exists) {
      throw new Error("Email already exists");
    }

    const user = await User.findByPk(user_id, { transaction });
    if (!user) {
      throw new Error("User not found");
    }

    // Save pending email
    await user.update({ pending_email: email }, { transaction });

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 60 * 1000);
    await Otp.create(
      { email, otp: otpCode, expires_at: expiresAt },
      { transaction },
    );

    await transaction.commit();
    await sendEmail(email, "Verify your new email", { otp: otpCode }, "otp");

    return res.status(200).json({ message: "OTP sent to new email" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res
      .status(500)
      .json({ message: error.message || "Failed to request email change" });
  }
};
const verifyEmailChange = async (req, res) => {
  const { otp } = req.body;
  const { user_id } = req.user;

  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(user_id, { transaction });
    if (!user || !user.pending_email) {
      throw new Error("User not found");
    }

    const otpRecord = await Otp.findOne({
      where: { email: user.pending_email, otp },
      transaction,
    });
    if (!otpRecord || otpRecord.expires_at < new Date()) {
      throw new Error("Invalid or expired OTP");
    }

    await user.update(
      { email: user.pending_email, pending_email: null, is_verified: true },
      { transaction },
    );
    await otpRecord.destroy({ transaction });

    await transaction.commit();
    return res.status(200).json({ message: "Email updated successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res
      .status(500)
      .json({ message: error.message || "Failed to verify email change" });
  }
};
const requestPhoneChange = async (req, res) => {
  const { phone_number } = req.body;
  const { user_id } = req.user;
  const normalizedPhone = normalizePhone(phone_number);

  const transaction = await sequelize.transaction();
  try {
    const exists = await User.findOne({
      where: { phone_number: normalizedPhone },
      transaction,
    });
    if (exists) {
      throw new Error("Phone number already exists");
    }

    const user = await User.findByPk(user_id, { transaction });
    if (!user) {
      throw new Error("User not found");
    }

    await user.update(
      { pending_phone_number: normalizedPhone },
      { transaction },
    );

    const otpCode = generateOtp();
    const expiresAt = new Date(Date.now() + 60 * 1000);
    await Otp.create(
      { email: user.email, otp: otpCode, expires_at: expiresAt },
      { transaction },
    );

    await transaction.commit();
    await sendEmail(
      user.email,
      "Verify your new phone number",
      { otp: otpCode },
      "otp",
    );

    return res
      .status(200)
      .json({ message: "OTP sent to verify new phone number" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res
      .status(500)
      .json({ message: error.message || "Failed to request phone change" });
  }
};
const verifyPhoneChange = async (req, res) => {
  const { otp } = req.body;
  const { user_id } = req.user;

  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(user_id, { transaction });
    if (!user || !user.pending_phone_number) {
      throw new Error("User not found");
    }

    const otpRecord = await Otp.findOne({
      where: { email: user.email, otp },
      transaction,
    });
    if (!otpRecord || otpRecord.expires_at < new Date()) {
      throw new Error("Invalid or expired OTP");
    }

    await user.update(
      { phone_number: user.pending_phone_number, pending_phone_number: null },
      { transaction },
    );
    await otpRecord.destroy({ transaction });

    await transaction.commit();
    return res
      .status(200)
      .json({ message: "Phone number updated successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res
      .status(500)
      .json({ message: error.message || "Failed to verify phone change" });
  }
};

const createBeneficiary = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const {
      category,
      label,
      provider_id,
      phone_number,
      meter_number,
      meter_type,
      smartcard_number,
    } = req.body;

    if (!category || !label) {
      return res.status(400).json({
        message: "Category and label are required",
      });
    }

    const validCategories = ["airtime", "data", "electricity", "tv"];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        message: "Invalid beneficiary category",
      });
    }

    if ((category === "airtime" || category === "data") && !phone_number) {
      return res.status(400).json({
        message: "Phone number is required",
      });
    }

    if (category === "electricity") {
      if (!meter_number) {
        return res.status(400).json({
          message: "Meter number is required",
        });
      }

      if (!meter_type) {
        return res.status(400).json({
          message: "Meter type is required",
        });
      }

      if (!["prepaid", "postpaid"].includes(meter_type)) {
        return res.status(400).json({
          message: "Invalid meter type",
        });
      }
    }

    if (category === "tv" && !smartcard_number) {
      return res.status(400).json({
        message: "Smartcard number is required",
      });
    }

    if (provider_id) {
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
    }

    const beneficiary = await Beneficiary.create({
      user_id,
      category,
      label,
      provider_id: provider_id || null,
      phone_number: phone_number || null,
      meter_number: meter_number || null,
      meter_type: meter_type || null,

      smartcard_number: smartcard_number || null,
    });

    const createdBeneficiary = await Beneficiary.findOne({
      where: {
        beneficiary_id: beneficiary.beneficiary_id,
      },
      include: [
        {
          model: BillProvider,
          as: "provider",
          attributes: ["provider_id", "name", "code"],
        },
      ],
    });

    return res.status(201).json({
      message: "Beneficiary saved successfully",
      beneficiary: createdBeneficiary,
    });
  } catch (error) {
    console.error("Create beneficiary error:", error);

    return res.status(500).json({
      message: "Failed to save beneficiary",
    });
  }
};

const getUserBeneficiaries = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const beneficiaries = await Beneficiary.findAll({
      where: {
        user_id,
      },
      include: [
        {
          model: BillProvider,
          as: "provider",
          attributes: ["provider_id", "name", "code"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({
      beneficiaries,
    });
  } catch (error) {
    console.error("Get beneficiaries error:", error);

    return res.status(500).json({
      message: "Failed to load beneficiaries",
    });
  }
};

const deleteBeneficiary = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const { id } = req.params;

    const beneficiary = await Beneficiary.findOne({
      where: {
        beneficiary_id: id,
        user_id,
      },
    });

    if (!beneficiary) {
      return res.status(404).json({
        message: "Beneficiary not found",
      });
    }

    await beneficiary.destroy();

    return res.status(200).json({
      message: "Beneficiary removed successfully",
    });
  } catch (error) {
    console.error("Delete beneficiary error:", error);

    return res.status(500).json({
      message: "Failed to remove beneficiary",
    });
  }
};



const getUserNotifications = async (req, res) => {
  try {
    const { user_id } = req.user;

    const notifications = await Notification.findAll({
      where: { user_id },
      order: [["createdAt", "DESC"]],
      limit: 100, // sane cap — add pagination later if this list grows large
    });

    return res.json({
      message: "Notifications retrieved",
      notifications,
    });
  } catch (err) {
    console.error("Get Notifications Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const notification = await Notification.findOne({
      where: { notification_id: id, user_id },
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await notification.update({ status: "read" });

    return res.json({ message: "Marked as read", notification });
  } catch (err) {
    console.error("Mark Notification Read Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// PATCH /user/notifications/read-all
const markAllNotificationsRead = async (req, res) => {
  try {
    const { user_id } = req.user;

    await Notification.update(
      { status: "read" },
      { where: { user_id, status: "unread" } }
    );

    return res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("Mark All Notifications Read Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// DELETE /user/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { id } = req.params;

    const deleted = await Notification.destroy({
      where: { notification_id: id, user_id },
    });

    if (!deleted) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.json({ message: "Notification deleted" });
  } catch (err) {
    console.error("Delete Notification Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// DELETE /user/notifications  (clear all)
const clearAllNotifications = async (req, res) => {
  try {
    const { user_id } = req.user;

    await Notification.destroy({ where: { user_id } });

    return res.json({ message: "All notifications cleared" });
  } catch (err) {
    console.error("Clear All Notifications Error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};





module.exports = {
  createUser,
  verifyUser,
  startFundAccount,
  loginUser,
  completeForgetPassword,
  updateUserProfile,
  completeFundAccount,
  resendOtp,
  changePassword,
  startForgetPassword,
  getUserWallet,
  getUserProfile,
  getUserTransactions,
  requestEmailChange,
  verifyEmailChange,
  requestPhoneChange,
  verifyPhoneChange,
  checkAvailability,
  createPin,
  changePin,
  getUserTransactionById,
  createBeneficiary,
  getUserBeneficiaries,
  deleteBeneficiary,
   getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
};
