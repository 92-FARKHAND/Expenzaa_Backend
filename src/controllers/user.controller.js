import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js";
import {ApiResponse} from "../utils/apiResponse.js";
import {User} from "../models/user.model.js"
import { Budget } from '../models/budget.model.js';
import {SubBudget} from '../models/subBudget.model.js'
import {Category} from '../models/category.model.js'
import {Membership} from '../models/membership.model.js'
import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import {uploadOnCloudinary} from "../utils/uploadAndCompression.js"
import mongoose from "mongoose";

const options ={
  httpOnly:true,
  secure:true,
  //sameSite:None this allow to send request from front end that is on another domain by efault its value is lax that stops cookies acceptance from other origins and for excellent level of security if both ends are on same domain than we use strict now i handle malicious requests to stop them using CORS
}
const generateRefreshAndAccessToken = async(user_id)=>{
  try {
    const user = await User.findById(user_id);
    const refreshToken = user.generateRefreshToken();
    const accessToken = user.generateAccessToken();
    user.refreshToken = refreshToken;
    await user.save({validateBeforeSave:false});

    return {refreshToken,accessToken}
  } catch (error) {
    throw new ApiError(500,"Something went wrong while generating tokens");
  }
};

// SIGN UP
const registerUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  const { username, role, fullName, email, password } = req.body;

  if (!errors.isEmpty()) {
    throw new ApiError(400, errors.array().map((err) => err.msg));
  }

  // Check if user already exists
  const existedUser = await User.findOne({
    $or: [
      { username: username.toLowerCase() },
      { email: email.toLowerCase() },
    ],
  });

  if (existedUser) {
    throw new ApiError(409, "User with username or email already exists");
  }

  // Upload avatar before transaction
  let avatar;
  if (req.file?.buffer) {
    const avatarUpload = await uploadOnCloudinary(req.file.buffer);
    avatar = avatarUpload?.url;
  }

  const session = await mongoose.startSession();

  let user;

  try {
    session.startTransaction();

    // Create User
    const users = await User.create(
      [
        {
          username: username.toLowerCase(),
          role,
          fullName,
          email: email.toLowerCase(),
          avatar,
          password,
        },
      ],
      { session }
    );

    user = users[0];

    // Create Budget
    const now = new Date();
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(now.getMonth() + 1);

    const budgets = await Budget.create(
      [
        {
          totalAmount: 0,
          spentAmount: 0,
          remainingAmount: 0,
          currency: "PKR",
          startDate: now,
          endDate: oneMonthLater,
          userId: user._id,
        },
      ],
      { session }
    );

    const budget = budgets[0];

    // Fetch General Categories
    const generalCategories = await Category.find({
      isGeneral: true,
    }).session(session);

    // Create Sub Budgets
    const subBudgets = generalCategories.map((category) => ({
      categoryId: category._id,
      userId: user._id,
      budgetId: budget._id,
      allocatedAmount: 0,
      spentAmount: 0,
      remainingAmount: 0,
      currency: budget.currency,
    }));

    if (subBudgets.length) {
      await SubBudget.insertMany(subBudgets, { session });
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(500, "Try again, something went wrong.");
  } finally {
    session.endSession();
  }

  // Generate Tokens (outside transaction)
  const { accessToken, refreshToken } =
    await generateRefreshAndAccessToken(user._id);

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const responseData = {
    ...createdUser.toObject(),
    accessToken,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        responseData,
        "User registered successfully with default budget"
      )
    );
});
// const registerUser = asyncHandler(async (req, res) => {
//   const errors = validationResult(req);
//   const { username, role, fullName, email, password } = req.body;

//   if (!errors.isEmpty()) {
//     throw new ApiError(400, errors.array().map((err) => err.msg));
//   }

//   // Check for existing user
//   const existedUser = await User.findOne({
//     $or: [
//       { username: username.toLowerCase() },
//       { email: email.toLowerCase() }
//     ]
//   });

//   if (existedUser) {
//     throw new ApiError(409, "User with username or email already exists");
//   }

//   // Optional avatar upload
//   let avatar;
//   if (req.file?.buffer) {
//     const avatarUpload = await uploadOnCloudinary(req.file.buffer);
//     avatar = avatarUpload?.url;
//   }

//   // Create the user
//   const user = await User.create({
//     username: username.toLowerCase(),
//     role,
//     fullName,
//     email,
//     avatar,
//     password
//   });

//   //  Create default budget for the new user
//   try {
//     const now = new Date();
//     const oneMonthLater = new Date(now);
//     oneMonthLater.setMonth(now.getMonth() + 1);

//     const budget = await Budget.create({
//       totalAmount: 0,
//       spentAmount: 0,
//       remainingAmount: 0,
//       currency: "PKR",     
//       startDate: now,      
//       endDate: oneMonthLater,
//       userId: user._id
//     });

// //  Create SubBudgets for general categories (user-specific)
// const generalCategories = await Category.find({ isGeneral: true });
// const subBudgets = generalCategories.map(cat => ({
//   categoryId: cat._id,
//   userId: user._id,
//   budgetId: budget._id,
//   allocatedAmount: 0,
//   spentAmount: 0,
//   remainingAmount: 0,
//   currency: budget.currency
// }));

// await SubBudget.insertMany(subBudgets);

//   } catch (err) {
//     console.error(" Budget creation failed:", err);
//     await User.findByIdAndDelete(user?._id);
//     await Budget.deleteOne({ userId: user._id });
//     await SubBudget.deleteMany({userId:user?._id});
//     throw new ApiError(500, "Try again , Something went wrong");
//   }

//   // Generate tokens
//   const { accessToken, refreshToken } = await generateRefreshAndAccessToken(user._id);
//   const createdUser = await User.findById(user._id).select("-password -refreshToken");

//   const responseData = {
//     ...createdUser.toObject(),
//     accessToken
//   };

//   // Send response with cookies
//   return res
//     .status(200)
//     .cookie("accessToken", accessToken, options)
//     .cookie("refreshToken", refreshToken, options)
//     .json(new ApiResponse(200, responseData, "User registered successfully with default budget"));
// });

// SIGN IN
const logIn = asyncHandler(async (req,res) => {
   const {username , password} = req.body;
   if(!username || !password){
    throw new ApiError(400,"User credentials are required");
   }
   const user = await User.findOne({username});
   if (!user) {
    throw new ApiError(404,"User not exists")
   }
   const isPasswordValid = await user.isPasswordCorrect(password);
   if (!isPasswordValid) {
    throw new ApiError(409,"Invalid User Credentials");
   }
   
   const {accessToken,refreshToken} = await generateRefreshAndAccessToken(user._id);
   const loggedIn = await User.findById(user._id).select("-password -refreshToken")

   return res
   .status(200)
   .cookie("accessToken",accessToken,options)
   .cookie("refreshToken",refreshToken,options)
   .json(
    new ApiResponse(
      200,
      {
       user: loggedIn ,
       context : loggedIn.currentContext
      },
      "User logged in successfully"
    )
   )
});

// SIGN OUT
const logOut = asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(req.user._id,
  {
    $unset:{
      refreshToken:1
    }
  },
  {
    new:true
  }
)
return res
.status(200)
.clearCookie("refreshToken",options)
.clearCookie("accessToken",options)
.json(
  new ApiResponse(
    201,
   {},
   "User logged out successfully"
  )
)
});

// FETCH PROFILE
const getUserProfile = asyncHandler(async (req,res) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(400,"User details are not found")
  }
  return res
  .status(200)
  .json(
    new ApiResponse(
      200,
      user,
     "User get successfully"
    )
  )
});

// CHANGE PASSWORD
const changePassword = asyncHandler(async (req,res) => {
  const {oldPassword, newPassword} = req.body;
  const user = await User.findById(req.user?._id)
  
  const isPasswordValid= await user.isPasswordCorrect(oldPassword);
  if (!isPasswordValid) {
    throw new ApiError(401,"Old Password is incorrect");
  }
  user.password = newPassword;
  await user.save({validateBeforeSave:false});
  return res 
  .status(200)
  .json(new ApiResponse(200 , {},"Password Changed Successfully"))
});

// UPDATE PROFILE DETAILS
const updateUserProfile = asyncHandler(async (req,res) => {
  const {username ,fullName,email} = req.body;
  if(!username && !email && !fullName){
    throw new ApiError(400,"At least one field is required")
  }
    const uniqueCheckConditions = [];
  if (email) {
    uniqueCheckConditions.push({ email });
  }
  if (username) {
    uniqueCheckConditions.push({ username });
  }

  if (uniqueCheckConditions.length > 0) {
    const existing = await User.findOne({
      _id: { $ne: req.user._id }, // exclude current user
      $or: uniqueCheckConditions,
    });

    if (existing) {
      const conflictField =
        existing.email === email ? "Email" : "Username";
      throw new ApiError(409, `${conflictField} already in use`);
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    {
      //this check if user provide user name than in update username changes if not than in set field{ nothing , john67@gmail.com , john doe}
      $set:{
        ...(username && {username}),
        ...(email && {email}),
        ...(fullName && {fullName})
      }
    },
    {new:true}
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new ApiError(400,"Something went wrong while updating")
  }
  
  return res
  .status(200)
  .json(
    new ApiResponse(
      200,
      updatedUser,
      "User updated successfully"
    )
  )
});

// UPDATE PROFILE IMAGE
const updateAvatar = asyncHandler(async(req,res)=>{
   const avatarBuffer = req.file?.buffer;
   if (!avatarBuffer) {
     throw new ApiError(404,"File not found");
   }
   const avatarUpload = await uploadOnCloudinary(avatarBuffer);
   const avatar = avatarUpload?.url;
   const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar
      }
    },
    {new : true}
   ).select("-password -refreshToken");
   if (!updatedUser) {
    throw  new ApiError(400 , "Something went wrong while upadting avatar")
   }
   return res
   .status(200)
   .json(
    new ApiResponse(
      200,
      {updatedUser},
      "Avatar updated successfully"
    )
   )
});

// DELETE USER
const deleteUser = asyncHandler(async (req,res) => {
  const userId = new mongoose.Types.ObjectId(req.user._id);
  const user = await User.findById(userId);
  const budget = await Budget.findOne({userId})
  const subBudget = await SubBudget.find({userId});
  const categories = await Category.find({userId})

  if (!user) {
    throw new ApiError(404,"User not found");
  }
  await budget.deleteOne();
  await user.deleteOne();
  await subBudget.deleteMany();
  await Category.deleteMany();

  return res
  .status(200)
  .json(
    new ApiResponse(200,{},"User Deleted Successfully")
  ) 
});

// SWITCH MODE [SOLO, ORGANIZATION]
const switchContext = asyncHandler(async(req,res)=>{
 const { organizationId } = req.body;

  // Solo mode
  if (!organizationId) {
    await User.findByIdAndUpdate(req.user._id, {
      currentContext: { type: "solo", organizationId: null },
    });

    return res.status(200).json(
      new ApiResponse(200, { context: "solo" }, "Switched to solo mode")
    );
  }

  // Org mode
  const membership = await Membership.findOne({
    userId: req.user._id,
    organizationId,
    status: "active",
  });

  if (!membership) {
    throw new ApiError(403, "You are not a member of this organization");
  }

  await User.findByIdAndUpdate(req.user._id, {
    currentContext: { type: "organization", organizationId: organizationId },
  });

  return res.status(200).json(
    new ApiResponse(200, {
      context: "organization",
      organizationId: organizationId,
      role: membership.role,
    }, "Switched to organization")
  );
});

// SERACH USER & ORG
const globalSearch = asyncHandler(async (req, res) => {
  const { q, type } = req.query;

  if (!q || q.trim().length < 2) {
    throw new ApiError(400, "Search query too short");
  }

  if (!["user", "org"].includes(type)) {
    throw new ApiError(400, "Invalid search type");
  }

  let results;

  if (type === "user") {
    results = await User.find({
      $or: [
        { username: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } }
      ]
    }).select("_id username email");
  }

  if (type === "org") {
    results = await Organization.find({
      name: { $regex: q, $options: "i" }
    }).select("_id name memberCount");
  }

  return res.status(200).json(
    new ApiResponse(200, results, "Search results")
  );
});


// REFRESH ACCESS TOKEN
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request: Refresh token is missing");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateRefreshAndAccessToken(user._id);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json({
        statusCode: 200,
        success: true,
        message: "Access token refreshed successfully",
        accessToken,
        user: loggedInUser,
        data: {
          accessToken,
          user: loggedInUser,
          context: loggedInUser.currentContext
        }
      });
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});


export{
  registerUser,
  logIn,
  logOut,
  getUserProfile,
  changePassword,
  updateUserProfile,
  updateAvatar,
  deleteUser,
  switchContext,
  globalSearch,
  refreshAccessToken
}