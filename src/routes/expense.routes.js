import{Router} from "express";
import verifyJWT from "../middlewares/auth.middleware.js";
import {
    createExpense,
    editExpense,
    getExpensesByUserId,
    deleteExpense
} from "../controllers/expense.controller.js"
import { validateAndDeductBudget } from "../middlewares/budgetCheck.middleware.js";

const router = Router();

router.route("/expense-create").post(verifyJWT,validateAndDeductBudget,createExpense)
router.route("/edit-expense").patch(verifyJWT,validateAndDeductBudget,editExpense)
router.route("/get-expense").get(verifyJWT,getExpensesByUserId)
router.route("/:expenseId").delete(verifyJWT,deleteExpense)

export default router;