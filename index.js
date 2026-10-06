require("dotenv").config();
const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
const cors = require("cors");
const bodyParser = require("body-parser");
const passport = require("./config/passport");

// === Import routes ===
const userRoutes = require("./src/routes/userRoutes");
const billsPaymentRoutes = require("./src/routes/billsPaymentRoutes");
const oauthRoutes = require("./src/routes/authRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes"); 
const pushTokenRoutes = require("./src/routes/pushToken"); 

// === Initialize jobs & cron tasks ===
require("./src/jobs/cleanupRefreshTokens");
require("./src/utils/cron");

// === Middleware setup ===
app.use(bodyParser.json());
app.use(cookieParser());
app.use(passport.initialize());

// === CORS configuration ===
// ⚠️ Make sure your frontend URL matches one of these origins.
const corsOptions = {
  origin: ["http://localhost:3000", "http://localhost:5173","http://localhost:5174"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type", "authorization"],
  credentials: true, // allow cookies to be sent
};

app.use(cors(corsOptions));

// === Routes ===
app.use("/auth", oauthRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/vtpass", billsPaymentRoutes);
app.use("/api/v1/user", notificationRoutes); 
app.use("/api/v1/user", pushTokenRoutes); 

// === Root route ===
app.get("/", (req, res) => {
  res.status(200).json({ message: "Bills Payment API is running 🚀" });
});

// === 404 fallback ===
app.use((req, res) => {
  res.status(404).json({ message: "Page Not Found" });
});

// === Start server ===
const port = process.env.APP_PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
