const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const intializePayment = async (email, amount) => {
  return axios({
    method: "POST",
    url: "https://api.paystack.co/transaction/initialize",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    data: {
      email,
      amount: amount * 100,
      currency: "NGN",
    },
  });
};


const verifyPayment = async (reference) => {
  if (!reference) {
    throw new Error("Payment reference is required");
  }

  return axios({
    method: "GET",
    url: `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
    timeout: 10000,
  });
};

module.exports = {
  intializePayment,
  verifyPayment,
};
