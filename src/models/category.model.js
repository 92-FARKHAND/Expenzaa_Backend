
import mongoose, { Schema } from "mongoose";

const categorySchema = new Schema(
  {
    // ============ CATEGORY DETAILS ============
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 50,
    },
    image: {
      type: String,
      default:
        "https://res.cloudinary.com/doth3mn81/image/upload/v1759765573/defaultCategory_oxgaok.avif",
      trim: true,
    },
    isGeneral: {
      type: Boolean,
      default: false,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null
    },
  },
  { timestamps: true }
);

// ============ INDEXES FOR PERFORMANCE ============

/**
 * User cannot create two categories with same name (solo mode)
 * Only applies to non-general categories (isGeneral: false)
 */
categorySchema.index(
  { name: 1, userId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      isGeneral: false,
      userId: { $ne: null }, // Only enforce when userId exists
    },
  }
);

/*
 * Organization cannot create two categories with same name (org mode)
 * Only applies to non-general categories
 */
categorySchema.index(
  { name: 1, organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isGeneral: false,
      orgId: { $ne: null }, // Only enforce when orgId exists
    },
  }
);

// Find categories by user (solo mode)
categorySchema.index({ userId: 1 });

// Find categories by organization (org mode)
categorySchema.index({ organizationId: 1 });

// Find general categories
categorySchema.index({ isGeneral: 1 });

// Sort by creation date
categorySchema.index({ createdAt: -1 });

// Combined indexes for common queries
categorySchema.index({ userId: 1, createdAt: -1 });
categorySchema.index({ organizationId: 1, createdAt: -1 });

// ============ PRE-SAVE VALIDATION ============

/**
 * HOOK: Validate context before saving
 * 
 * Rules:
 * 1. General categories: Both userId and orgId should be null
 * 2. User categories: Only userId populated, orgId null
 * 3. Org categories: Only orgId populated, userId null
 * 4. Cannot have both userId and orgId populated
 */
categorySchema.pre("save", function (next) {
  try {
    // Rule: If isGeneral is true, both userId and orgId must be null
    if (this.isGeneral) {
      if (this.userId || this.organizationId) {
        throw new Error(
          "General categories cannot be assigned to specific users or organizations"
        );
      }
    }

if (this.userId && this.organizationId) {
  throw new Error("Category cannot belong to both user and organization");
}
    // Ensure name is lowercase
    if (this.name) {
      this.name = this.name.toLowerCase().trim();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ============ INSTANCE METHODS ============

// /**
//  * METHOD: Check if category is general (shared)
//  * 
//  * Returns: Boolean
//  * 
//  * Usage:
//  * const isShared = category.isGeneralCategory();
//  */
// categorySchema.methods.isGeneralCategory = function () {
//   return this.isGeneral === true;
// };

// /**
//  * METHOD: Check if category belongs to user
//  * 
//  * Parameters:
//  * - userId: User ID to check
//  * 
//  * Returns: Boolean
//  * 
//  * Usage:
//  * if (category.belongsToUser(req.user._id)) { ... }
//  */
// categorySchema.methods.belongsToUser = function (userId) {
//   if (!this.userId || !userId) return false;
//   return this.userId.toString() === userId.toString();
// };

// /**
//  * METHOD: Check if category belongs to organization
//  * 
//  * Parameters:
//  * - orgId: Organization ID to check
//  * 
//  * Returns: Boolean
//  * 
//  * Usage:
//  * if (category.belongsToOrganization(orgId)) { ... }
//  */
// categorySchema.methods.belongsToOrganization = function (organizationId) {
//   if (!this.organizationId || !organizationId) return false;
//   return this.organizationId.toString() === organizationId.toString();
// };

// /**
//  * METHOD: Get category display name
//  * 
//  * Returns: String with proper capitalization
//  * 
//  * Usage:
//  * const displayName = category.getDisplayName(); // "Food" instead of "food"
//  */
// categorySchema.methods.getDisplayName = function () {
//   if (!this.name) return "Unknown";
//   return this.name.charAt(0).toUpperCase() + this.name.slice(1);
// };

// /**
//  * METHOD: Get context type
//  * 
//  * Returns: "general" | "solo" | "organization"
//  * 
//  * Usage:
//  * const contextType = category.getContextType();
//  */
// categorySchema.methods.getContextType = function () {
//   if (this.isGeneral) return "general";
//   if (this.userId) return "solo";
//   if (this.organizationId) return "organization";
//   return "unknown";
// };

// /**
//  * METHOD: Check if user can access this category
//  * 
//  * Parameters:
//  * - userId: User ID to check
//  * - userOrgId: Organization ID of user (optional)
//  * 
//  * Returns: Boolean
//  * 
//  * Usage:
//  * if (category.canUserAccess(req.user._id, req.context.organizationId)) { ... }
//  */
// categorySchema.methods.canUserAccess = function (userId, userOrgId = null) {
//   // General categories: accessible by everyone
//   if (this.isGeneral) return true;

//   // Solo categories: accessible by owner
//   if (this.userId && this.userId.toString() === userId.toString()) return true;

//   // Organization categories: accessible by org members
//   if (this.orgId && userOrgId && this.orgId.toString() === userOrgId.toString()) {
//     return true;
//   }

//   return false;
// };

// // ============ STATIC METHODS ============

// /**
//  * STATIC METHOD: Find categories for user (solo mode)
//  * 
//  * Includes both user-created and general categories
//  * 
//  * Parameters:
//  * - userId: User ID to fetch categories for
//  * 
//  * Returns: Promise<Array> of categories
//  * 
//  * Usage:
//  * const categories = await Category.findForUser(userId);
//  */
// categorySchema.statics.findForUser = function (userId) {
//   return this.find({
//     $or: [{ userId: userId }, { isGeneral: true }],
//   }).sort({ createdAt: -1 });
// };

// /**
//  * STATIC METHOD: Find categories for organization
//  * 
//  * Includes both org-created and general categories
//  * 
//  * Parameters:
//  * - orgId: Organization ID to fetch categories for
//  * 
//  * Returns: Promise<Array> of categories
//  * 
//  * Usage:
//  * const categories = await Category.findForOrganization(orgId);
//  */
// categorySchema.statics.findForOrganization = function (orgId) {
//   return this.find({
//     $or: [{ orgId: orgId }, { isGeneral: true }],
//   }).sort({ createdAt: -1 });
// };

// /**
//  * STATIC METHOD: Check if category name exists for user
//  * 
//  * Parameters:
//  * - userId: User ID
//  * - categoryName: Category name to check
//  * 
//  * Returns: Promise<Boolean>
//  * 
//  * Usage:
//  * const exists = await Category.existsForUser(userId, "food");
//  */
// categorySchema.statics.existsForUser = function (userId, categoryName) {
//   return this.findOne({
//     userId: userId,
//     name: categoryName.toLowerCase(),
//     isGeneral: false,
//   });
// };

// /**
//  * STATIC METHOD: Check if category name exists for organization
//  * 
//  * Parameters:
//  * - orgId: Organization ID
//  * - categoryName: Category name to check
//  * 
//  * Returns: Promise<Boolean>
//  * 
//  * Usage:
//  * const exists = await Category.existsForOrganization(orgId, "food");
//  */
// categorySchema.statics.existsForOrganization = function (orgId, categoryName) {
//   return this.findOne({
//     orgId: orgId,
//     name: categoryName.toLowerCase(),
//     isGeneral: false,
//   });
// };


export const Category = mongoose.model("Category", categorySchema);
