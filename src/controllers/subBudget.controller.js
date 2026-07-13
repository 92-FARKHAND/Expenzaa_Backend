import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js";
import {ApiResponse} from "../utils/apiResponse.js";
import { SubBudget } from "../models/subBudget.model.js";
import { Budget } from "../models/budget.model.js";
import { Category } from "../models/category.model.js";
import { getOwnerFilter } from "../utils/filterOwner.js";
import mongoose from "mongoose";
import Decimal from "decimal.js";



const formatSubBudget = (subBudgetDoc) => {
  if (!subBudgetDoc) return null;

  // Convert mongoose document to plain object if needed
  const subBudget =
    typeof subBudgetDoc.toObject === "function"
      ? subBudgetDoc.toObject()
      : subBudgetDoc;

  return {
    ...subBudget,
    // Convert Decimal128 to string
    allocatedAmount: subBudget.allocatedAmount?.toString() || "0",
    spentAmount: subBudget.spentAmount?.toString() || "0",
    remainingAmount: subBudget.remainingAmount?.toString() || "0",
  };
};

const setSubBudget = asyncHandler(async (req, res) => {
  const { allocatedAmount, currency } = req.body;
  const { categoryId } = req.params;

  // =======================
  // 1. VALIDATE INPUT
  // =======================
  if (allocatedAmount === undefined && !currency) {
    throw new ApiError(
      400,
      "At least allocatedAmount or currency is required"
    );
  }

  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(400, "Invalid category ID");
  }

  if (
    allocatedAmount !== undefined &&
    (isNaN(allocatedAmount) || Number(allocatedAmount) < 0)
  ) {
    throw new ApiError(
      400,
      "Allocated amount must be a valid positive number"
    );
  }

  // =======================
  // 2. OWNERSHIP VALIDATION
  // =======================
  const ownerFilter = getOwnerFilter(req);

  const category = await Category.findOne({
    _id: categoryId,
  });

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const subBudget = await SubBudget.findOne({
    ...ownerFilter,
    categoryId,
  });

  if (!subBudget) {
    throw new ApiError(404, "SubBudget not found");
  }

  const budget = await Budget.findOne(ownerFilter);

  if (!budget) {
    throw new ApiError(404, "Budget not found");
  }

  // =======================
  // 3. PREPARE UPDATE FIELDS
  // =======================
  const updatedFields = {};

  if (currency) {
    updatedFields.currency = currency.trim().toUpperCase();
  }

  if (allocatedAmount !== undefined) {
    const oldAllocated = new Decimal(subBudget.allocatedAmount.toString());
    const newAllocated = new Decimal(String(allocatedAmount));
    const spent = new Decimal(subBudget.spentAmount.toString());

    // Cannot allocate less than spent
    if (newAllocated.lessThan(spent)) {
      throw new ApiError(
        400,
        `Allocated amount (${newAllocated}) cannot be less than spent (${spent})`
      );
    }

    // =======================
    // 4. CHECK TOTAL BUDGET LIMIT
    // =======================
    const result = await SubBudget.aggregate([
      {
        $match: ownerFilter,
      },
      {
        $group: {
          _id: null,
          totalAllocated: {
            $sum: "$allocatedAmount",
          },
        },
      },
    ]);

    const currentTotalAllocated = new Decimal(
      result[0]?.totalAllocated?.toString() || "0"
    );

    const updatedTotalAllocated = currentTotalAllocated
      .minus(oldAllocated)
      .plus(newAllocated);

    const totalBudget = new Decimal(budget.totalAmount.toString());

    if (updatedTotalAllocated.greaterThan(totalBudget)) {
      throw new ApiError(
        400,
        `Total allocated amount (${updatedTotalAllocated}) cannot exceed budget amount (${totalBudget})`
      );
    }

    updatedFields.allocatedAmount =
      mongoose.Types.Decimal128.fromString(newAllocated.toString());

    updatedFields.remainingAmount =
      mongoose.Types.Decimal128.fromString(
        newAllocated.minus(spent).toString()
      );
  }

  if (!Object.keys(updatedFields).length) {
    throw new ApiError(400, "No fields to update");
  }

  // =======================
  // 5. UPDATE SUBBUDGET
  // =======================
  const updatedSubBudget = await SubBudget.findOneAndUpdate(
    {
      ...ownerFilter,
      categoryId,
    },
    {
      $set: updatedFields,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subBudget: formatSubBudget(updatedSubBudget),
      },
      "SubBudget updated successfully"
    )
  );
});

const getAllSubBudgets = asyncHandler(async (req, res) => {
  // ============ STEP 1: BUILD OWNERSHIP FILTER ============
  const ownerFilter = getOwnerFilter(req);

  // ============ STEP 2: FETCH ALL SUB-BUDGETS WITH CATEGORY INFO ============
  const subBudgets = await SubBudget.aggregate([
    // STAGE 1: MATCH - Get SubBudgets for current context
    {
      $match: ownerFilter,
    },

    // STAGE 2: LOOKUP - Join with Category collection
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },

    // STAGE 3: UNWIND - Flatten category array
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },

    // STAGE 4: PROJECT - Shape output
    {
      $project: {
        _id: 1,
        categoryId: 1,
        allocatedAmount: { $toString: "$allocatedAmount" },
        spentAmount: { $toString: "$spentAmount" },
        remainingAmount: { $toString: "$remainingAmount" },
        currency: 1,
        category: {
          _id: 1,
          name: 1,
          image: 1,
        },
      },
    },

    // STAGE 5: SORT - Sort by category name
    {
      $sort: { "category.name": 1 },
    },
  ]);

  // ============ STEP 3: VALIDATE RESULTS ============
  if (!subBudgets || subBudgets.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { subBudgets: [] }, "No SubBudgets found")
    );
  }

  // ============ STEP 4: RETURN RESPONSE ============
  return res.status(200).json(
    new ApiResponse(
      200,
      { subBudgets },
      "All SubBudgets fetched successfully"
    )
  );
});

//  const setSubBudget = asyncHandler(async (req, res) => {
//   const {allocatedAmount, currency} = req.body;
//   const userId = req.user._id;
//   const { categoryId } = req.params;

//   if (allocatedAmount===undefined && !currency) {
//     throw new ApiError(400, "At least one field is required");
//   }
//   if (!mongoose.Types.ObjectId.isValid(categoryId)) {
//     throw new ApiError(400, "Invalid category ID");
//   }

//   // Check if category exists
//   const category = await Category.findById(categoryId);
//   if (!category) {
//     throw new ApiError(404, "Category not found");
//   }

//   // 🔹 Find existing budget
//   const existingSubBudget = await SubBudget.findOne({ userId, categoryId });
//   if (!existingSubBudget) {
//     throw new ApiError(404, "Budget not found for this user");
//   }
//   const oldSubAllocated = new Decimal(existingSubBudget.allocatedAmount);
//   // 🔹 Prepare updated fields
//   const updatedFields = {
//     ...(currency && { currency }),
//   };

//   // 🔹 Handle allocatedAmount update (and recalc remaining)
//   if (allocatedAmount !== undefined) {
//   const newAllocated = new Decimal(String(allocatedAmount).replace(/"/g, ""));
//   const spent = new Decimal(existingSubBudget.spentAmount.toString());

//   const newSubRemaining = newAllocated.minus(spent);
//   if (newSubRemaining.isNegative()) {
//   throw new ApiError(400, "Allocated amount cannot be less than spent amount");
// }


//   updatedFields.allocatedAmount =
//     mongoose.Types.Decimal128.fromString(allocatedAmount.toString());
//   updatedFields.remainingAmount =
//     mongoose.Types.Decimal128.fromString(newSubRemaining.toString());
// }


//   // Create or update SubBudget
//   const updatedSubBudget = await SubBudget.findOneAndUpdate(
//     { userId, categoryId },
//     { $set: updatedFields },
//     { new: true }
//   );

//   if (!updatedSubBudget) {
//     throw new ApiError(500, "Failed to update budget");
//   }

//   const budget = await Budget.findOne({userId});
//   if(updatedSubBudget){
//     // ✅ Update main budget
//     const budgetTotal = new Decimal(budget.totalAmount?.toString() || "0");
//     const budgetRemaining = new Decimal(budget.remainingAmount?.toString() || "0");
//     const newBudgetRemaining = budgetRemaining.minus(oldSubAllocated).plus(newAllocated)
//     budget.remainingAmount = mongoose.Types.Decimal128.fromString(newBudgetRemaining.toString());
//     await budget.save();
//   }
//   return res
//     .status(200)
//     .json(
//       new ApiResponse(
//         200,
//         { SubBudget: formatSubBudget(updatedSubBudget) },
//         "Budget updated successfully"
//       )
//     );
// });




// ============================================================
// GET ALL SUB-BUDGETS

// const getSubBudget = asyncHandler(async(req,res)=>{
//   const {categoryId} = req.params;
//   const subBudget = await SubBudget.findOne({
//     userId:req.user._id,
//     categoryId
//   });
//     const formatted = formatSubBudget(subBudget);
//   return res
//   .status(200)
//   .json(
//     new  ApiResponse(200, formatted , "SubBudget details get successfully")
//   );
// });

export{
  setSubBudget,
  getAllSubBudgets
}