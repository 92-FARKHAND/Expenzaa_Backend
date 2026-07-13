import { SubBudget } from "../models/subBudget.model.js";
import { Expense } from "../models/expense.model.js";
import { ApiError } from "../utils/apiError.js";
import Decimal from "decimal.js";

const validateAndDeductSubBudget = async (req, res, next) => {
  const { categoryId, expenseId } = req.body;
  const isSolo = req.context.type === "solo";
  const subBudgetFilter = isSolo ? { userId: req.user._id } : { orgId: req.context.organizationId };

  if (categoryId) {
    const subBudget = await SubBudget.findOne({ categoryId, ...subBudgetFilter });

    if (!subBudget) {
      throw new ApiError(404, "Sub-budget not found for the given category");
    }

    if (!req.deductionAmount) {
      throw new ApiError(500, "Deduction amount not computed by main budget middleware");
    }

    const newBaseAmount = new Decimal(req.deductionAmount);
    const oldBaseAmount = new Decimal(req.oldBaseAmount || "0");
    const availableSub = new Decimal(subBudget.remainingAmount.toString());

    // 🔹 If editing an existing expense
    if (expenseId) {
      const existingExpense = await Expense.findById(expenseId);
      if (existingExpense) {
        const oldCategoryId = existingExpense.categoryId?.toString();
        const newCategoryId = categoryId.toString();

        if (newCategoryId !== oldCategoryId) {
          // Category changed: check if the new category has enough balance for the entire new amount
          if (availableSub.lt(newBaseAmount)) {
            throw new ApiError(403, "Insufficient category budget balance");
          }
        } else {
          // Category is same: check only the difference
          const netSubDeduction = newBaseAmount.minus(oldBaseAmount);
          if (netSubDeduction.gt(0)) {
            if (availableSub.lt(netSubDeduction)) {
              throw new ApiError(403, "Insufficient category budget balance");
            }
          }
        }
      }
    } else {
      // 🔹 Creating a new expense: check full amount
      if (availableSub.lt(newBaseAmount)) {
        throw new ApiError(403, "Insufficient category budget balance");
      }
    }

    // Attach subBudget for deduction
    req.subBudgetId = subBudget._id;
  }
  console.log("subbudget middleware");
  

  next(); // Proceed to controller
};

export { validateAndDeductSubBudget };
