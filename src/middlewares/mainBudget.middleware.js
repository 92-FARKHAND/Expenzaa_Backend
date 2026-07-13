import { Budget } from "../models/budget.model.js";
import { Expense } from "../models/expense.model.js";
import { ApiError } from "../utils/apiError.js";
import Decimal from "decimal.js";

const validateAndDeductMainBudget = async (req, res, next) => {
  const { amount, currency, convertedRate, expenseId } = req.body;
  const isSolo = req.context.type === "solo";
  const budgetFilter = isSolo ? { userId: req.user._id } : { organizationId: req.context.organizationId };

  // 🔹 Validate required fields
  if (amount === undefined) {
    throw new ApiError(400, "Amount is required");
  }

  // 🔹 Fetch main budget
  const budget = await Budget.findOne(budgetFilter);
  if (!budget) {
    throw new ApiError(404, "Main budget not found");
  }

  // 🔹 Parse amount safely
  let deductionAmount;
  try {
    deductionAmount = new Decimal(amount);
  } catch {
    throw new ApiError(400, "Invalid amount format");
  }

  // 🔹 Validate amount is positive
  if (deductionAmount.lte(0)) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  // 🔹 Handle currency conversion if expense currency is different from budget currency
  const budgetCurrency = budget.currency || "USD";
  if (currency && currency.toUpperCase() !== budgetCurrency.toUpperCase()) {
    if (!convertedRate) {
      throw new ApiError(400, "Converted rate is required for foreign currencies");
    }
    let rate;
    try {
      rate = new Decimal(convertedRate);
    } catch {
      throw new ApiError(400, "Invalid converted rate format");
    }
    if (rate.lte(0)) {
      throw new ApiError(400, "Converted rate must be greater than 0");
    }
    deductionAmount = deductionAmount.mul(rate);
  }

  // 🔹 Handle expense editing budget check (validate the difference)
  let oldBaseAmount = new Decimal(0);
  if (expenseId) {
    const existingExpense = await Expense.findById(expenseId);
    if (existingExpense) {
      let oldAmountDec = new Decimal(existingExpense.amount.toString());
      if (existingExpense.currency !== budgetCurrency) {
        const rateStr = existingExpense.conversionRate?.toString() || existingExpense.convertedRate?.toString() || "1";
        const oldRate = new Decimal(rateStr);
        oldBaseAmount = oldAmountDec.mul(oldRate);
      } else {
        oldBaseAmount = oldAmountDec;
      }
    }
  }

  const netDeduction = deductionAmount.minus(oldBaseAmount);

  // 🔹 Validate main budget balance if there is an increase in spending
  if (netDeduction.gt(0)) {
    const availableBudget = new Decimal(budget.remainingAmount.toString());
    if (availableBudget.lt(netDeduction)) {
      throw new ApiError(403, "Insufficient main budget balance");
    }
  }

  // 🔹 Attach data to request
  req.deductionAmount = deductionAmount.toString(); // new base amount as string for precision
  req.oldBaseAmount = oldBaseAmount.toString();     // old base amount as string for precision
  req.budgetId = budget._id;
    console.log("budget middleware");

  next(); // Proceed to controller
};

export { validateAndDeductMainBudget };