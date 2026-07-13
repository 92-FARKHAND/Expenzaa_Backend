import mongoose from "mongoose";
import { Expense } from "../models/expense.model.js";
import { Budget } from "../models/budget.model.js";
import { SubBudget } from "../models/subBudget.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Decimal from "decimal.js";
import { getOwnerFilter } from "../utils/filterOwner.js";
import ExcelJS from "exceljs";


const formatExpense = (expense) => {
  return {
    ...expense,
    // Convert all Decimal128 fields to strings
    amount: expense.amount?.toString() || "0",
    convertedRate: expense.convertedRate?.toString() || null,
    conversionRate: expense.conversionRate?.toString() || null,
    // Add computed fields for frontend
    category: expense.categoryId?.name || "Unknown",
    categoryImage:
      expense.categoryId?.image ||
      "https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif",
  };
};

//CREATE EXPENSE
const createExpense = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      title,
      amount,
      currency,
      description,
      categoryId,
      convertedRate,
      conversionRate,
    } = req.body;

    // Validation
    if (!title || !amount || !currency || !description || !categoryId) {
      throw new ApiError(400, "All fields are required");
    }

    if (isNaN(amount) || Number(amount) <= 0) {
      throw new ApiError(400, "Amount must be a positive number");
    }

    // Prepare expense data
    const expenseData = {
      title: title.trim(),
      amount: mongoose.Types.Decimal128.fromString(amount.toString()),
      currency: currency.trim().toUpperCase(),
      description: description.trim(),
      categoryId,
      convertedRate: convertedRate
        ? mongoose.Types.Decimal128.fromString(convertedRate.toString())
        : null,
      conversionRate: conversionRate
        ? mongoose.Types.Decimal128.fromString(conversionRate.toString())
        : null,
    };

    if (req.context.type === "solo") {
      expenseData.userId = req.user._id;
    } else {
      expenseData.organizationId = req.context.organizationId;
      expenseData.createdBy = req.user._id;
    }

    // Main Budget Validation

    const budget = await Budget.findOne(getOwnerFilter(req)).session(session);

    if (!budget) {
      throw new ApiError(404, "Budget not found");
    }

    const expenseBaseAmount = new Decimal(amount.toString());

    const currentRemaining = new Decimal(
      budget.remainingAmount?.toString() || "0"
    );

    if (currentRemaining.lt(expenseBaseAmount)) {
      throw new ApiError(400, "Insufficient main budget");
    }

    // Sub Budget Validation

    const subBudget = await SubBudget.findOne({
      categoryId,
      ...getOwnerFilter(req),
    }).session(session);

    if (!subBudget) {
      throw new ApiError(404, "Sub-budget not found");
    }

    const subRemaining = new Decimal(
      subBudget.remainingAmount?.toString() || "0"
    );

    if (subRemaining.lt(expenseBaseAmount)) {
      throw new ApiError(400, "Insufficient category budget");
    }

    // Create Expense

    const [newExpense] = await Expense.create([expenseData], { session });

    // Update Main Budget

    const currentSpent = new Decimal(budget.spentAmount?.toString() || "0");

    budget.spentAmount = mongoose.Types.Decimal128.fromString(
      currentSpent.plus(expenseBaseAmount).toString()
    );

    budget.remainingAmount = mongoose.Types.Decimal128.fromString(
      currentRemaining.minus(expenseBaseAmount).toString()
    );

    await budget.save({ session });

    // Update Sub Budget

    const subSpent = new Decimal(subBudget.spentAmount?.toString() || "0");

    const subAllocated = new Decimal(
      subBudget.allocatedAmount?.toString() || "0"
    );

    const newSubSpent = subSpent.plus(expenseBaseAmount);

    subBudget.spentAmount = mongoose.Types.Decimal128.fromString(
      newSubSpent.toString()
    );

    subBudget.remainingAmount = mongoose.Types.Decimal128.fromString(
      subAllocated.minus(newSubSpent).toString()
    );

    await subBudget.save({ session });

    // Commit transaction
    await session.commitTransaction();

    // Populate expense
    const populatedExpense = await Expense.findById(newExpense._id)
      .populate("categoryId", "name image")
      .lean();

    const formattedExpense = formatExpense(populatedExpense);

    return res.status(201).json(
      new ApiResponse(
        201,
        formattedExpense,
        "Expense created successfully"
      )
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

const editExpense = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const {
      expenseId,
      title,
      amount,
      currency,
      description,
      categoryId,
      convertedRate,
    } = req.body;

    // Validation
    if (!expenseId) {
      throw new ApiError(400, "Expense ID is required");
    }

    // Fetch existing expense
    const existingExpense = await Expense.findOne({
      _id: expenseId,
      ...getOwnerFilter(req),
    }).session(session);

    if (!existingExpense) {
      throw new ApiError(
        404,
        "Expense not found or you don't have permission to edit it"
      );
    }

    // Fetch main budget
    const budget = await Budget.findOne(getOwnerFilter(req)).session(session);

    if (!budget) {
      throw new ApiError(404, "Budget not found");
    }

    const budgetCurrency = budget.currency || "USD";

    // Calculate old base amount
    const oldAmountDec = new Decimal(
      existingExpense.amount?.toString() || "0"
    );

    let oldBaseAmount = oldAmountDec;

    if (existingExpense.currency !== budgetCurrency) {
      const rate =
        existingExpense.conversionRate?.toString() ||
        existingExpense.convertedRate?.toString() ||
        "1";

      oldBaseAmount = oldAmountDec.mul(new Decimal(rate));
    }

    // New base amount
    const newBaseAmount = new Decimal(amount.toString());

    // Difference (+ means expense increased, - means decreased)
    const baseAmountDifference = newBaseAmount.minus(oldBaseAmount);

    // Update Main Budget

    const currentSpent = new Decimal(
      budget.spentAmount?.toString() || "0"
    );

    const currentRemaining = new Decimal(
      budget.remainingAmount?.toString() || "0"
    );

    const updatedSpent = currentSpent.plus(baseAmountDifference);
    const updatedRemaining = currentRemaining.minus(baseAmountDifference);

    if (updatedRemaining.lt(0)) {
      throw new ApiError(400, "Insufficient main budget");
    }
    budget.spentAmount =
      mongoose.Types.Decimal128.fromString(updatedSpent.toString());

    budget.remainingAmount =
      mongoose.Types.Decimal128.fromString(updatedRemaining.toString());

    await budget.save({ session });

    // Update Sub Budget

    const oldCategoryId = existingExpense.categoryId?.toString();
    const newCategoryId = categoryId?.toString() || oldCategoryId;

    const categoryChanged =
      categoryId && newCategoryId !== oldCategoryId;

    if (categoryChanged) {
      // Credit old category budget
      const oldSubBudget = await SubBudget.findOne({
        categoryId: oldCategoryId,
        ...getOwnerFilter(req),
      }).session(session);

      if (oldSubBudget) {
        const oldSpent = new Decimal(
          oldSubBudget.spentAmount?.toString() || "0"
        );
        const oldAllocated = new Decimal(
          oldSubBudget.allocatedAmount?.toString() || "0"
        );

        const updatedOldSpent =
          oldSpent.minus(oldBaseAmount);

        oldSubBudget.spentAmount =
          mongoose.Types.Decimal128.fromString(
            updatedOldSpent.toString()
          );

        oldSubBudget.remainingAmount =
          mongoose.Types.Decimal128.fromString(
            oldAllocated.minus(updatedOldSpent).toString()
          );

        await oldSubBudget.save({ session });
      }

      // Debit new category budget
      const newSubBudget = await SubBudget.findOne({
        categoryId: newCategoryId,
        ...getOwnerFilter(req),
      }).session(session);

      if (!newSubBudget) {
        throw new ApiError(404, "New category budget not found");
      }
      const newSpent = new Decimal(
        newSubBudget.spentAmount?.toString() || "0"
      );
      const newAllocated = new Decimal(
        newSubBudget.allocatedAmount?.toString() || "0"
      );
      const updatedNewSpent =
        newSpent.plus(newBaseAmount);
      if (newAllocated.minus(updatedNewSpent).lt(0)) {
        throw new ApiError(400, "Insufficient category budget");
      }
      newSubBudget.spentAmount =
        mongoose.Types.Decimal128.fromString(
          updatedNewSpent.toString()
        );
      newSubBudget.remainingAmount =
        mongoose.Types.Decimal128.fromString(
          newAllocated.minus(updatedNewSpent).toString()
        );
      await newSubBudget.save({ session });

    } else {

      // Same category, adjust by difference

      const subBudget = await SubBudget.findOne({
        categoryId: oldCategoryId,
        ...getOwnerFilter(req),
      }).session(session);

      if (!subBudget) {
        throw new ApiError(404, "Sub-budget not found");
      }

      const currentSubSpent = new Decimal(
        subBudget.spentAmount?.toString() || "0"
      );
      const allocated = new Decimal(
        subBudget.allocatedAmount?.toString() || "0"
      );
      const updatedSubSpent =
        currentSubSpent.plus(baseAmountDifference);

      if (allocated.minus(updatedSubSpent).lt(0)) {
        throw new ApiError(400, "Insufficient category budget");
      }
      subBudget.spentAmount =
        mongoose.Types.Decimal128.fromString(
          updatedSubSpent.toString()
        );
      subBudget.remainingAmount =
        mongoose.Types.Decimal128.fromString(
          allocated.minus(updatedSubSpent).toString()
        );
      await subBudget.save({ session });
    }

    // Update Expense

    const updatedFields = {};
    if (title !== undefined && title !== null) {
      updatedFields.title = title.trim();
    }
    if (currency !== undefined && currency !== null) {
      updatedFields.currency =
        currency.trim().toUpperCase();
    }
    if (description !== undefined && description !== null) {
      updatedFields.description = description.trim();
    }
    if (categoryId !== undefined && categoryId !== null) {
      updatedFields.categoryId = categoryId;
    }

    if (convertedRate !== undefined && convertedRate !== null) {
      updatedFields.convertedRate =
        mongoose.Types.Decimal128.fromString(
          convertedRate.toString()
        );

    updatedFields.conversionRate =
        mongoose.Types.Decimal128.fromString(
          convertedRate.toString()
        );
    }

    if (amount !== undefined && amount !== null) {
      updatedFields.amount =
        mongoose.Types.Decimal128.fromString(
          amount.toString()
        );
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      expenseId,
      { $set: updatedFields,},
      {
        new: true,
        runValidators: true,
        session,
      }
    );

    if (!updatedExpense) {
      throw new ApiError(500, "Failed to update expense");
    }
    // Commit transaction
    await session.commitTransaction();
    // Populate after transaction
    const populatedExpense = await Expense.findById(
      expenseId
    )
      .populate("categoryId", "name image")
      .lean();
    const formattedExpense =
      formatExpense(populatedExpense);

    return res.status(200).json(
      new ApiResponse(200,formattedExpense,"Expense updated successfully")
    );

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {session.endSession();}
});
//EDIT EXPENSE
// const editExpense = asyncHandler(async (req, res) => {
//   const {
//     expenseId,
//     title,
//     amount,
//     currency,
//     description,
//     categoryId,
//     convertedRate,
//   } = req.body;

//   //Validation
//   if (!expenseId) {
//     throw new ApiError(400, "Expense ID is required");
//   }

//   // Fetch expense and verify ownership
//   const existingExpense = await Expense.findOne({
//     _id: expenseId,
//     ...getOwnerFilter(req)
//   });

//   if (!existingExpense) {
//     throw new ApiError(404, "Expense not found or you don't have permission to edit it");
//   }

//   // Calculate base currency amounts
//   const budget = await Budget.findOne(getOwnerFilter(req));
//   const budgetCurrency = budget?.currency || "USD";

//   const oldAmountDec = new Decimal(existingExpense.amount.toString());
//   let oldBaseAmount = oldAmountDec;
//   if (existingExpense.currency !== budgetCurrency) {
//     const rateStr = existingExpense.conversionRate?.toString() || existingExpense.convertedRate?.toString() || "1";
//     oldBaseAmount = oldAmountDec.mul(new Decimal(rateStr));
//   }

//   const newBaseAmount = new Decimal(req.deductionAmount);
//   const baseAmountDifference = newBaseAmount.minus(oldBaseAmount);

//   // // 1. Update Main Budget
//   // if (budget) {
//   //   const currentSpent = new Decimal(budget.spentAmount?.toString() || "0");
//   //   const newSpent = currentSpent.plus(baseAmountDifference);
//   //   budget.spentAmount = mongoose.Types.Decimal128.fromString(newSpent.toString());
//   //   await budget.save();
//   // }

//   // // 2. Update Sub-Budget(s)
//   const oldCategoryId = existingExpense.categoryId?.toString();
//   const newCategoryId = categoryId?.toString();
//   const categoryChanged = categoryId && newCategoryId !== oldCategoryId;

//   if (categoryChanged) {
//     // Credit old sub-budget
//     const oldSubBudget = await SubBudget.findOne({
//       categoryId: oldCategoryId,
//       ...getOwnerFilter(req)
//     });
//     if (oldSubBudget) {
//       const oldSubSpent = new Decimal(oldSubBudget.spentAmount?.toString() || "0");
//       const oldSubAllocated = new Decimal(oldSubBudget.allocatedAmount?.toString() || "0");

//       const updatedOldSubSpent = oldSubSpent.minus(oldBaseAmount);
//       const updatedOldSubRemaining = oldSubAllocated.minus(updatedOldSubSpent);

//       oldSubBudget.spentAmount = mongoose.Types.Decimal128.fromString(updatedOldSubSpent.toString());
//       oldSubBudget.remainingAmount = mongoose.Types.Decimal128.fromString(updatedOldSubRemaining.toString());
//       await oldSubBudget.save();
//     }

//     // Debit new sub-budget
//     const newSubBudget = await SubBudget.findOne({
//       categoryId: newCategoryId,
//       ...getOwnerFilter(req)
//     });
//     if (newSubBudget) {
//       const newSubSpent = new Decimal(newSubBudget.spentAmount?.toString() || "0");
//       const newSubAllocated = new Decimal(newSubBudget.allocatedAmount?.toString() || "0");

//       const updatedNewSubSpent = newSubSpent.plus(newBaseAmount);
//       const updatedNewSubRemaining = newSubAllocated.minus(updatedNewSubSpent);

//       newSubBudget.spentAmount = mongoose.Types.Decimal128.fromString(updatedNewSubSpent.toString());
//       newSubBudget.remainingAmount = mongoose.Types.Decimal128.fromString(updatedNewSubRemaining.toString());
//       await newSubBudget.save();
//     }
//   } else {
//     // Same category, adjust spent by difference
//     const subBudget = await SubBudget.findOne({
//       categoryId: oldCategoryId,
//       ...getOwnerFilter(req)
//     });
//     if (subBudget) {
//       const subSpent = new Decimal(subBudget.spentAmount?.toString() || "0");
//       const subAllocated = new Decimal(subBudget.allocatedAmount?.toString() || "0");

//       const updatedSubSpent = subSpent.plus(baseAmountDifference);
//       const updatedSubRemaining = subAllocated.minus(updatedSubSpent);

//       subBudget.spentAmount = mongoose.Types.Decimal128.fromString(updatedSubSpent.toString());
//       subBudget.remainingAmount = mongoose.Types.Decimal128.fromString(updatedSubRemaining.toString());
//       await subBudget.save();
//     }
//   }

//   // 3. Prepare Update Fields on Expense Document
//   const updatedFields = {};
//   if (title !== undefined && title !== null) {
//     updatedFields.title = title.trim();
//   }
//   if (currency !== undefined && currency !== null) {
//     updatedFields.currency = currency.trim().toUpperCase();
//   }
//   if (description !== undefined && description !== null) {
//     updatedFields.description = description.trim();
//   }
//   if (categoryId !== undefined && categoryId !== null) {
//     updatedFields.categoryId = categoryId;
//   }
//   if (convertedRate !== undefined && convertedRate !== null) {
//     updatedFields.convertedRate = mongoose.Types.Decimal128.fromString(convertedRate.toString());
//     updatedFields.conversionRate = mongoose.Types.Decimal128.fromString(convertedRate.toString());
//   }
//   if (amount !== undefined && amount !== null) {
//     updatedFields.amount = mongoose.Types.Decimal128.fromString(amount.toString());
//   }

//   // Update in DB
//   const updatedExpense = await Expense.findByIdAndUpdate(
//     expenseId,
//     { $set: updatedFields },
//     { new: true, runValidators: true }
//   )
//     .populate("categoryId", "name image")
//     .lean();

//   if (!updatedExpense) {
//     throw new ApiError(500, "Failed to update expense");
//   }

//   const formattedExpense = formatExpense(updatedExpense);

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(200, formattedExpense, "Expense Update successfully")
//     )
// });

//DELETE EXPENSE

const deleteExpense = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  if (!expenseId) {
    throw new ApiError(400, "Expense ID is required");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Fetch expense and verify ownership
    const expense = await Expense.findOne({
      _id: expenseId,
      ...getOwnerFilter(req),
    }).session(session);

    if (!expense) {
      throw new ApiError(404, "Expense not found or unauthorized");
    }

    // Fetch budget
    const budget = await Budget.findOne(getOwnerFilter(req)).session(session);
    const budgetCurrency = budget?.currency || "USD";

    // Calculate amount in budget currency
    const expenseAmount = new Decimal(expense.amount.toString());
    let expenseBaseAmount = expenseAmount;

    if (expense.currency !== budgetCurrency) {
      const rate = new Decimal(
        expense.conversionRate?.toString() ||
          expense.convertedRate?.toString() ||
          "1"
      );

      expenseBaseAmount = expenseAmount.mul(rate);
    }

    // Update Main Budget
    if (budget) {
      const currentSpent = new Decimal(
        budget.spentAmount?.toString() || "0"
      );

      const updatedSpent = currentSpent.minus(expenseBaseAmount);

      budget.spentAmount = mongoose.Types.Decimal128.fromString(
        updatedSpent.toString()
      );

      await budget.save({ session });
    }

    // Update Sub Budget
    const subBudget = await SubBudget.findOne({
      categoryId: expense.categoryId,
      ...getOwnerFilter(req),
    }).session(session);

    if (subBudget) {
      const spent = new Decimal(
        subBudget.spentAmount?.toString() || "0"
      );

      const allocated = new Decimal(
        subBudget.allocatedAmount?.toString() || "0"
      );

      const updatedSpent = spent.minus(expenseBaseAmount);
      const updatedRemaining = allocated.minus(updatedSpent);

      subBudget.spentAmount = mongoose.Types.Decimal128.fromString(
        updatedSpent.toString()
      );

      subBudget.remainingAmount = mongoose.Types.Decimal128.fromString(
        updatedRemaining.toString()
      );

      await subBudget.save({ session });
    }

    // Delete Expense
    await Expense.deleteOne({ _id: expenseId }).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json(
      new ApiResponse(200, {}, "Expense deleted successfully")
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    throw error;
  }
});
// const deleteExpense = asyncHandler(async (req, res) => {
//   const { expenseId } = req.params;

//   if (!expenseId) {
//     throw new ApiError(400, "Expense ID is required");
//   }

//   // Fetch expense and verify ownership
//   const expense = await Expense.findOne({ _id: expenseId, ...getOwnerFilter(req) });

//   if (!expense) {
//     throw new ApiError(404, "Expense not found or unauthorized");
//   }

//   // Calculate base currency amount to credit back
//   const budget = await Budget.findOne(getOwnerFilter(req));
//   const budgetCurrency = budget?.currency || "USD";

//   const expenseAmountDec = new Decimal(expense.amount.toString());
//   let expenseBaseAmount = expenseAmountDec;
//   if (expense.currency !== budgetCurrency) {
//     const rateStr = expense.conversionRate?.toString() || expense.convertedRate?.toString() || "1";
//     expenseBaseAmount = expenseAmountDec.mul(new Decimal(rateStr));
//   }

//   // 1. Credit back Main Budget
//   if (budget) {
//     const currentSpent = new Decimal(budget.spentAmount?.toString());
//     const newSpent = currentSpent.minus(expenseBaseAmount);
//     budget.spentAmount = mongoose.Types.Decimal128.fromString(newSpent.toString());
//     await budget.save();
//   }

//   // 2. Credit back Sub-Budget
//   const subBudget = await SubBudget.findOne({
//     categoryId: expense.categoryId,
//     ...getOwnerFilter(req),
//   });
//   if (subBudget) {
//     const subSpent = new Decimal(subBudget.spentAmount?.toString());
//     const subAllocated = new Decimal(subBudget.allocatedAmount?.toString());

//     const newSubSpent = subSpent.minus(expenseBaseAmount);
//     const newSubRemaining = subAllocated.minus(newSubSpent);

//     subBudget.spentAmount = mongoose.Types.Decimal128.fromString(newSubSpent.toString());
//     subBudget.remainingAmount = mongoose.Types.Decimal128.fromString(newSubRemaining.toString());
//     await subBudget.save();
//   }

//   // Delete from DB
//   await Expense.findByIdAndDelete(expenseId);

//   return res.status(200).json(
//     new ApiResponse(200, {}, "Expense deleted successfully")
//   );
// });

//GET CONTEXT BASE EXPENSES

const getExpensesByContext = asyncHandler(async (req, res) => {
  //Build filter based on context
  const ownerFilter = getOwnerFilter(req);
  console.log(ownerFilter);

  //fetch expense
  const expenses = await Expense.find(ownerFilter)
    .populate("categoryId", "name image")
    .sort({ createdAt: -1 }) // Newest first
    .lean();

  //format expense & return
  const formattedExpenses = expenses.map(formatExpense);

  return res.status(200).json(
    new ApiResponse(
      200,
      { expenses: formattedExpenses },
      "Expenses fetched successfully"
    )
  );
});

const getMonthlyExpenses = asyncHandler(async (req, res) => {
  const ownerFilter = getOwnerFilter(req);
  console.log(ownerFilter);
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const expenses = await Expense.find({
    ...ownerFilter,
    createdAt: { $gte: startOfMonth, $lte: endOfMonth }
  })
    .populate("categoryId", "name image")
    .sort({ createdAt: -1 })
    .lean();

  const formattedExpenses = expenses.map(formatExpense);

  return res.status(200).json(
    new ApiResponse(
      200,
      { expenses: formattedExpenses },
      "Monthly expenses fetched successfully"
    )
  );
});

const exportExpenses = asyncHandler(async (req, res) => {
  const ownerFilter = getOwnerFilter(req);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const expenses = await Expense.find({
    ...ownerFilter,
    createdAt: { $gte: startOfMonth, $lte: endOfMonth }
  })
    .populate("categoryId", "name")
    .sort({ createdAt: -1 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Monthly Expenses");

  // Define columns
  sheet.columns = [
    { header: "Date", key: "date", width: 15 },
    { header: "Title", key: "title", width: 20 },
    { header: "Category", key: "category", width: 20 },
    { header: "Amount", key: "amount", width: 15, style: { numFmt: "#,##0.00" } },
    { header: "Description", key: "description", width: 40 }
  ];

  // Add rows
  expenses.forEach(expense => {
    sheet.addRow({
      date: expense.createdAt.toLocaleDateString("en-GB"),
      title: expense.title,
      category: expense.categoryId?.name || "Uncategorized",
      amount: expense.amount.toString(),
      description: expense.description
    });
  });

  // Set response headers
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=monthly_expenses.xlsx");

  // Write workbook to response stream
  await workbook.xlsx.write(res);
  res.end();
});

export {
  createExpense,
  editExpense,
  deleteExpense,
  getExpensesByContext,
  getMonthlyExpenses,
  exportExpenses
};
