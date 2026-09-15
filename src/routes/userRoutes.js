const express = require("express");
const router = express.Router();
const {
  createUser,
  verifyUser,
  loginUser,
  completeForgetPassword,
  updateUserProfile,
  completeFundAccount,
  resendOtp,
  changePassword,
  startForgetPassword,
  startFundAccount,
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
} = require("../controllers/userController");
const validationmiddleware = require("../middlewares/validationMiddleware");
const {
  createUserSchema,
  changePasswordSchema,
  verifyEmailSchema,
  completeForgetPasswordSchema,
} = require("../validations/userValidation");
const { UserAuthorization } = require("../middlewares/authorization");
const {
  getUserBillTransactions,
  getBillTransactionById,
} = require("../controllers/billsPayment");

router.post("/create/user", validationmiddleware(createUserSchema), createUser);

router.post("/verify/otp", verifyUser);
router.post("/check/availability", checkAvailability);
router.post("/start/fund/account", UserAuthorization, startFundAccount);
router.post("/create/pin", UserAuthorization, createPin);
router.put("/change/pin", UserAuthorization, changePin);
router.post("/login/user", loginUser);
router.get(
  "/complete/fund/account/:reference",
  UserAuthorization,
  completeFundAccount,
);
router.post("/complete/forget/password", completeForgetPassword);
router.patch("/update/profile", UserAuthorization, updateUserProfile);
router.post("/resend/otp", resendOtp);
router.post(
  "/start/forget/password",
  validationmiddleware(verifyEmailSchema),
  startForgetPassword,
);
router.post(
  "/change/password",
  UserAuthorization,
  validationmiddleware(changePasswordSchema),
  changePassword,
);
router.get("/get/user/wallet", UserAuthorization, getUserWallet);
router.get("/get/user/profile", UserAuthorization, getUserProfile);
router.get("/get/user/transactions", UserAuthorization, getUserTransactions);
router.get("/get/user/transactions/:id", UserAuthorization, getUserTransactionById);
router.patch("/request/email/change", UserAuthorization, requestEmailChange);
router.post("/verify/email/change", UserAuthorization, verifyEmailChange);
router.patch("/request/phone/change", UserAuthorization, requestPhoneChange);
router.post("/verify/phone/change", UserAuthorization, verifyPhoneChange);
router.get("/transactions/bills", UserAuthorization, getUserBillTransactions);
router.get("/transactions/bills/:id", UserAuthorization, getBillTransactionById);
router.post("/beneficiaries",UserAuthorization, createBeneficiary);

router.get("/beneficiaries", UserAuthorization, getUserBeneficiaries);

router.delete("/beneficiaries/:id", UserAuthorization, deleteBeneficiary);

router.get("/notifications",UserAuthorization, getUserNotifications);
router.patch("/notifications/:id/read", UserAuthorization, markNotificationRead);
router.patch("/notifications/read-all", UserAuthorization, markAllNotificationsRead);
router.delete("/notifications/:id", UserAuthorization, deleteNotification);
router.delete("/notifications", UserAuthorization, clearAllNotifications);

module.exports = router;
