const bcrypt = require("bcrypt");
const { Wallet, Transaction } = require("../../models");
const saltRounds = 10;

const isEmpty = (val) => {
  return val === undefined ||
    val == null ||
    val.length == 0 ||
    Object.keys(val).length === 0
    ? true
    : false;
};

const saltAndHashPassword = async (password) => {
  const salt = await bcrypt.genSalt(saltRounds);
  const hashedPassword = await bcrypt.hash(password, salt);

  return { salt, hashedPassword };
};

const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

function generateOtp() {
  return Math.floor(Math.random() * 1000000).toString().padStart(6, "0")
}

function generateRequestId() {
  const now = new Date();

  // Format datetime part as YYYYMMDDHHmm
  const pad = (n) => n.toString().padStart(2, "0");
  const datePart =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes());

  // Generate random alphanumeric token (10 chars)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 10; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }

  return datePart + token;
}
 function generateRef(){
  return `txn_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
 }

function generateRandomPassword(length = 12) {
  if (length < 8) {
    throw new Error(
      "Password length should be at least 8 characters for better security."
    );
  }

  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const uppercase = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%^&*()_+[]{}|;:,.<>?";

  const allChars = lowercase + uppercase + digits + special;

  // Ensure at least one from each category
  const getRandom = (chars) => chars[Math.floor(Math.random() * chars.length)];

  let result = [
    getRandom(lowercase),
    getRandom(uppercase),
    getRandom(digits),
    getRandom(special),
  ];

  for (let i = result.length; i < length; i++) {
    result.push(getRandom(allChars));
  }

  // Shuffle result to prevent predictable character positions
  result = result.sort(() => Math.random() - 0.5);

  return result.join("");
}
const verifyPin = async (user, pin) => {
  if (!user.pin_hash) {
    return {
      valid: false,
      message: "Transaction PIN has not been set",
    };
  }

  if (!pin || !/^\d{4}$/.test(pin)) {
    return {
      valid: false,
      message: "Invalid PIN format",
    };
  }

  const valid = await bcrypt.compare(pin, user.pin_hash);

  if (!valid) {
    return {
      valid: false,
      message: "Incorrect PIN",
    };
  }

  return {
    valid: true,
  };
};

function extractElectricityToken(data) {
  const rawToken = data?.token || data?.Token || data?.purchased_code;

  if (!rawToken) {
    return null;
  }

  return rawToken.replace(/^token\s*:\s*/i, "").trim();
}

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
 

module.exports = {
  isEmpty,
  saltAndHashPassword,
  comparePassword,
  generateOtp,
  generateRandomPassword,
  generateRequestId,
  generateRef,
  verifyPin,
  extractElectricityToken,
  debitWallet
};
