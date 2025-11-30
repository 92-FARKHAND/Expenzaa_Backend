import mongoose from "mongoose";
import { Expense } from "../models/expense.model.js";
import {Budget} from "../models/budget.model.js";
import { SubBudget } from "../models/subBudget.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Decimal from "decimal.js";

const createExpense = asyncHandler(async (req, res) => {
  const {
    title,
    amount,
    currency,
    description,
    categoryId,
    organizationId,
    convertedRate,
    conversionRate,
  } = req.body;

  if (!title || !amount || !currency || !description || !categoryId) {
    throw new ApiError(400, "All fields are required");
  }

  // ✅ Safely convert amount to Decimal128
  const amountDecimal = mongoose.Types.Decimal128.fromString(amount.toString());

  // ✅ Create expense
  const newExpense = await Expense.create({
    title,
    amount: amountDecimal,
    currency: currency.trim().toUpperCase(),
    description: description.trim(),
    categoryId,
    convertedRate: convertedRate
      ? mongoose.Types.Decimal128.fromString(convertedRate.toString())
      : null,
    conversionRate: conversionRate
      ? mongoose.Types.Decimal128.fromString(conversionRate.toString())
      : null,
    userId: req.user._id,
  });

  // ✅ Fetch user’s active budget
  const budget = await Budget.findOne({ userId: req.user._id });
  if (!budget) throw new ApiError(404, "Budget not found for user");

  const expenseAmount = new Decimal(amount);

  // ✅ Update main budget
  const budgetTotal = new Decimal(budget.totalAmount?.toString() || "0");
  const budgetSpent = new Decimal(budget.spentAmount?.toString() || "0");

  const newSpent = budgetSpent.plus(expenseAmount);
  const newRemaining = budgetTotal.minus(newSpent);

  budget.spentAmount = mongoose.Types.Decimal128.fromString(newSpent.toString());
  budget.remainingAmount = mongoose.Types.Decimal128.fromString(newRemaining.toString());
  await budget.save();

  // ✅ Update SubBudget (category specific)
  const subBudget = await SubBudget.findOne({ 
    categoryId, 
    userId: req.user._id 
  });
  if (subBudget) {
    const subSpent = new Decimal(subBudget.spentAmount?.toString() || "0");
    const subAllocated = new Decimal(subBudget.allocatedAmount?.toString() || "0");

    const newSubSpent = subSpent.plus(expenseAmount);
    const newSubRemaining = subAllocated.minus(newSubSpent);

    subBudget.spentAmount = mongoose.Types.Decimal128.fromString(newSubSpent.toString());
    subBudget.remainingAmount = mongoose.Types.Decimal128.fromString(newSubRemaining.toString());
    await subBudget.save();
  }

  // ✅ Populate category info
  const populatedExpense = await Expense.findById(newExpense._id)
    .populate("categoryId", "name image")
    .lean();

  const formattedExpense = {
    ...populatedExpense,
    amount: populatedExpense.amount.toString(),
    category: populatedExpense.categoryId?.name || "Unknown",
    categoryImage:
      populatedExpense.categoryId?.image ||
      "https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif",
  };

  return res
    .status(201)
    .json(new ApiResponse(201, formattedExpense, "Expense created successfully"));
});


const editExpense = asyncHandler(async (req, res) => {
  const {
    expenseId,
    title,
    amount,
    currency,
    description,
    categoryId,
    convertedRate,
  } = req.body;

  // ✅ Step 1: Find existing expense
  const existingExpense = await Expense.findById(expenseId);
  if (!existingExpense) {
    throw new ApiError(404, "Expense not found or already deleted");
  }

  // ✅ Step 2: Prepare update fields
  const updateFields = {};
  if (title !== undefined) updateFields.title = title.trim();
  if (currency !== undefined) updateFields.currency = currency.trim().toUpperCase();
  if (description !== undefined) updateFields.description = description.trim();
  if (convertedRate !== undefined)
    updateFields.convertedRate = mongoose.Types.Decimal128.fromString(convertedRate.toString());
  if (categoryId !== undefined) updateFields.categoryId = categoryId;

  const oldAmount = new Decimal(existingExpense.amount.toString());
  const newAmount = amount !== undefined ? new Decimal(amount) : oldAmount;
  const amountChanged = !oldAmount.equals(newAmount);
  const categoryChanged =
    categoryId !== undefined && categoryId.toString() !== existingExpense.categoryId.toString();

  // ✅ Step 3: If amount changed, update budget and subBudget
  if (amountChanged || categoryChanged) {
    const budget = await Budget.findOne({ userId: req.user.expenseId });
    if (!budget) throw new ApiError(404, "Budget not found for user");

    // Main Budget updates
    const spent = new Decimal(budget.spentAmount?.toString() || "0");
    const total = new Decimal(budget.totalAmount?.toString() || "0");

    let newSpent = spent;
    let newRemaining = total.minus(newSpent);

    // If amount changed (same category)
    if (amountChanged && !categoryChanged) {
      const diff = newAmount.minus(oldAmount); // can be +ve or -ve
      newSpent = spent.plus(diff);
      newRemaining = total.minus(newSpent);

      budget.spentAmount = mongoose.Types.Decimal128.fromString(newSpent.toString());
      budget.remainingAmount = mongoose.Types.Decimal128.fromString(newRemaining.toString());
      await budget.save();

      // Update subBudget of same category
      const subBudget = await SubBudget.findOne({
        categoryId: existingExpense.categoryId,
        userId: req.user._id,
      });

      if (subBudget) {
        const subSpent = new Decimal(subBudget.spentAmount?.toString() || "0");
        const subAllocated = new Decimal(subBudget.allocatedAmount?.toString() || "0");

        const newSubSpent = subSpent.plus(diff);
        const newSubRemaining = subAllocated.minus(newSubSpent);

        subBudget.spentAmount = mongoose.Types.Decimal128.fromString(newSubSpent.toString());
        subBudget.remainingAmount = mongoose.Types.Decimal128.fromString(newSubRemaining.toString());
        await subBudget.save();
      }
    }

    // ✅ If category changed
    if (categoryChanged) {
      const oldCategory = existingExpense.categoryId;
      const newCategory = categoryId;

      // 1️⃣ Return the old expense amount back to old category
      const oldSub = await SubBudget.findOne({ categoryId: oldCategory, userId: req.user._id });
      if (oldSub) {
        const subSpent = new Decimal(oldSub.spentAmount?.toString() || "0");
        const subAllocated = new Decimal(oldSub.allocatedAmount?.toString() || "0");

        const newSubSpent = subSpent.minus(oldAmount);
        const newSubRemaining = subAllocated.minus(newSubSpent);

        oldSub.spentAmount = mongoose.Types.Decimal128.fromString(newSubSpent.toString());
        oldSub.remainingAmount = mongoose.Types.Decimal128.fromString(newSubRemaining.toString());
        await oldSub.save();
      }

      // 2️⃣ Subtract new amount from new category
      const newSub = await SubBudget.findOne({ categoryId: newCategory, userId: req.user._id });
      if (newSub) {
        const subSpent = new Decimal(newSub.spentAmount?.toString() || "0");
        const subAllocated = new Decimal(newSub.allocatedAmount?.toString() || "0");

        const newSubSpent = subSpent.plus(newAmount);
        const newSubRemaining = subAllocated.minus(newSubSpent);

        newSub.spentAmount = mongoose.Types.Decimal128.fromString(newSubSpent.toString());
        newSub.remainingAmount = mongoose.Types.Decimal128.fromString(newSubRemaining.toString());
        await newSub.save();
      }

      // ✅ Adjust main budget spent if amount changed
      const diff = newAmount.minus(oldAmount);
      newSpent = spent.plus(diff);
      newRemaining = total.minus(newSpent);

      budget.spentAmount = mongoose.Types.Decimal128.fromString(newSpent.toString());
      budget.remainingAmount = mongoose.Types.Decimal128.fromString(newRemaining.toString());
      await budget.save();
    }
  }

  // ✅ Step 4: Apply final updates to Expense
  if (amount !== undefined)
    updateFields.amount = mongoose.Types.Decimal128.fromString(amount.toString());

  const updatedExpense = await Expense.findByIdAndUpdate(
    _id,
    { $set: updateFields },
    { new: true }
  )
    .populate("categoryId", "name image")
    .lean();

  const formattedExpense = {
    ...updatedExpense,
    amount: updatedExpense.amount.toString(),
    category: updatedExpense.categoryId?.name || "Unknown",
    categoryImage:
      updatedExpense.categoryId?.image ||
      "https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif",
  };

  return res
    .status(200)
    .json(new ApiResponse(200, formattedExpense, "Expense updated successfully"));
});



const deleteExpense = asyncHandler(async (req,res) => {
    const expense = await Expense.findByIdAndDelete( req.params.expenseId);
    return res 
    .status(200)
    .json(
      new ApiResponse(200,
        {},
        "Expense Deleted Successfully"
      )
    )
});

const getExpensesByUserId = asyncHandler(async (req,res) => {
  const userId = new mongoose.Types.ObjectId(req.user?._id);
    if(!userId) throw new ApiError(400,"User not found")

    const expenses = await Expense.find({userId}).populate("categoryId","name image").lean();
    const formattedExpense = expenses.map((exp)=>{
      return {
        ...exp,
        amount: exp.amount.toString(),
        category: exp.categoryId?.name || "Unknown",
        categoryImage: exp.categoryId?.image || "https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif"
    }
    });
    
    return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {expenses:formattedExpense},
        "Get Expenses Successfully"
      )
    )
});

export {
  createExpense,
  editExpense,
  getExpensesByUserId,
  deleteExpense
}