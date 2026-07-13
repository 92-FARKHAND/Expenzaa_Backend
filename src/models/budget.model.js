import mongoose, { Schema } from "mongoose";

const budgetSchema = new Schema(
  {
    totalAmount: {
      type: Schema.Types.Decimal128,
      required: true,
      default: 0,
    },
    spentAmount: {
      type: Schema.Types.Decimal128,
      default: 0,
    },
    remainingAmount: {
      type: Schema.Types.Decimal128,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: "USD",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default:null
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default:null

    },
  },
  { timestamps: true }
);

/*
 * Auto-calculate remaining amount before saving
 * Keeps remaining = total - spent
 */
budgetSchema.pre("save", function (next) {
  const total = parseFloat(this.totalAmount?.toString() || 0);
  const spent = parseFloat(this.spentAmount?.toString() || 0);
  this.remainingAmount = total - spent;
  next();
});





export const Budget = mongoose.model("Budget", budgetSchema);
