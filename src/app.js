import express from "express";
import cookieParser from "cookie-parser";
import cors from 'cors'
import userRoutes from "./routes/user.routes.js"
import expenseRoutes from "./routes/expense.routes.js"
import categoryRoutes from "./routes/category.route.js"
import budgetRoutes from "./routes/budget.route.js"
import subBudget from "./routes/subBudget.route.js"
import organizationRoutes from "./routes/organization.routes.js";
import { refreshAccessToken } from "./controllers/user.controller.js";
import errorHandler from "./middlewares/errorHandler.middleware.js";


const app = express();

app.use(cors(
    {
        origin: process.env.CORS_ORIGIN,
        credentials:true
    }
));

app.use(express.json({limit:"16kb"}));
app.use(express.urlencoded({extended:true,limit:"16kb"}));
app.use(express.static("public"));
app.use(cookieParser());

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Expense Tracker API is running",
    });
});

app.post("/api/auth/refresh", refreshAccessToken);

app.use("/api/user",userRoutes)
app.use("/api/expense",expenseRoutes)
app.use("/api/category",categoryRoutes)
app.use("/api/budget",budgetRoutes)
app.use("/api/subBudget",subBudget)
app.use("/api/organization", organizationRoutes);

// Catch-all for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
    });
});

// Global error handler
app.use(errorHandler);


export default app