
export const getOwnerFilter = (req) => {
  if (req.context.type === "solo") {
    return { userId: req.user._id };
  }
  return { organizationId: req.context.organizationId };
};
