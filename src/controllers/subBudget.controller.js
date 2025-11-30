import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js";
import {ApiResponse} from "../utils/apiResponse.js";
import { SubBudget } from "../models/subBudget.model.js";
import { Category } from "../models/category.model.js";
import mongoose from "mongoose";
import Decimal from "decimal.js";

 const setSubBudget = asyncHandler(async (req, res) => {
  const {allocatedAmount, currency} = req.body;
  const userId = req.user._id;
  const { categoryId } = req.params;

  if (!allocatedAmount && !currency) {
    throw new ApiError(400, "At least one field is required");
  }
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(400, "Invalid category ID");
  }

  // Check if category exists
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  // 🔹 Find existing budget
  const existingSubBudget = await SubBudget.findOne({ userId, categoryId });
  if (!existingSubBudget) {
    throw new ApiError(404, "Budget not found for this user");
  }

  // 🔹 Prepare updated fields
  const updatedFields = {
    ...(currency && { currency }),
  };

  // 🔹 Handle allocatedAmount update (and recalc remaining)
  if (allocatedAmount !== undefined) {
  const allocated = new Decimal(String(allocatedAmount).replace(/"/g, ""));
  const remaining = new Decimal(existingSubBudget.remainingAmount.toString());
  const spent = new Decimal(existingSubBudget.spentAmount.toString());

  const newAllocatedAmount = allocated.plus(remaining);
  const newRemaining = newAllocatedAmount.minus(spent);

  updatedFields.allocatedAmount =
    mongoose.Types.Decimal128.fromString(newAllocatedAmount.toString());
  updatedFields.remainingAmount =
    mongoose.Types.Decimal128.fromString(newRemaining.toString());
}


  // Create or update SubBudget
  const updatedSubBudget = await SubBudget.findOneAndUpdate(
    { userId, categoryId },
    { $set: updatedFields },
    { new: true, upsert: true }
  );

  if (!updatedSubBudget) {
    throw new ApiError(500, "Failed to update budget");
  }

  // 🔹 Convert Decimal128 to readable numbers for response
  const formattedSubBudget = {
    ...updatedSubBudget,
    allocatedAmount: updatedSubBudget.allocatedAmount.toString(),
    spentAmount: updatedSubBudget.spentAmount.toString(),
    remainingAmount: updatedSubBudget.remainingAmount.toString(),
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { SubBudget: formattedSubBudget },
        "Budget updated successfully"
      )
    );
});




const getSubBudget = asyncHandler(async(req,res)=>{
  const {categoryId} = req.params;
  const subBudget = await SubBudget.findOne({
    userId:req.user._id,
    categoryId
  });
    const formatted = {
    ...subBudget.toObject(),
    allocatedAmount: parseFloat(subBudget.allocatedAmount?.toString() || 0),
    spentAmount: parseFloat(subBudget.spentAmount?.toString() || 0),
    remainingAmount: parseFloat(subBudget.remainingAmount?.toString() || 0),
  };

  return res
  .status(200)
  .json(
    new  ApiResponse(200, formatted , "SubBudget details get successfully")
  );
});

export{
  setSubBudget,
  getSubBudget
}