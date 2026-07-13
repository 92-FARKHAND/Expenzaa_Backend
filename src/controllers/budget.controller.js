import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { Budget } from "../models/budget.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Decimal from "decimal.js";
import mongoose from "mongoose";
import { getOwnerFilter } from "../utils/filterOwner.js";



const getBudget =  asyncHandler(async (req,res) => {
    const ownerFilter = getOwnerFilter(req);
    const budget = await Budget.findOne(ownerFilter).lean();
    if (!budget) {
        throw new ApiError(404,"Budget not found");
    }
    const formattedBudgets ={
        ...budget,
        totalAmount: Decimal(budget.totalAmount.toString()),
        spentAmount: Decimal(budget.spentAmount.toString()),
        remainingAmount: Decimal(budget.remainingAmount.toString())
    };
    
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {budget:formattedBudgets},
            "Budget fetch Successfully"
        )
    )
});

 const editBudget = asyncHandler(async (req, res) => {
  const { totalAmount, currency, startDate, endDate } = req.body;

  if (!totalAmount && !currency && !startDate && !endDate) {
    throw new ApiError(400, "At least one field is required");
  }

  const ownerFilter = getOwnerFilter(req);

  // 🔹 Find existing budget
  const existingBudget = await Budget.findOne(ownerFilter);
  if (!existingBudget) {
    throw new ApiError(404, "Budget not found for this context");
  }

  // 🔹 Prepare updated fields
  const updatedFields = {
    ...(currency && { currency }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };

  // 🔹 Handle totalAmount update (and recalc remaining)
  if (totalAmount !== undefined) {
    const newTotal = new Decimal(totalAmount);
    const spent = new Decimal(existingBudget.spentAmount.toString());
    const newRemaining = newTotal.minus(spent);

    updatedFields.totalAmount = mongoose.Types.Decimal128.fromString(newTotal.toString());
    updatedFields.remainingAmount = mongoose.Types.Decimal128.fromString(newRemaining.toString());
  }

  // 🔹 Update the document
  const updatedBudget = await Budget.findOneAndUpdate(
    ownerFilter,
    updatedFields,
    { new: true, lean: true }
  );

  if (!updatedBudget) {
    throw new ApiError(500, "Failed to update budget");
  }

  // 🔹 Convert Decimal128 to readable numbers for response
  const formattedBudget = {
    ...updatedBudget,
    totalAmount: updatedBudget.totalAmount.toString(),
    spentAmount: updatedBudget.spentAmount.toString(),
    remainingAmount: updatedBudget.remainingAmount.toString(),
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { budget: formattedBudget },
        "Budget updated successfully"
      )
    );
});

export {
    getBudget,
    editBudget
}