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

// Create category (user or general)
 const createCategory = asyncHandler(async (req, res) => {
  const 
  { 
   name,
   orgId,
   userId,
   isGeneral = false
  } = req.body;

  if (!name || !userId) {
    throw new ApiError(400, "Name and userId are required.");
  }

  const categoryName = name.toLowerCase().trim();
  const alreadyExists = await Category.exists({ name: categoryName, userId });

  if (alreadyExists) {
    throw new ApiError(409, "Category already exists.");
  }

  let image;
  if( req.file?.buffer){
   const uploadedImg = await uploadOnCloudinary(req.file?.buffer)
   image = uploadedImg?.url;
  }

  const category = await Category.create({
    name: categoryName,
    image,
    userId,
    orgId: orgId || null,
    isGeneral
  });

  const budget = await Budget.findOne({
    $or: [{ userId }, { orgId }]
  });

  if (!budget) {
    throw new ApiError(404, "Budget not found for user or organization");
  }

  let subBudget;
  try {
      subBudget =  await SubBudget.create({
      categoryId:category._id,
      budgetId:budget._id,
      userId
    })
  } catch (error) {
    console.log("SubBudget not created properly",error);
    await Category.findByIdAndDelete(category?._id)
    throw new ApiError(500,"Something went wrong Please try again")
  }
  return res.status(201).json(
    new ApiResponse(201, {category,subBudget:subBudget.toObject()}, "Category created successfully")
  );
});

// Get categories: General + User-specific
const getUserCategories = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);

  // ✅ Fetch categories owned by this user only
  const categories = await Category.aggregate([
    {
      $match: { 
        $or:[
          {userId: userId},
          { userId: null, isGeneral: true }        ]
       },
    },
    {
  $lookup: {
    from: "subbudgets",
    let: { categoryId: "$_id", userId: userId },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ["$categoryId", "$$categoryId"] },
              { $eq: ["$userId", "$$userId"] }
            ]
          }
        }
      }
    ],
    as: "subBudget"
  }
}
,
    {
      $unwind: {
        path: "$subBudget",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        name: 1,
        image: 1,
        isGeneral: 1,
        createdAt: 1,
        "subBudget._id":1,
        "subBudget.allocatedAmount": { $toString: "$subBudget.allocatedAmount" },
        "subBudget.spentAmount": { $toString: "$subBudget.spentAmount" },
        "subBudget.remainingAmount": { $toString: "$subBudget.remainingAmount" },
        "subBudget.currency": 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  if (!categories.length) {
    throw new ApiError(404, "No categories found for this user");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, categories, "User categories fetched successfully"));
});


const deleteCategory = asyncHandler(async (req, res) => {
  const loggedInUser = new mongoose.Types.ObjectId(req.user?._id);
  const { categoryId } = req.params;

  if (!loggedInUser) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new ApiError(400, "Invalid category ID");
  }
  const uncategorised = await Category.findOne({
    name: { $regex: /^uncategorised$/i }
  });

  const expenseUpdate = await Expense.updateMany(
    {categoryId:categoryId},
    {
      $set:{
        categoryId:uncategorised._id
      }
    }
  );
  // Single step delete with ownership check
  const result = await Category.deleteOne({
    _id: categoryId,
    userId: loggedInUser,
  });

  if (result.deletedCount === 0) {
    throw new ApiError(404, "Category not found or you do not have permission to delete it");
  }

  res.status(200).json(
    new ApiResponse(200,
    {expenseUpdate},
    "Category deleted successfully")
  );
});


export {
  createCategory,
  getUserCategories,
  deleteCategory
}

