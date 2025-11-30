// middlewares/validateBudget.js

import { Budget } from "../models/budget.model.js";
import { SubBudget } from "../models/subBudget.model.js";
import { ApiError } from "../utils/apiError.js";
import Decimal from "decimal.js";

const validateAndDeductBudget = async (req, res, next) => {
  const { amount, currency, convertedRate, categoryId } = req.body;
  const userId = req.user._id;
  const baseCurrency = req.user.baseCurrency || "PKR";

  // 🔹 Validate required fields
  if (!amount || !currency) {
    throw new ApiError(400, "Amount and currency are required");
  }

  // 🔹 Fetch user's main budget
  const budget = await Budget.findOne({ userId });
  if (!budget) throw new ApiError(404, "Main budget not found");

  // 🔹 Parse amount safely
  let deductionAmount;
  try {
    deductionAmount = new Decimal(amount);
  } catch {
    throw new ApiError(400, "Invalid amount format");
  }

  // 🔹 Handle currency conversion
  if (currency.toUpperCase() !== baseCurrency) {
    if (!convertedRate) throw new ApiError(400, "Converted rate is required for foreign currencies");

    let rate;
    try {
      rate = new Decimal(convertedRate);
    } catch {
      throw new ApiError(400, "Invalid converted rate format");
    }

    if (rate.lte(0)) throw new ApiError(400, "Converted rate must be greater than 0");

    deductionAmount = deductionAmount.mul(rate);
  }

  // 🔹 Validate main budget balance
  const availableBudget = new Decimal(budget.remainingAmount.toString());
  if (availableBudget.lt(deductionAmount)) {
    throw new ApiError(403, "Insufficient main budget balance");
  }

  // 🔹 Optional: Validate SubBudget (if category is specified)
  let subBudget = null;
  if (categoryId) {
    subBudget = await SubBudget.findOne({categoryId,userId });

    if (!subBudget) {
      throw new ApiError(404, "Sub-budget not found for the given category");
    }

    const availableSub = new Decimal(subBudget.remainingAmount.toString());
    if (availableSub.lt(deductionAmount)) {
      throw new ApiError(403, "Insufficient category budget balance");
    }

    // Attach subBudget for deduction
    req.subBudgetId = subBudget._id;
  }

  // 🔹 Attach data to request
  req.deductionAmount = deductionAmount.toString(); // keep as string for precision
  req.budgetId = budget._id;

  next(); // Proceed to controller
};

export { validateAndDeductBudget };
