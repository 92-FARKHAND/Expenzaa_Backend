
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { Organization } from "../models/organization.model.js";
import { Budget } from "../models/budget.model.js";
import { SubBudget } from "../models/subBudget.model.js";
import { Membership } from "../models/membership.model.js";
import { Category } from "../models/category.model.js";
import { User } from "../models/user.model.js";
import { Expense } from "../models/expense.model.js"
import mongoose from "mongoose";

// CREATE ORG
const createOrganization = asyncHandler(async (req, res) => {
  const { name, description, location, website } = req.body;
  const userId = req.user._id;

  // Validation
  if (!name || name.trim() === "") {
    throw new ApiError(400, "Organization name is required");
  }

  if (name.trim().length < 3) {
    throw new ApiError(
      400,
      "Organization name must be at least 3 characters"
    );
  }

  if (name.trim().length > 100) {
    throw new ApiError(
      400,
      "Organization name must be less than 100 characters"
    );
  }

  // Duplicate check
  const existingOrg = await Organization.findOne({
    name: name.trim(),
    createdBy: userId,
  });

  if (existingOrg) {
    throw new ApiError(
      400,
      "You already have an organization with this name"
    );
  }

  const session = await mongoose.startSession();

  let newOrganization;

  try {
    session.startTransaction();

    // Create Organization
    const organizations = await Organization.create(
      [
        {
          name: name.trim(),
          description: description?.trim() || "",
          location,
          website,
          createdBy: userId,
          memberCount: 1,
        },
      ],
      { session }
    );

    newOrganization = organizations[0];

    // Create Membership
    await Membership.create(
      [
        {
          userId,
          organizationId: newOrganization._id,
          role: "admin",
          status: "active",
          invitedBy: userId,
        },
      ],
      { session }
    );

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
          organizationId: newOrganization._id,
        },
      ],
      { session }
    );

    const budget = budgets[0];

    // Fetch General Categories
    const generalCategories = await Category.find({
      isGeneral: true,
    }).session(session);

    // Create SubBudgets
    const subBudgets = generalCategories.map((category) => ({
      categoryId: category._id,
      organizationId: newOrganization._id,
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

  // Response
  const responseData = {
    _id: newOrganization._id,
    name: newOrganization.name,
    description: newOrganization.description,
    createdBy: newOrganization.createdBy,
    memberCount: newOrganization.memberCount.toString(),
    userRole: "admin",
    createdAt: newOrganization.createdAt,
  };

  return res.status(201).json(
    new ApiResponse(
      201,
      responseData,
      "Organization created successfully"
    )
  );
});

// const createOrganization = asyncHandler(async (req, res) => {
//   const { name, description,location,website} = req.body;
//   const userId = req.user._id;

//   // VALIDATION
//   if (!name || name.trim() === "") {
//     throw new ApiError(400, "Organization name is required");
//   }
//   if (name.length < 3) {
//     throw new ApiError(400, "Organization name must be at least 3 characters");
//   }
//   if (name.length > 100) {
//     throw new ApiError(400, "Organization name must be less than 100 characters");
//   }
//   // DUPLICATION CHECK
//   const existingOrg = await Organization.findOne({
//     name: name.trim(),
//     createdBy: userId
//   });

//   if (existingOrg) {
//     throw new ApiError(
//       400,
//       "You already have an organization with this name"
//     );
//   }

//   //CREATE ORGANIZATION
//   const newOrganization = await Organization.create({
//     name: name.trim(),
//     description: description ? description.trim() : "",
//     location,
//     website,
//     createdBy: userId,
//     memberCount: 1, // Start with creator as member
//   });
//   if (!newOrganization) {
//     throw new ApiError(500, "Failed to create organization");
//   }


//   //CREATING DEFAULT BUDGET AND SUBBUDGETS FOR ORGANIZATION 
//   try {
//     // AUTO ADD CREATOR AS ADMIN (MEMBERSHIP)
//     await Membership.create({
//       userId: userId,
//       organizationId: newOrganization._id,
//       role: "admin", // Creator is admin
//       status: "active",
//       invitedBy: userId, // Self-invited
//     });
//     //BUDGET CREATION
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
//       organizationId: newOrganization._id
//     });

//     //  Create SubBudgets for general categories (user-specific)
//     const generalCategories = await Category.find({ isGeneral: true });
//     const subBudgets = generalCategories.map(cat => ({
//       categoryId: cat._id,
//       organizationId: newOrganization._id,
//       budgetId: budget._id,
//       allocatedAmount: 0,
//       spentAmount: 0,
//       remainingAmount: 0,
//       currency: budget.currency
//     }));
//     await SubBudget.insertMany(subBudgets);

//   } catch (err) {
//     console.error(" Budget creation failed:", err);
//     await Budget.deleteOne({ organizationId: newOrganization?._id });
//     await SubBudget.deleteMany({ organizationId: newOrganization?._id });
//     await Membership.deleteMany({ organizationId: newOrganization?._id });
//     await Organization.findByIdAndDelete(newOrganization?._id);
//     throw new ApiError(500, "Try again , Something went wrong");
//   }

//   //RESPONSE
//   const responseData = {
//     _id: newOrganization._id,
//     name: newOrganization.name,
//     description: newOrganization.description,
//     createdBy: newOrganization.createdBy,
//     memberCount: newOrganization.memberCount.toString(),
//     userRole: "admin",
//     createdAt: newOrganization.createdAt,
//   };

//   return res
//     .status(201)
//     .json(
//       new ApiResponse(201, responseData, "Organization created successffully")
//     )
// });

// GET ORG
const getOrganizationDetails = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const userId = req.user._id;

  // VALIDATE ORG
  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  //VERIFY USER MEMBERSHIP
  const membership = await Membership.findOne({
    userId: userId,
    organizationId: organizationId,
    status: { $in: ["active", "invited"] },
  });

  if (!membership) {
    throw new ApiError(403, "You don't have access to this organization");
  }

  // FETCH ORG
  const organization = await Organization.findById(organizationId)
    .populate("createdBy", "username email fullName avatar");

  if (!organization) {
    throw new ApiError(404, "Organization not found");
  }

  // FETCH MEMBERS
  const members = await Membership.find({
    organizationId: organizationId,
    status: { $in: ["active", "invited"] },
  })
    .populate("userId", "username email fullName avatar planType")
    .sort({ createdAt: 1 }); //oldest first

  // FORMAT MEMBERS
  const formattedMembers = members.map((member) => ({
    _id: member._id,
    userId: member.userId._id,
    username: member.userId.username,
    email: member.userId.email,
    fullName: member.userId.fullName,
    avatar: member.userId.avatar,
    role: member.role,
    status: member.status,
    joinedAt: member.createdAt,
  }));

  //RESPONSE
  const responseData = {
    _id: organization._id,
    name: organization.name,
    description: organization.description,
    location: organization.location,
    website:organization.website,
    createdBy: {
      _id: organization.createdBy._id,
      username: organization.createdBy.username,
      email: organization.createdBy.email,
      fullName: organization.createdBy.fullName,
      avatar: organization.createdBy.avatar,
    },
    memberCount: organization.memberCount.toString(),
    members: formattedMembers,
    userRole: membership.role, // Current user's role
    userStatus: membership.status, // Current user's status
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, responseData, "Organization details fetched suuccessfully")
    )

});

// GET ALL ORGs OF USER
const getUserOrganizations = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // FETCH USER MEMBERSHIP (only active or invited)
  const memberships = await Membership.find({
    userId: userId,
    status: { $in: ["active", "invited"] },
  })
    .populate("organizationId", "name description memberCount createdAt")
    .sort({ createdAt: -1 }); // Newest first

  // FORMAT RESPONSE (filter out any null or deleted orgs)
  const organizations = memberships
    .filter((membership) => membership.organizationId)
    .map((membership) => ({
      _id: membership.organizationId._id,
      name: membership.organizationId.name,
      description: membership.organizationId.description,
      memberCount: membership.organizationId.memberCount.toString(),
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt,
    }));

  return res
    .status(200)
    .json(
      new ApiResponse(200, organizations, "User organizations fetched successfully")
    )
});

// UPDATE ORG
const updatedOrganization = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const { name, description, location, website } = req.body;
  const userId = req.user._id;

  // Validate organization ID
  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  // Check membership
  const membership = await Membership.findOne({
    userId,
    organizationId,
    status: "active",
  });

  if (!membership) {
    throw new ApiError(403, "You don't have access to this organization");
  }

  if (membership.role !== "admin") {
    throw new ApiError(403, "Only admins can update organization");
  }

  // Check organization exists
  const organization = await Organization.findById(organizationId);

  if (!organization) {
    throw new ApiError(404, "Organization not found");
  }

  const updateFields = {};

  // Name validation
  if (name !== undefined) {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new ApiError(400, "Organization name cannot be empty");
    }

    if (trimmedName.length < 3 || trimmedName.length > 100) {
      throw new ApiError(
        400,
        "Organization name must be between 3 and 100 characters"
      );
    }

    const duplicate = await Organization.findOne({
      _id: { $ne: organizationId },
      name: trimmedName,
      createdBy: userId,
    });

    if (duplicate) {
      throw new ApiError(
        400,
        "You already have an organization with this name"
      );
    }

    updateFields.name = trimmedName;
  }

  // Description
  if (description !== undefined) {
    updateFields.description = description?.trim() || "";
  }

  // Location
  if (location !== undefined) {
    updateFields.location = location?.trim() || "";
  }

  // Website
  if (website !== undefined) {
    const trimmedWebsite = website?.trim() || "";

    if (
      trimmedWebsite &&
      !/^https?:\/\/([\w-]+\.)+[\w-]{2,}(\/.*)?$/i.test(trimmedWebsite)
    ) {
      throw new ApiError(400, "Please provide a valid website URL");
    }

    updateFields.website = trimmedWebsite;
  }

  // Nothing to update
  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No fields to update");
  }

  // Update organization
  const updatedOrganization = await Organization.findByIdAndUpdate(
    organizationId,
    { $set: updateFields },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedOrganization) {
    throw new ApiError(500, "Failed to update organization");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: updatedOrganization._id,
        name: updatedOrganization.name,
        description: updatedOrganization.description,
        location: updatedOrganization.location,
        website: updatedOrganization.website,
        memberCount: updatedOrganization.memberCount.toString(),
        createdAt: updatedOrganization.createdAt,
        updatedAt: updatedOrganization.updatedAt,
      },
      "Organization updated successfully"
    )
  );
});

// DELETE ORG
const deleteOrganization = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const userId = req.user._id;

  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Fetch organization
    const organization = await Organization.findById(organizationId).session(
      session
    );

    if (!organization) {
      throw new ApiError(404, "Organization not found");
    }

    // Only creator can delete
    if (organization.createdBy.toString() !== userId.toString()) {
      throw new ApiError(403, "Only organization creator can delete it");
    }

    // Delete all related data
    await Membership.deleteMany(
      { organizationId },
      { session }
    );

    await Expense.deleteMany(
      { organizationId },
      { session }
    );

    await Budget.deleteMany(
      { organizationId },
      { session }
    );

    await SubBudget.deleteMany(
      { organizationId },
      { session }
    );

    // Delete organization
    await Organization.deleteOne(
      { _id: organizationId },
      { session }
    );

    // Update current context if needed
    const user = await User.findById(userId).session(session);

    if (
      user?.currentContext?.organizationId?.toString() ===
      organizationId
    ) {
      user.currentContext = {
        type: "solo",
        organizationId: null,
      };

      await user.save({ session });
    }

    await session.commitTransaction();

    return res.status(200).json(
      new ApiResponse(200, {}, "Organization deleted successfully")
    );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});
// const deleteOrganization = asyncHandler(async (req, res) => {
//   const { organizationId } = req.params;
//   const userId = req.user._id;

//   // VALIDATE ORG ID
//   if (!organizationId) {
//     throw new ApiError(400, "Organization ID is required");
//   }

//   // FETCH ORGANIZATION
//   const organization = await Organization.findById(organizationId);

//   if (!organization) {
//     throw new ApiError(404, "Organization not found");
//   }

//   // CHECK IF USER IS CREATOR
//   // Only original creator can delete organization
//   if (organization.createdBy.toString() !== userId.toString()) {
//     throw new ApiError(403, "Only organization creator can delete it");
//   }

//   // DELETE ALL MEMBERSHIPS , EXPENSES , BUDGET & SUBBUDGETS REALTED TO ORG
//   await Membership.deleteMany({ organizationId: organizationId });
//   await Expense.deleteMany({ organizationId: organizationId });
//   await Budget.deleteMany({ organizationId: organizationId });
//   await SubBudget.deleteMany({ organizationId: organizationId });

//   // DELETE ORGANIZATION
//   await Organization.findByIdAndDelete(organizationId);

//   // UPDATE USER CONTEXT 
//   // If user was viewing this org, switch them to solo mode
//   const user = await User.findById(userId);

//   if (user.currentContext.organizationId?.toString() === organizationId) {
//     await User.findByIdAndUpdate(userId, {
//       currentContext: {
//         type: "solo",
//         organizationId: null,
//       },
//     });
//   }

//   // RETURN RESPONSE 
//   return res
//     .status(200)
//     .json(
//       new ApiResponse(200, {}, "Organization deleted successfully")
//     );
// });

// INVITE MEMBER

const inviteMember = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  
  const { inviteeEmail, role } = req.body;
  const userId = req.user._id;

  if (!inviteeEmail) {
    throw new ApiError(400, "Invitee email is required");
  }

  if (!role || !["admin", "manager", "member"].includes(role)) {
    throw new ApiError(400, "Invalid role");
  }

  // Find invitee user by email
  const invitee = await User.findOne({ email: inviteeEmail.toLowerCase().trim() });
  if (!invitee) {
    throw new ApiError(404, "User with this email not found");
  }
  const membershipCheck = await Membership.findOne({
    email:inviteeEmail.toLowerCase().trim(),
    organizationId  
  });
  if (membershipCheck) {
    throw new ApiError(400, "Already Member");
  }
  // Prevent inviting self
  if (invitee._id.toString() === userId.toString()) {
    throw new ApiError(400, "You cannot invite yourself");
  }

  // CHECK ADMIN
  const adminMembership = await Membership.findOne({
    userId,
    organizationId,
    status: "active",
  });

  if (!adminMembership || adminMembership.role !== "admin") {
    throw new ApiError(403, "Only admins can invite members");
  }

  // CHECK EXISTING MEMBERSHIP
  const existingMembership = await Membership.findOne({
    userId: invitee._id,
    organizationId,
  });

  if (existingMembership) {
    throw new ApiError(409, "User already invited or member");
  }

  // CREATE INVITE
  const invitation = await Membership.create({
    userId: invitee._id,
    organizationId,
    role,
    status: "invited",
    invitedBy: userId,
  });

  return res.status(201).json(
    new ApiResponse(201, invitation, "Invitation sent successfully")
  );
});

// INVITATION ACCEPTION
const acceptInvitation = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const userId = req.user._id;

  // ============ STEP 1: VALIDATE ORG ID ============
  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  // FIND PENDING INVITATION
  const invitation = await Membership.findOne({
    userId: userId,
    organizationId: organizationId,
    status: "invited",
  });

  if (!invitation) {
    throw new ApiError(
      404,
      "No pending invitation found for this organization"
    );
  }

  // ACCEPT INVITATION
  invitation.status = "active";
  await invitation.save();

  // INCREASE ORGANIZATION MEMBER COUNT
  await Organization.findByIdAndUpdate(
    organizationId,
    { $inc: { memberCount: 1 } },
    { new: true }
  );

  // RETURN RESPONSE
  const responseData = {
    _id: invitation._id,
    organizationId: invitation.organizationId,
    role: invitation.role,
    status: "active",
    joinedAt: new Date(),
  };

  return res.status(200).json(
    new ApiResponse(200, responseData, "Invitation accepted successfully")
  );
})

// INVITATION REJECTION
const rejectInvitation = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const userId = req.user._id;

  // VALIDATE ORG ID
  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  // FIND PENDING INVITATION
  const invitation = await Membership.findOne({
    userId: userId,
    organizationId: organizationId,
    status: "invited",
  });

  if (!invitation) {
    throw new ApiError(
      404,
      "No pending invitation found for this organization"
    );
  }

  // DELETE INVITATION
  await Membership.findByIdAndDelete(invitation._id);

  // RETURN RESPONSE
  return res.status(200).json(
    new ApiResponse(200, {}, "Invitation rejected successfully")
  );
});

// REMOVE MEMBER
const removeMember = asyncHandler(async (req, res) => {
  const { organizationId, memberId } = req.params;
  const userId = req.user._id;

  // VALIDATE IDS
  if (!organizationId || !memberId) {
    throw new ApiError(400, "Organization ID and Member ID are required");
  }

  // CHECK ADMIN PERMISSION
  const adminMembership = await Membership.findOne({
    userId: userId,
    organizationId: organizationId,
    status: "active",
  });

  if (!adminMembership) {
    throw new ApiError(403, "You don't have access to this organization");
  }

  // Allow admin to remove others, or anyone to remove themselves
  if (
    adminMembership.role !== "admin" &&
    userId.toString() !== memberId.toString()
  ) {
    throw new ApiError(403, "Only admins can remove members");
  }

  // FETCH MEMBER TO REMOVE
  const memberToRemove = await Membership.findOne({
    _id: memberId,
    organizationId: organizationId,
    status: "active",
  });

  if (!memberToRemove) {
    throw new ApiError(404, "Member not found in this organization");
  }

  // CHECK IF TRYING TO REMOVE CREATOR
  const organization = await Organization.findById(organizationId);

  if (organization.createdBy.toString() === memberId.toString()) {
    throw new ApiError(403, "Cannot remove organization creator");
  }

  // DELETE MEMBERSHIP
  await Membership.findByIdAndDelete(memberToRemove._id);

  // DECREASE ORGANIZATION MEMBER COUNT 
  await Organization.findByIdAndUpdate(
    organizationId,
    { $inc: { memberCount: -1 } },
    { new: true }
  );

  // UPDATE USER CONTEXT 
  // If removed user is viewing this org, switch them to solo
  const removedUser = await User.findById(memberId);

  if (removedUser.currentContext.organizationId?.toString() === organizationId) {
    await User.findByIdAndUpdate(memberId, {
      currentContext: {
        type: "solo",
        organizationId: null,
      },
    });
  }

  // RETURN RESPONSE
  return res.status(200).json(
    new ApiResponse(200, {}, "Member removed successfully")
  );
});

// UPDATE MEMBER ROLE
const updateMemberRole = asyncHandler(async (req, res) => {
  const { organizationId, memberId } = req.params;
  const { role } = req.body;
  const userId = req.user._id;
   
  // VALIDATE INPUT
  if (!organizationId || !memberId) {
    throw new ApiError(400, "Organization ID and Member ID are required");
  }

  if (!role || !["admin", "manager", "member"].includes(role)) {
    throw new ApiError(
      400,
      "Valid role required: admin, manager, or member"
    );
  }


  // FETCH MEMBER TO UPDATE
  const memberToUpdate = await Membership.findOne({
    _id: memberId,
    organizationId: organizationId,
    status: "active",
  });

  if (!memberToUpdate) {
    throw new ApiError(404, "Member not found in this organization");
  }

  // CHECK IF TRYING TO CHANGE CREATOR'S ROLE
  const organization = await Organization.findById(organizationId);

  if (organization.createdBy.toString() === memberId.toString()) {
    throw new ApiError(403, "Cannot change creator's role");
  }

  // UPDATE ROLE
  memberToUpdate.role = role;
  await memberToUpdate.save();

  // RETURN RESPONSE
  const responseData = {
    _id: memberToUpdate._id,
    role: memberToUpdate.role,
    status: memberToUpdate.status,
  };

  return res.status(200).json(
    new ApiResponse(200, responseData, "Member role updated successfully")
  );
});

//FETCH ORGANIZATION MEMEBERS
const getOrganizationMembers = asyncHandler(async (req, res) => {
  const { organizationId } = req.params;
  const userId = req.user._id;

  // VALIDATE ORG ID
  if (!organizationId) {
    throw new ApiError(400, "Organization ID is required");
  }

  // CHECK IF USER IS MEMBER
  const membership = await Membership.findOne({
    userId: userId,
    organizationId: organizationId,
    status: "active",
  });

  if (!membership) {
    throw new ApiError(403, "You don't have access to this organization");
  }

  // FETCH ALL MEMBERS
  const members = await Membership.find({
    organizationId: organizationId,
    status: "active",
  })
    .populate("userId", "username email fullName avatar planType")
    .sort({ createdAt: 1 });

  // FORMAT RESPONSE
  const formattedMembers = members.map((member) => ({
    _id: member._id,
    userId: member.userId._id,
    username: member.userId.username,
    email: member.userId.email,
    fullName: member.userId.fullName,
    avatar: member.userId.avatar,
    planType: member.userId.planType,
    role: member.role,
    status: member.status,
    joinedAt: member.createdAt,
  }));

  // RETURN RESPONSE
  return res.status(200).json(
    new ApiResponse(
      200,
      { members: formattedMembers },
      "Organization members fetched successfully"
    )
  );
});


export {
  createOrganization,
  getOrganizationDetails,
  getUserOrganizations,
  updatedOrganization,
  deleteOrganization,
  inviteMember,
  acceptInvitation,
  rejectInvitation,
  removeMember,
  updateMemberRole,
  getOrganizationMembers
}