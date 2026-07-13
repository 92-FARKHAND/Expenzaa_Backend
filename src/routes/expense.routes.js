import { Router } from "express";
import verifyJWT from "../middlewares/auth.middleware.js";
import {
    createExpense,
    editExpense,
    deleteExpense,
    getExpensesByContext,
    getMonthlyExpenses,
    exportExpenses
} from "../controllers/expense.controller.js"
// getDailyExpensesByCategory,
// getDailyExpensesSummary,
// getWeeklyExpensesSummary,
// getMonthlyExpensesSummary
import { attachContext , requireRole} from "../middlewares/atttachRole.middleware.js";

const router = Router();

router.use(verifyJWT)
router.use(attachContext)
router.route("/expense-create").post(requireRole(["admin","manager"]), createExpense)
router.route("/edit-expense").patch(requireRole(["admin","manager"]), editExpense)
router.get("/analytics", getExpensesByContext);
router.get("/analytics/monthly", getMonthlyExpenses);
router.route("/:expenseId").delete(requireRole(["admin","manager"]),deleteExpense);
router.get("/exportCSV", exportExpenses);


// Aggregation endpoints
// router.get("/analytics/daily", getDailyExpensesSummary);
// router.get("/analytics/weekly", getWeeklyExpensesSummary);
// router.get("/analytics/monthly", getMonthlyExpensesSummary);
// router.get("/analytics/category", getDailyExpensesByCategory);

export default router;