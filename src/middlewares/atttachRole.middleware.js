import { Membership } from "../models/membership.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";

const attachContext = asyncHandler(async (req, res, next) => {
  const user = req.user;

  if (!user) throw new ApiError(401, "User not authenticated");

  // Solo mode
  if (user.currentContext.type === "solo") {
    req.context = { type: "solo" };
    req.userRole = "user"; // simple user in solo mode
  } else {
    // Organization mode
    const membership = await Membership.findOne({
      userId: user._id,
      organizationId: user.currentContext.organizationId,
      status: "active"
    });

    if (!membership) throw new ApiError(403, "Membership not active");

    req.context = {
      type: "organization",
      organizationId: user.currentContext.organizationId,
    };
    req.userRole = membership.role;
  }

  next();
});

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // Step 1: If in solo mode, allow access (user has full control)
    if (req.context.type === "solo") {
      return next();
    }

    // Step 2: If in organization mode, check role
    if (!allowedRoles.includes(req.userRole)) {
      return next(
        new ApiError(
          403,
          `This action requires one of these roles: ${allowedRoles.join(", ")}`
        )
      );
    }

    // Step 3: User has required role, proceed
    next();
  };
};

export { attachContext, requireRole };
