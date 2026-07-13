import {asyncHandler} from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { Category } from "../models/category.model.js";
import {Expense} from "../models/expense.model.js"
import { uploadOnCloudinary } from "../utils/uploadAndCompression.js";
import mongoose from "mongoose";
import { SubBudget } from "../models/subBudget.model.js";
import { Budget } from "../models/budget.model.js";
import Decimal from "decimal.js";
import { getOwnerFilter } from "../utils/filterOwner.js";


// Create category 
const createCategory = asyncHandler(async (req, res) => {
  const { name, isGeneral = false } = req.body;

  if (!name || name.trim() === "") {
    throw new ApiError(400, "Category name is required");
  }

  const categoryName = name.toLowerCase().trim();

  if (categoryName.length < 2 || categoryName.length > 50) {
    throw new ApiError(400, "Category name must be 2-50 characters");
  }

  const ownerFilter = getOwnerFilter(req);

  // Limit categories
  const categoryCount = await Category.countDocuments(ownerFilter);

  if (categoryCount >= 5) {
    throw new ApiError(
      409,
      "Category limit exceeded. You can create a maximum of 5 categories."
    );
  }

  // Duplicate check
  const existingCategory = await Category.findOne({
    name: categoryName,
    ...ownerFilter,
  });

  if (existingCategory) {
    throw new ApiError(409, "Category with this name already exists");
  }

  // Upload image BEFORE transaction
  let image = null;

  if (req.file?.buffer) {
    try {
      const uploadedImage = await uploadOnCloudinary(req.file.buffer);
      image = uploadedImage?.url;
    } catch (error) {
      console.error("Image upload failed:", error);
    }
  }

  const session = await mongoose.startSession();

  let category;
  let subBudget;

  try {
    session.startTransaction();

    // Find Budget
    const budget = await Budget.findOne(ownerFilter).session(session);

    if (!budget) {
      throw new ApiError(
        404,
        "Budget not found. Please create a budget first before adding categories."
      );
    }

    // Create Category
    const categoryData = {
      name: categoryName,
      image,
      isGeneral,
    };

    if (req.context.type === "solo") {
      categoryData.userId = req.user._id;
    } else {
      categoryData.organizationId = req.context.organizationId;
    }
    
    //Check if not userid and no organizationid 
    if(!categoryData.userId && !categoryData.organizationId){
     throw new ApiError(409,"UserId or organizationId is required");
    }

    const categories = await Category.create([categoryData], {
      session,
    });

    category = categories[0];

    // Create SubBudget
    const subBudgetData = {
      categoryId: category._id,
      budgetId: budget._id,
      allocatedAmount: mongoose.Types.Decimal128.fromString("0"),
      spentAmount: mongoose.Types.Decimal128.fromString("0"),
      remainingAmount: mongoose.Types.Decimal128.fromString("0"),
      currency: budget.currency,
    };

    if (req.context.type === "solo") {
      subBudgetData.userId = req.user._id;
    } else {
      subBudgetData.organizationId = req.context.organizationId;
    }

    const subBudgets = await SubBudget.create([subBudgetData], {
      session,
    });

    subBudget = subBudgets[0];

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  const responseData = {
    category: {
      _id: category._id,
      name: category.name,
      image: category.image,
      isGeneral: category.isGeneral,
      createdAt: category.createdAt,
    },
    subBudget: {
      _id: subBudget._id,
      categoryId: subBudget.categoryId,
      allocatedAmount: subBudget.allocatedAmount.toString(),
      spentAmount: subBudget.spentAmount.toString(),
      remainingAmount: subBudget.remainingAmount.toString(),
    },
  };

  return res.status(201).json(
    new ApiResponse(201, responseData, "Category created successfully")
  );
});
// const createCategory = asyncHandler(async (req, res) => {
//   const { name, isGeneral = false } = req.body;

//   if (!name || name.trim() === "") {
//     throw new ApiError(400, "Category name is required");
//   }

//   const categoryName = name.toLowerCase().trim();

//   // Validate name length
//   if (categoryName.length < 2 || categoryName.length > 50) {
//     throw new ApiError(400, "Category name must be 2-50 characters");
//   }

//   // BUILD OWNERSHIP FILTER
//   const ownerFilter = getOwnerFilter(req);
// // Count existing categories
// const categoryCount = await Category.countDocuments(ownerFilter);

// if (categoryCount >= 5) {
//   throw new ApiError(409,"Category limit exceeded. You can create a maximum of 5 categories.");
// }

// // Check if category name already exists
// const existingCategory = await Category.findOne({
//   name: categoryName.trim(),
//   ...ownerFilter,
// });


//   if (existingCategory) {
//     throw new ApiError(409, "Category with this name already exists");
//   }

//   // UPLOAD IMAGE (OPTIONAL)
//   let image = null;

//   if (req.file?.buffer) {
//     try {
//       const uploadedImg = await uploadOnCloudinary(req.file.buffer);
//       image = uploadedImg?.url;
//     } catch (error) {
//       console.error("Image upload failed:", error);
//       // Don't fail category creation if image upload fails
//       // Just proceed without image
//     }
//   }

//   // PREPARE CATEGORY DATA
//   const categoryData = {
//     name: categoryName,
//     image: image || null,
//     isGeneral: isGeneral || false,
//   };

//   // ADD CONTEXT-SPECIFIC FIELDS
//   if (req.context.type === "solo") {
//     categoryData.userId = req.user._id;
//   } else {
//     categoryData.orgId = req.context.orgId;
//   }

//   // CREATE CATEGORY
//   const category = await Category.create(categoryData);

//   if (!category) {
//     throw new ApiError(500, "Failed to create category");
//   }

//   // FIND ASSOCIATED BUDGET
//   const budget = await Budget.findOne(ownerFilter);

//   if (!budget) {
//     // Delete created category since budget doesn't exist
//     await Category.findByIdAndDelete(category._id);
//     throw new ApiError(
//       404,
//       "Budget not found. Please create a budget first before adding categories."
//     );
//   }

//   // CREATE SUB-BUDGET FOR CATEGORY 
//   // SubBudget links category to budget for tracking allocation
//   let subBudget;

//   try {
//     const subBudgetData = {
//       categoryId: category._id,
//       budgetId: budget._id,
//       allocatedAmount: mongoose.Types.Decimal128.fromString("0"),
//       spentAmount: mongoose.Types.Decimal128.fromString("0"),
//       remainingAmount: mongoose.Types.Decimal128.fromString("0"),
//     };

//     // Add context fields to SubBudget
//     if (req.context.type === "solo") {
//       subBudgetData.userId = req.user._id;
//     } else {
//       subBudgetData.organizationId = req.context.organizationId;
//     }

//     subBudget = await SubBudget.create(subBudgetData);

//     if (!subBudget) {
//       throw new Error("SubBudget creation failed");
//     }
//   } catch (error) {
//     console.error("SubBudget creation error:", error);
//     // Rollback: delete category if SubBudget creation fails
//     await Category.findByIdAndDelete(category._id);
//     throw new ApiError(
//       500,
//       "Failed to create category budget. Please try again."
//     );
//   }

//   // FORMAT AND RETURN RESPONSE
//   const formattedSubBudget = {
//     _id: subBudget._id,
//     categoryId: subBudget.categoryId,
//     allocatedAmount: subBudget.allocatedAmount.toString(),
//     spentAmount: subBudget.spentAmount.toString(),
//     remainingAmount: subBudget.remainingAmount.toString(),
//   };

//   const responseData = {
//     category: {
//       _id: category._id,
//       name: category.name,
//       image: category.image,
//       isGeneral: category.isGeneral,
//       createdAt: category.createdAt,
//     },
//     subBudget: formattedSubBudget,
//   };

//   return res.status(201).json(
//     new ApiResponse(201, responseData, "Category created successfully")
//   );
// });

// Get Categories

const getCategories = asyncHandler(async (req, res) => {
  // BUILD OWNERSHIP FILTER
  const ownerFilter = getOwnerFilter(req);

  // BUILD AGGREGATION PIPELINE
  // Use aggregation to join categories with SubBudgets
  const pipeline = [
    {
      $match: {
        $or: [
          ownerFilter, // User's/org's categories
          { isGeneral: true }, // General categories (shared)
        ],
      },
    },

    // LOOKUP - Join with SubBudget collection
    {
      $lookup: {
        from: "subbudgets",
        let: { categoryId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  // Match by categoryId
                  { $eq: ["$categoryId", "$$categoryId"] },
                  // Match by context (userId or organizationId)
                  req.context.type === "solo"
                    ? { $eq: ["$userId", new mongoose.Types.ObjectId(req.user._id)] }
                    : { $eq: ["$organizationId", new mongoose.Types.ObjectId(req.context.organizationId)] },
                ],
              },
            },
          },
        ],
        as: "subBudget",
      },
    },

    // UNWIND - Flatten subBudget array
    {
      $unwind: {
        path: "$subBudget",
        // preserveNullAndEmptyArrays: true, // Keep categories without SubBudget
      },
    },

    //PROJECT - Shape output
    {
      $project: {
        _id: 1,
        name: 1,
        image: 1,
        isGeneral: 1,
        createdAt: 1,
        // Format SubBudget amounts as strings
        "subBudget._id": 1,
        "subBudget.allocatedAmount": {
          $cond: [
            "$subBudget.allocatedAmount",
            { $toString: "$subBudget.allocatedAmount" },
            "0",
          ],
        },
        "subBudget.spentAmount": {
          $cond: [
            "$subBudget.spentAmount",
            { $toString: "$subBudget.spentAmount" },
            "0",
          ],
        },
        "subBudget.remainingAmount": {
          $cond: [
            "$subBudget.remainingAmount",
            { $toString: "$subBudget.remainingAmount" },
            "0",
          ],
        },
      },
    },

    //SORT - Sort by newest first
    { $sort: { createdAt: -1 } },
  ];

  // EXECUTE AGGREGATION
  const categories = await Category.aggregate(pipeline);

  // VALIDATE RESULTS
  if (!categories || categories.length === 0) {
    throw new ApiError(404, "No categories found for your account");
  }

  // RETURN RESPONSE
  return res.status(200).json(
    new ApiResponse(
      200,
      { categories },
      "Categories fetched successfully"
    )
  );
});

//Delete Category
const deleteCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const userId = req.user._id;

  if (!categoryId) {
    throw new ApiError(400, "Category ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(400, "Invalid category ID format");
  }

  const ownerFilter = getOwnerFilter(req);

  const session = await mongoose.startSession();

  let categoryToDelete;
  let uncategorizedSubBudget;
  let expenseUpdate;

  try {
    session.startTransaction();

    // Find category
    categoryToDelete = await Category.findOne({
      _id: categoryId,
      ...ownerFilter,
    }).session(session);
    
    if (!categoryToDelete) {
      throw new ApiError(
        404,
        "Category not found or you don't have permission to delete it"
      );
    }

    if (categoryToDelete.isGeneral) {
      throw new ApiError(403, "General categories cannot be deleted");
    }

    // Find Uncategorized category
    const uncategorizedCategory = await Category.findOne({
      name: "uncategorised",
      isGeneral: true,
    }).session(session);
    
    if (!uncategorizedCategory) {
      throw new ApiError(
        404,
        "General 'uncategorized' category not found"
      );
    }

    // Get subbudgets
    const categorySubBudget = await SubBudget.findOne({
      categoryId,
      ...ownerFilter,
    }).session(session);

    uncategorizedSubBudget = await SubBudget.findOne({
      categoryId: uncategorizedCategory._id,
      ...ownerFilter,
    }).session(session);

    // Create Uncategorized SubBudget if needed
    if (!uncategorizedSubBudget) {
      const subBudgetData = {
        categoryId: uncategorizedCategory._id,
        allocatedAmount: mongoose.Types.Decimal128.fromString("0"),
        spentAmount: mongoose.Types.Decimal128.fromString("0"),
        remainingAmount: mongoose.Types.Decimal128.fromString("0"),
        currency: categorySubBudget?.currency || "PKR",
      };

      if (req.context.type === "solo") {
        subBudgetData.userId = userId;
      } else {
        subBudgetData.organizationId = req.context.organizationId;
      }

      const budgets = await SubBudget.create([subBudgetData], {
        session,
      });

      uncategorizedSubBudget = budgets[0];
    }

    // Move expenses
    expenseUpdate = await Expense.updateMany(
      {
        categoryId,
        ...ownerFilter,
      },
      {
        $set: {
          categoryId: uncategorizedCategory._id,
        },
      },
      { session }
    );

    // Merge budget values
    if (categorySubBudget) {
      const allocated = new Decimal(
        uncategorizedSubBudget.allocatedAmount.toString()
      ).plus(new Decimal(categorySubBudget.allocatedAmount.toString()));

      const spent = new Decimal(
        uncategorizedSubBudget.spentAmount.toString()
      ).plus(new Decimal(categorySubBudget.spentAmount.toString()));

      const remaining = new Decimal(
        uncategorizedSubBudget.remainingAmount.toString()
      ).plus(new Decimal(categorySubBudget.remainingAmount.toString()));

      uncategorizedSubBudget.allocatedAmount =
        mongoose.Types.Decimal128.fromString(allocated.toString());

      uncategorizedSubBudget.spentAmount =
        mongoose.Types.Decimal128.fromString(spent.toString());

      uncategorizedSubBudget.remainingAmount =
        mongoose.Types.Decimal128.fromString(remaining.toString());

      await uncategorizedSubBudget.save({ session });

      await categorySubBudget.deleteOne({ session });
    }

    // Delete category
    await Category.deleteOne(
      {
        _id: categoryId,
        ...ownerFilter,
      },
      { session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        deletedCategory: {
          _id: categoryToDelete._id,
          name: categoryToDelete.name,
        },
        expensesReassigned: expenseUpdate.modifiedCount,
        uncategorizedSubBudget: {
          allocatedAmount:
            uncategorizedSubBudget.allocatedAmount.toString(),
          spentAmount:
            uncategorizedSubBudget.spentAmount.toString(),
          remainingAmount:
            uncategorizedSubBudget.remainingAmount.toString(),
        },
      },
      "Category deleted successfully. Expenses and budget transferred to Uncategorized."
    )
  );
});
// const deleteCategory = asyncHandler(async (req, res) => {
//   const { categoryId } = req.params;
//   const userId = req.user._id;

//   // VALIDATE CATEGORY ID
//   if (!categoryId) {
//     throw new ApiError(400, "Category ID is required");
//   }

//   if (!mongoose.Types.ObjectId.isValid(categoryId)) {
//     throw new ApiError(400, "Invalid category ID format");
//   }

//   // OWNER FILTER
//   const ownerFilter = getOwnerFilter(req);

//   // FIND CATEGORY
//   const categoryToDelete = await Category.findOne({
//     _id: categoryId,
//     ...ownerFilter,
//   });

//   if (!categoryToDelete) {
//     throw new ApiError(
//       404,
//       "Category not found or you don't have permission to delete it"
//     );
//   }

//   // DO NOT ALLOW GENERAL CATEGORIES TO BE DELETED
//   if (categoryToDelete.isGeneral) {
//     throw new ApiError(403, "General categories cannot be deleted");
//   }

//   // FIND GENERAL UNCATEGORIZED CATEGORY
//   const uncategorizedCategory = await Category.findOne({
//     name: "uncategorized",
//     isGeneral: true,
//     ...ownerFilter,
//   });

//   if (!uncategorizedCategory) {
//     throw new ApiError(
//       404,
//       "General 'uncategorized' category not found"
//     );
//   }

//   // GET SUBBUDGETS
//   const categorySubBudget = await SubBudget.findOne({
//     categoryId,
//     ...ownerFilter,
//   });

//   let uncategorizedSubBudget = await SubBudget.findOne({
//     categoryId: uncategorizedCategory._id,
//     ...ownerFilter,
//   });

//   // CREATE UNCATEGORIZED SUBBUDGET IF NOT EXISTS
//   if (!uncategorizedSubBudget) {
//     const subBudgetData = {
//       categoryId: uncategorizedCategory._id,
//       allocatedAmount: 0,
//       spentAmount: 0,
//       remainingAmount: 0,
//       currency: categorySubBudget?.currency || "PKR",
//     };

//     if (req.context.type === "solo") {
//       subBudgetData.userId = userId;
//     } else {
//       subBudgetData.organizationId = req.context.organizationId;
//     }

//     uncategorizedSubBudget = await SubBudget.create(subBudgetData);
//   }

//   // MOVE EXPENSES TO UNCATEGORIZED
//   const expenseUpdate = await Expense.updateMany(
//     {
//       categoryId,
//       ...ownerFilter,
//     },
//     {
//       $set: {
//         categoryId: uncategorizedCategory._id,
//       },
//     }
//   );

//   // MERGE SUBBUDGET VALUES
//   if (categorySubBudget) {
//     uncategorizedSubBudget.allocatedAmount +=
//       Number(categorySubBudget.allocatedAmount) || 0;

//     uncategorizedSubBudget.spentAmount +=
//       Number(categorySubBudget.spentAmount) || 0;

//     uncategorizedSubBudget.remainingAmount +=
//       Number(categorySubBudget.remainingAmount) || 0;

//     await uncategorizedSubBudget.save();

//     await categorySubBudget.deleteOne();
//   }

//   // DELETE CATEGORY
//   const deleteResult = await Category.deleteOne({
//     _id: categoryId,
//     ...ownerFilter,
//   });

//   if (deleteResult.deletedCount === 0) {
//     throw new ApiError(500, "Failed to delete category");
//   }

//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {
//         deletedCategory: {
//           _id: categoryToDelete._id,
//           name: categoryToDelete.name,
//         },
//         expensesReassigned: expenseUpdate.modifiedCount,
//         uncategorizedSubBudget: {
//           allocatedAmount: uncategorizedSubBudget.allocatedAmount,
//           spentAmount: uncategorizedSubBudget.spentAmount,
//           remainingAmount: uncategorizedSubBudget.remainingAmount,
//         },
//       },
//       "Category deleted successfully. Expenses and budget transferred to Uncategorized."
//     )
//   );
// });


export {
  createCategory,
  getCategories,
  deleteCategory
}