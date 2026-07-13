import mongoose, { Schema } from "mongoose"

const membershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "manager", "member"],
      default: "member",
      required: true
    },
    status: {
      type: String,
      enum: ["invited", "active", "suspended"],
      default: "active"
    }
  },
  { timestamps: true }
)

// Prevent duplicate membership
membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true })

export const Membership = mongoose.model("Membership", membershipSchema)
